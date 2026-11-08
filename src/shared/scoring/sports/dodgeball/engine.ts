/**
 * Dodgeball scoring engine.
 *
 * Pure, event-sourced derivation: the full match state is recomputed by
 * folding the active event list (VOID excludes its target). Mirrors the
 * kho-kho / sepak-takraw engine contract and adds `getPlayerStats()` and
 * `statColumns()` for jersey-number-wise player tracking.
 *
 * Rulebook notes (all values are config-driven):
 * - 6 main + 4 substitutes, jerseys 1-99 (single or double digit); a team may take the court with 4.
 * - best of 3 sets of 3 minutes (configurable).
 * - tie after regulation -> 2-minute extra time -> sudden death (first point).
 * - a direct hit / line violation / red card / injury / delay awards a point
 *   and (except delay) puts the offender out.
 * - all six out -> +2 bonus (excluding the sixth-out point), then all six
 *   revive; failing to re-enter in 5 seconds awards the opponent a point.
 * - a clean catch puts the thrower out and revives one team-mate by default.
 * - substitutions are allowed only between sets (at an interval).
 */
import { ScoringRuleError, type ScoringTeamRef } from '../../types.ts';
import {
  DEFAULT_DODGEBALL_SCORING_CONFIG,
  type CreateDodgeballMatchInput,
  type DodgeballCardType,
  type DodgeballDelayType,
  type DodgeballLineupEvent,
  type DodgeballManualDecisionEvent,
  type DodgeballNextAction,
  type DodgeballOutReason,
  type DodgeballPauseReason,
  type DodgeballPhase,
  type DodgeballRevivalState,
  type DodgeballScoreEvent,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
  type DodgeballScoringState,
  type DodgeballSetEndReason,
  type DodgeballSetEntry,
  type DodgeballStatsRow,
  type DodgeballTeamState,
  type DodgeballTimePeriod,
  type DodgeballTimeState,
  type DodgeballTossEvent,
  type DodgeballWinnerEvaluation,
} from './types.ts';

export interface DodgeballStatColumn {
  key: string;
  label: string;
  kind: 'count';
  align: 'end';
}

type DerivedLineup = {
  onCourt: string[];
  subs: string[];
};

type PlayerStatus = {
  active: boolean;
  outReason: DodgeballOutReason | null;
  outAtMs: number | null;
};

type PauseInterval = {
  startMs: number;
  endMs: number | null;
};

type DerivedSet = {
  setNo: number;
  points: Record<string, number>;
  winnerTeamId: string | null;
  completed: boolean;
  startedAtMs: number;
  endedAtMs: number | null;
  extraTime: boolean;
  extraTimeStartedAtMs: number | null;
  suddenDeath: boolean;
  suddenDeathStartedAtMs: number | null;
  pauses: PauseInterval[];
  players: Record<string, Record<string, PlayerStatus>>;
  outOrder: Record<string, string[]>;
  allOutCount: Record<string, number>;
  revivalPendingTeamId: string | null;
  revivalDeadlineMs: number | null;
  lastEventId: string | null;
};

type DerivedMatch = {
  toss: DodgeballTossEvent | null;
  lineups: Map<string, DerivedLineup>;
  lineupHistory: Map<string, Set<string>>;
  disqualified: Set<string>;
  yellowCards: Set<string>;
  sets: DerivedSet[];
  currentSet: DerivedSet | null;
  manual: DodgeballManualDecisionEvent | null;
  activeCount: number;
  voidedCount: number;
};

const CARD_TYPES: DodgeballCardType[] = ['YELLOW', 'RED'];
const DELAY_TYPES: DodgeballDelayType[] = ['FIVE_SECOND', 'THREE_SECOND'];
const PAUSE_REASONS: DodgeballPauseReason[] = ['INJURY', 'OFFICIAL'];
const SET_END_REASONS: DodgeballSetEndReason[] = ['TIMER', 'MANUAL'];

function playerKey(teamId: string, playerId: string): string {
  return `${teamId}:${playerId}`;
}

/** Anonymous on-court slots — the DSO game does not use jersey numbers. */
function defaultPlayerIds(count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => `p${index + 1}`);
}

function emptyPoints(teams: ScoringTeamRef[]): Record<string, number> {
  const points: Record<string, number> = {};
  for (const team of teams) points[team.id] = 0;
  return points;
}

function rivalOf(teams: ScoringTeamRef[], teamId: string): string {
  const rival = teams.find((team) => team.id !== teamId);
  if (!rival) {
    throw new ScoringRuleError('TEAM_NOT_FOUND', `No rival team found for "${teamId}".`);
  }
  return rival.id;
}

function isValidJersey(value: unknown, config: DodgeballScoringConfig): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)) return false;
  const number = Number(value);
  return number >= config.jerseyMin && number <= config.jerseyMax;
}

function isPaused(set: DerivedSet): boolean {
  return set.pauses.some((pause) => pause.endMs === null);
}

function pausedOverlapMs(set: DerivedSet, fromMs: number, toMs: number): number {
  let total = 0;
  for (const pause of set.pauses) {
    const start = Math.max(fromMs, pause.startMs);
    const end = Math.min(toMs, pause.endMs ?? toMs);
    if (end > start) total += end - start;
  }
  return total;
}

function timeStateOf(
  set: DerivedSet,
  config: DodgeballScoringConfig,
  atMs: number,
): DodgeballTimeState {
  if (set.completed) {
    return { period: 'ended', remainingMs: 0, expired: true, paused: false };
  }
  const paused = isPaused(set);
  if (set.suddenDeath) {
    return { period: 'sudden_death', remainingMs: null, expired: false, paused };
  }
  if (set.extraTime && set.extraTimeStartedAtMs !== null) {
    const elapsed = Math.max(
      0,
      atMs - set.extraTimeStartedAtMs - pausedOverlapMs(set, set.extraTimeStartedAtMs, atMs),
    );
    const remaining = Math.max(0, config.extraTimeSec * 1000 - elapsed);
    return {
      period: 'extra_time',
      remainingMs: remaining,
      expired: remaining <= 0,
      paused,
    };
  }
  const elapsed = Math.max(
    0,
    atMs - set.startedAtMs - pausedOverlapMs(set, set.startedAtMs, atMs),
  );
  const remaining = Math.max(0, config.setDurationSec * 1000 - elapsed);
  return {
    period: 'regulation',
    remainingMs: remaining,
    expired: remaining <= 0,
    paused,
  };
}

function activePlayersOf(set: DerivedSet, teamId: string): string[] {
  const statuses = set.players[teamId] ?? {};
  return Object.keys(statuses).filter((playerId) => statuses[playerId].active);
}

function outPlayersOf(set: DerivedSet, teamId: string): string[] {
  return set.outOrder[teamId] ?? [];
}

function revivableOutPlayersOf(d: DerivedMatch, set: DerivedSet, teamId: string): string[] {
  return outPlayersOf(set, teamId).filter(
    (playerId) => !d.disqualified.has(playerKey(teamId, playerId)),
  );
}

function markOut(
  set: DerivedSet,
  teamId: string,
  playerId: string,
  reason: DodgeballOutReason,
  atMs: number,
): void {
  const status = set.players[teamId]?.[playerId];
  if (!status) {
    throw new ScoringRuleError('PLAYER_NOT_FOUND', `Jersey #${playerId} is not in this lineup.`);
  }
  if (!status.active) {
    throw new ScoringRuleError('PLAYER_ALREADY_OUT', `Jersey #${playerId} is already out.`);
  }
  status.active = false;
  status.outReason = reason;
  status.outAtMs = atMs;
  const order = set.outOrder[teamId] ?? [];
  order.push(playerId);
  set.outOrder[teamId] = order;
}

function revivePlayers(set: DerivedSet, teamId: string, playerIds: string[]): void {
  const statuses = set.players[teamId] ?? {};
  for (const playerId of playerIds) {
    const status = statuses[playerId];
    if (status && !status.active) {
      status.active = true;
      status.outReason = null;
      status.outAtMs = null;
    }
  }
  const revived = new Set(playerIds);
  set.outOrder[teamId] = (set.outOrder[teamId] ?? []).filter(
    (playerId) => !revived.has(playerId),
  );
}

function completeSet(
  d: DerivedMatch,
  set: DerivedSet,
  winnerTeamId: string,
  atMs: number,
): void {
  set.completed = true;
  set.winnerTeamId = winnerTeamId;
  set.endedAtMs = atMs;
  set.revivalPendingTeamId = null;
  set.revivalDeadlineMs = null;
  if (d.currentSet === set) d.currentSet = null;
}

/** Close a level set as a draw (no set point is awarded). */
function drawSet(d: DerivedMatch, set: DerivedSet, atMs: number): void {
  set.completed = true;
  set.winnerTeamId = null;
  set.endedAtMs = atMs;
  set.revivalPendingTeamId = null;
  set.revivalDeadlineMs = null;
  if (d.currentSet === set) d.currentSet = null;
}

function handleAllOut(
  d: DerivedMatch,
  set: DerivedSet,
  teamId: string,
  atMs: number,
  state: DodgeballScoringState,
): void {
  if (set.completed) return;
  const rival = rivalOf(state.teams, teamId);
  const count = (set.allOutCount[teamId] ?? 0) + 1;
  set.allOutCount[teamId] = count;
  if (state.config.allOutBonusRepeats || count === 1) {
    set.points[rival] = (set.points[rival] ?? 0) + state.config.allOutBonusPoints;
  }
  const revivable = revivableOutPlayersOf(d, set, teamId);
  if (revivable.length === 0) {
    // Every remaining player is disqualified: the set is forfeited.
    completeSet(d, set, rival, atMs);
    return;
  }
  set.revivalPendingTeamId = teamId;
  set.revivalDeadlineMs = atMs + state.config.revivalWindowSec * 1000;
}

function pointsTied(set: DerivedSet, teams: ScoringTeamRef[]): boolean {
  if (teams.length < 2) return false;
  const first = set.points[teams[0].id] ?? 0;
  return teams.every((team) => (set.points[team.id] ?? 0) === first);
}

function setWinsOf(d: DerivedMatch, teams: ScoringTeamRef[]): Record<string, number> {
  const wins = emptyPoints(teams);
  for (const set of d.sets) {
    if (set.completed && set.winnerTeamId) {
      wins[set.winnerTeamId] = (wins[set.winnerTeamId] ?? 0) + 1;
    }
  }
  return wins;
}

function winnerOf(d: DerivedMatch, state: DodgeballScoringState): DodgeballWinnerEvaluation {
  const wins = setWinsOf(d, state.teams);
  if (d.manual) {
    return {
      resolved: true,
      winnerTeamId: d.manual.winnerTeamId,
      kind: 'manual',
      label: 'WON BY DECISION',
      scores: wins,
      setWins: wins,
    };
  }

  const completedSets = d.sets.filter((set) => set.completed);
  const regulationSets = Math.max(1, state.config.regulationSets);
  if (completedSets.length < regulationSets) {
    return {
      resolved: false,
      winnerTeamId: null,
      kind: null,
      label: '',
      scores: wins,
      setWins: wins,
    };
  }

  const counts = state.teams.map((team) => wins[team.id] ?? 0);
  const best = Math.max(...counts);
  const leaders = state.teams.filter((team) => (wins[team.id] ?? 0) === best);

  if (leaders.length !== 1) {
    // DSO rule: if the two regulation sets leave the match level, play one
    // deciding set. If the decider is also drawn, the match is a draw.
    if (state.config.decidingSetOnTie && completedSets.length === regulationSets) {
      return {
        resolved: false,
        winnerTeamId: null,
        kind: null,
        label: '',
        scores: wins,
        setWins: wins,
      };
    }
    return {
      resolved: true,
      winnerTeamId: null,
      kind: 'draw',
      label: 'MATCH DRAWN',
      scores: wins,
      setWins: wins,
    };
  }

  const winner = leaders[0];
  const count = wins[winner.id] ?? 0;
  return {
    resolved: true,
    winnerTeamId: winner.id,
    kind: 'sets',
    label: `WON BY ${count} ${count === 1 ? 'SET' : 'SETS'}`,
    scores: wins,
    setWins: wins,
  };
}

function teamsNeedingLineup(d: DerivedMatch, state: DodgeballScoringState): string[] {
  const missing: string[] = [];
  for (const team of state.teams) {
    const lineup = d.lineups.get(team.id);
    if (!lineup) {
      missing.push(team.id);
      continue;
    }
    if (lineup.onCourt.length < state.config.minPlayersToStart) {
      missing.push(team.id);
      continue;
    }
    const squad = [...lineup.onCourt, ...lineup.subs];
    if (squad.some((playerId) => d.disqualified.has(playerKey(team.id, playerId)))) {
      missing.push(team.id);
    }
  }
  return missing;
}

function activeView(events: DodgeballScoreEvent[]): {
  active: DodgeballScoreEvent[];
  voidedIds: Set<string>;
} {
  const voidedIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'VOID') voidedIds.add(event.targetEventId);
  }
  const active = events.filter((event) => !voidedIds.has(event.eventId));
  return { active, voidedIds };
}

function deriveMatch(state: DodgeballScoringState): DerivedMatch {
  const d: DerivedMatch = {
    toss: null,
    lineups: new Map<string, DerivedLineup>(),
    lineupHistory: new Map<string, Set<string>>(),
    disqualified: new Set<string>(),
    yellowCards: new Set<string>(),
    sets: [],
    currentSet: null,
    manual: null,
    activeCount: 0,
    voidedCount: 0,
  };

  const view = activeView(state.events);
  d.activeCount = view.active.length;
  d.voidedCount = state.events.length - view.active.length;

  const rememberLineup = (teamId: string, lineup: DerivedLineup): void => {
    const history = d.lineupHistory.get(teamId) ?? new Set<string>();
    for (const playerId of lineup.onCourt) history.add(playerId);
    for (const playerId of lineup.subs) history.add(playerId);
    d.lineupHistory.set(teamId, history);
  };

  // DSO dodgeball has no jersey numbers and no lineup screen: every team
  // starts with six anonymous slots. Legacy LINEUP_SET events still override
  // these defaults when an older session is replayed.
  for (const team of state.teams) {
    const lineup: DerivedLineup = {
      onCourt: defaultPlayerIds(state.config.playersOnCourt),
      subs: [],
    };
    d.lineups.set(team.id, lineup);
    rememberLineup(team.id, lineup);
  }

  const applyPrimaryScore = (
    set: DerivedSet,
    scoringTeamId: string,
    amount: number,
  ): void => {
    set.points[scoringTeamId] = (set.points[scoringTeamId] ?? 0) + amount;
  };

  for (const event of view.active) {
    switch (event.type) {
      case 'VOID':
        break;

      case 'TOSS': {
        d.toss = event;
        break;
      }

      case 'LINEUP_SET': {
        const lineup: DerivedLineup = {
          onCourt: [...event.onCourt],
          subs: [...event.subs],
        };
        d.lineups.set(event.teamId, lineup);
        rememberLineup(event.teamId, lineup);
        break;
      }

      case 'SUBSTITUTION': {
        const lineup = d.lineups.get(event.teamId);
        if (!lineup) break;
        const slotIndex = lineup.onCourt.indexOf(event.outPlayerId);
        const subIndex = lineup.subs.indexOf(event.inPlayerId);
        if (slotIndex < 0 || subIndex < 0) break;
        lineup.onCourt[slotIndex] = event.inPlayerId;
        lineup.subs.splice(subIndex, 1);
        lineup.subs.push(event.outPlayerId);
        const history = d.lineupHistory.get(event.teamId) ?? new Set<string>();
        history.add(event.inPlayerId);
        history.add(event.outPlayerId);
        d.lineupHistory.set(event.teamId, history);
        break;
      }

      case 'SET_START': {
        const points = emptyPoints(state.teams);
        const players: Record<string, Record<string, PlayerStatus>> = {};
        const outOrder: Record<string, string[]> = {};
        const allOutCount: Record<string, number> = {};
        for (const team of state.teams) {
          const lineup = d.lineups.get(team.id);
          const statuses: Record<string, PlayerStatus> = {};
          for (const playerId of lineup?.onCourt ?? []) {
            statuses[playerId] = { active: true, outReason: null, outAtMs: null };
          }
          players[team.id] = statuses;
          outOrder[team.id] = [];
          allOutCount[team.id] = 0;
        }
        const set: DerivedSet = {
          setNo: event.setNo,
          points,
          winnerTeamId: null,
          completed: false,
          startedAtMs: event.atMs,
          endedAtMs: null,
          extraTime: false,
          extraTimeStartedAtMs: null,
          suddenDeath: false,
          suddenDeathStartedAtMs: null,
          pauses: [],
          players,
          outOrder,
          allOutCount,
          revivalPendingTeamId: null,
          revivalDeadlineMs: null,
          lastEventId: event.eventId,
        };
        d.sets.push(set);
        d.currentSet = set;
        break;
      }

      case 'TEAM_POINT': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const points =
          typeof event.points === 'number' && Number.isFinite(event.points) && event.points > 0
            ? Math.floor(event.points)
            : 1;
        applyPrimaryScore(set, event.teamId, points);
        set.lastEventId = event.eventId;
        if (set.suddenDeath) completeSet(d, set, event.teamId, event.atMs);
        break;
      }

      case 'HIT':
      case 'LINE_OUT': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const rival = rivalOf(state.teams, event.teamId);
        const target = set.players[rival]?.[event.targetPlayerId];
        if (!target || !target.active) break;
        markOut(
          set,
          rival,
          event.targetPlayerId,
          event.type === 'HIT' ? 'HIT' : 'LINE_OUT',
          event.atMs,
        );
        applyPrimaryScore(
          set,
          event.teamId,
          event.type === 'HIT' ? state.config.hitPoints : state.config.lineOutPoints,
        );
        set.lastEventId = event.eventId;
        if (set.suddenDeath) {
          completeSet(d, set, event.teamId, event.atMs);
          break;
        }
        if (activePlayersOf(set, rival).length === 0) {
          handleAllOut(d, set, rival, event.atMs, state);
        }
        break;
      }

      case 'CATCH': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        if (state.config.catchOutsThrower && event.throwerPlayerId) {
          const thrower = set.players[event.throwerTeamId]?.[event.throwerPlayerId];
          if (thrower && thrower.active) {
            markOut(set, event.throwerTeamId, event.throwerPlayerId, 'CATCH', event.atMs);
          }
        }
        if (state.config.catchRevivesTeammate) {
          let reviveId = event.revivePlayerId ?? null;
          if (!reviveId) {
            const out = revivableOutPlayersOf(d, set, event.teamId);
            reviveId = out[0] ?? null;
          }
          if (
            reviveId &&
            !set.players[event.teamId]?.[reviveId]?.active &&
            !d.disqualified.has(playerKey(event.teamId, reviveId))
          ) {
            revivePlayers(set, event.teamId, [reviveId]);
          }
        }
        set.lastEventId = event.eventId;
        if (
          !set.suddenDeath &&
          state.config.catchOutsThrower &&
          event.throwerPlayerId &&
          activePlayersOf(set, event.throwerTeamId).length === 0
        ) {
          handleAllOut(d, set, event.throwerTeamId, event.atMs, state);
        }
        break;
      }

      case 'CARD': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const key = playerKey(event.teamId, event.playerId);
        if (event.cardType === 'YELLOW') {
          d.yellowCards.add(key);
        } else {
          d.disqualified.add(key);
          const player = set.players[event.teamId]?.[event.playerId];
          if (player && player.active) {
            markOut(set, event.teamId, event.playerId, 'RED_CARD', event.atMs);
          }
          const rival = rivalOf(state.teams, event.teamId);
          applyPrimaryScore(set, rival, state.config.redCardPoints);
          set.lastEventId = event.eventId;
          if (set.suddenDeath) {
            completeSet(d, set, rival, event.atMs);
            break;
          }
          if (activePlayersOf(set, event.teamId).length === 0) {
            handleAllOut(d, set, event.teamId, event.atMs, state);
          }
          break;
        }
        set.lastEventId = event.eventId;
        break;
      }

      case 'INJURY': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const player = set.players[event.teamId]?.[event.playerId];
        if (!player || !player.active) break;
        markOut(set, event.teamId, event.playerId, 'INJURY', event.atMs);
        const rival = rivalOf(state.teams, event.teamId);
        applyPrimaryScore(set, rival, state.config.injuryOutPoints);
        set.lastEventId = event.eventId;
        if (set.suddenDeath) {
          completeSet(d, set, rival, event.atMs);
          break;
        }
        if (activePlayersOf(set, event.teamId).length === 0) {
          handleAllOut(d, set, event.teamId, event.atMs, state);
        }
        break;
      }

      case 'DELAY': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const rival = rivalOf(state.teams, event.teamId);
        applyPrimaryScore(set, rival, state.config.delayPenaltyPoints);
        set.lastEventId = event.eventId;
        if (set.suddenDeath) {
          completeSet(d, set, rival, event.atMs);
        }
        break;
      }

      case 'REVIVE': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        if (set.revivalPendingTeamId !== event.teamId) break;
        const revivable = revivableOutPlayersOf(d, set, event.teamId);
        const requested = new Set(event.playerIds);
        const expected = new Set(revivable);
        if (
          requested.size === expected.size &&
          revivable.every((playerId) => requested.has(playerId))
        ) {
          revivePlayers(set, event.teamId, revivable);
        } else {
          revivePlayers(
            set,
            event.teamId,
            event.playerIds.filter((playerId) => !d.disqualified.has(playerKey(event.teamId, playerId))),
          );
        }
        if (activePlayersOf(set, event.teamId).length > 0) {
          set.revivalPendingTeamId = null;
          set.revivalDeadlineMs = null;
        }
        set.lastEventId = event.eventId;
        break;
      }

      case 'REVIVAL_FAILED': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        if (set.revivalPendingTeamId !== event.teamId) break;
        const rival = rivalOf(state.teams, event.teamId);
        applyPrimaryScore(set, rival, state.config.revivalFailurePoints);
        const revivable = revivableOutPlayersOf(d, set, event.teamId);
        if (revivable.length > 0) {
          revivePlayers(set, event.teamId, revivable);
        }
        set.revivalPendingTeamId = null;
        set.revivalDeadlineMs = null;
        set.lastEventId = event.eventId;
        if (set.suddenDeath) {
          completeSet(d, set, rival, event.atMs);
        } else if (activePlayersOf(set, event.teamId).length === 0) {
          completeSet(d, set, rival, event.atMs);
        }
        break;
      }

      case 'PAUSE': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        set.pauses.push({ startMs: event.atMs, endMs: null });
        set.lastEventId = event.eventId;
        break;
      }

      case 'RESUME': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        for (let index = set.pauses.length - 1; index >= 0; index -= 1) {
          if (set.pauses[index].endMs === null) {
            set.pauses[index].endMs = event.atMs;
            break;
          }
        }
        set.lastEventId = event.eventId;
        break;
      }

      case 'SET_END': {
        const set = d.currentSet;
        if (!set || set.completed) break;
        const winner = leaderOf(set, state.teams);
        if (winner) {
          completeSet(d, set, winner, event.atMs);
        } else {
          // Level set: record the draw, no set point to either team.
          drawSet(d, set, event.atMs);
        }
        break;
      }

      case 'EXTRA_TIME_START': {
        const set = d.currentSet;
        if (!set || set.completed || set.extraTime) break;
        set.extraTime = true;
        set.extraTimeStartedAtMs = event.atMs;
        set.lastEventId = event.eventId;
        break;
      }

      case 'SUDDEN_DEATH_START': {
        const set = d.currentSet;
        if (!set || set.completed || set.suddenDeath) break;
        set.suddenDeath = true;
        set.suddenDeathStartedAtMs = event.atMs;
        set.lastEventId = event.eventId;
        break;
      }

      case 'MANUAL_DECISION': {
        d.manual = event;
        break;
      }

      default:
        break;
    }
  }

  return d;
}

function phaseOf(
  d: DerivedMatch,
  state: DodgeballScoringState,
  nowMs: number,
): DodgeballPhase {
  if (winnerOf(d, state).resolved) return 'completed';
  const set = d.currentSet;
  if (set) {
    if (set.revivalPendingTeamId) return 'awaiting_revival';
    const time = timeStateOf(set, state.config, nowMs);
    if (time.paused) return 'set_paused';
    if (set.suddenDeath) return 'sudden_death';
    if (set.extraTime) return 'extra_time';
    return 'set_live';
  }
  if (d.sets.length === 0) return 'awaiting_set_start';
  return 'set_break';
}

function leaderOf(set: DerivedSet, teams: ScoringTeamRef[]): string | null {
  if (pointsTied(set, teams)) return null;
  let leader = teams[0]?.id ?? null;
  let best = leader ? set.points[leader] ?? 0 : 0;
  for (const team of teams) {
    const points = set.points[team.id] ?? 0;
    if (points > best) {
      best = points;
      leader = team.id;
    }
  }
  return leader;
}

function nextActionOf(
  d: DerivedMatch,
  state: DodgeballScoringState,
  nowMs: number,
): DodgeballNextAction {
  const winner = winnerOf(d, state);
  if (winner.resolved) return { action: 'completed', winner };

  const set = d.currentSet;
  if (set) {
    if (set.revivalPendingTeamId) {
      const teamId = set.revivalPendingTeamId;
      const outPlayerIds = revivableOutPlayersOf(d, set, teamId);
      const deadlineAtMs = set.revivalDeadlineMs ?? nowMs;
      return {
        action: 'require_revival',
        teamId,
        outPlayerIds,
        deadlineAtMs,
        remainingMs: Math.max(0, deadlineAtMs - nowMs),
      };
    }
    const time = timeStateOf(set, state.config, nowMs);
    if (time.paused) {
      return { action: 'set_paused', remainingMs: time.remainingMs, period: time.period };
    }
    if (set.suddenDeath) return { action: 'sudden_death', setNo: set.setNo };
    if (time.expired) {
      // DSO rule: a level set is recorded as a draw; there is no extra time.
      return { action: 'end_set', setNo: set.setNo };
    }
    return { action: 'record_events', setNo: set.setNo };
  }

  const nextSetNo = d.sets.length + 1;
  const regulationSets = Math.max(1, state.config.regulationSets);
  const maxSets = regulationSets + (state.config.decidingSetOnTie ? 1 : 0);
  if (nextSetNo > maxSets) {
    return { action: 'completed', winner };
  }
  return {
    action: 'start_set',
    setNo: nextSetNo,
    deciding: nextSetNo > regulationSets,
  };
}

function setEntryOf(
  set: DerivedSet,
  config: DodgeballScoringConfig,
  nowMs: number,
): DodgeballSetEntry {
  const time = timeStateOf(set, config, nowMs);
  return {
    setNo: set.setNo,
    points: { ...set.points },
    winnerTeamId: set.winnerTeamId,
    completed: set.completed,
    startedAtMs: set.startedAtMs,
    endedAtMs: set.endedAtMs,
    remainingMs: set.completed ? 0 : time.remainingMs,
    period: set.completed ? 'ended' : time.period,
    extraTime: set.extraTime,
    suddenDeath: set.suddenDeath,
    allOutCount: { ...set.allOutCount },
  };
}

function getScoreboardInternal(
  state: DodgeballScoringState,
  nowMs: number,
): DodgeballScoreboard {
  const d = deriveMatch(state);
  const winner = winnerOf(d, state);
  const current = d.currentSet;
  const lastSet = d.sets.length > 0 ? d.sets[d.sets.length - 1] : null;
  const setWins = setWinsOf(d, state.teams);
  const setNo = current
    ? current.setNo
    : winner.resolved
      ? Math.max(1, d.sets.length)
      : d.sets.length + 1;
  const points = current
    ? { ...current.points }
    : lastSet
      ? { ...lastSet.points }
      : emptyPoints(state.teams);
  const time = current ? timeStateOf(current, state.config, nowMs) : null;

  const teamStates: DodgeballTeamState[] = state.teams.map((team) => {
    const lineup = d.lineups.get(team.id);
    const onCourt = current
      ? Object.keys(current.players[team.id] ?? {})
      : [...(lineup?.onCourt ?? [])];
    const subs = [...(lineup?.subs ?? [])];
    let activePlayerIds: string[] = [...onCourt];
    let outPlayerIds: string[] = [];
    if (current) {
      activePlayerIds = activePlayersOf(current, team.id);
      outPlayerIds = outPlayersOf(current, team.id);
    }
    const disqualifiedPlayerIds = onCourt.filter((playerId) =>
      d.disqualified.has(playerKey(team.id, playerId)),
    );
    return {
      teamId: team.id,
      teamName: team.name,
      points: points[team.id] ?? 0,
      setWins: setWins[team.id] ?? 0,
      balls: state.config.ballsPerTeam,
      onCourt,
      subs,
      activePlayerIds,
      outPlayerIds,
      disqualifiedPlayerIds,
      activeCount: activePlayerIds.length,
      revivalPending: current?.revivalPendingTeamId === team.id,
    };
  });

  let revival: DodgeballRevivalState | null = null;
  if (current?.revivalPendingTeamId) {
    const teamId = current.revivalPendingTeamId;
    const team = state.teams.find((entry) => entry.id === teamId);
    const deadlineAtMs = current.revivalDeadlineMs ?? nowMs;
    revival = {
      teamId,
      teamName: team?.name ?? teamId,
      outPlayerIds: revivableOutPlayersOf(d, current, teamId),
      deadlineAtMs,
      remainingMs: Math.max(0, deadlineAtMs - nowMs),
    };
  }

  return {
    sport: 'dodgeball',
    teams: state.teams.map((team) => ({ id: team.id, name: team.name })),
    phase: phaseOf(d, state, nowMs),
    setNo,
    sets: d.sets.map((set) => setEntryOf(set, state.config, nowMs)),
    setWins,
    points,
    time,
    teamStates,
    revival,
    winner,
    nextAction: nextActionOf(d, state, nowMs),
    activeEventCount: d.activeCount,
    voidedEventCount: d.voidedCount,
  };
}

function validateLineup(
  event: DodgeballLineupEvent,
  config: DodgeballScoringConfig,
  disqualified: Set<string>,
): void {
  if (!Array.isArray(event.onCourt)) {
    throw new ScoringRuleError('BAD_LINEUP', 'onCourt must be an array of jersey numbers.');
  }
  if (
    event.onCourt.length < config.minPlayersToStart ||
    event.onCourt.length > config.playersOnCourt
  ) {
    throw new ScoringRuleError(
      'BAD_LINEUP',
      `A lineup needs ${config.minPlayersToStart}-${config.playersOnCourt} players on court, received ${event.onCourt.length}.`,
    );
  }
  const squad = new Set<string>();
  for (const playerId of event.onCourt) {
    if (!isValidJersey(playerId, config)) {
      throw new ScoringRuleError(
        'BAD_JERSEY',
        `Jersey numbers must be ${config.jerseyMin}-${config.jerseyMax}.`,
      );
    }
    if (squad.has(playerId)) {
      throw new ScoringRuleError('BAD_LINEUP', `Jersey #${playerId} appears twice.`);
    }
    if (disqualified.has(playerKey(event.teamId, playerId))) {
      throw new ScoringRuleError(
        'PLAYER_DISQUALIFIED',
        `Jersey #${playerId} was ordered off and cannot return.`,
      );
    }
    squad.add(playerId);
  }
  if (!Array.isArray(event.subs)) {
    throw new ScoringRuleError('BAD_LINEUP', 'subs must be an array of jersey numbers.');
  }
  if (event.subs.length > config.maxSubstitutes) {
    throw new ScoringRuleError(
      'BAD_LINEUP',
      `At most ${config.maxSubstitutes} substitutes are allowed.`,
    );
  }
  for (const playerId of event.subs) {
    if (!isValidJersey(playerId, config)) {
      throw new ScoringRuleError(
        'BAD_JERSEY',
        `Jersey numbers must be ${config.jerseyMin}-${config.jerseyMax}.`,
      );
    }
    if (squad.has(playerId)) {
      throw new ScoringRuleError(
        'BAD_LINEUP',
        `Jersey #${playerId} is duplicated or already on court.`,
      );
    }
    if (disqualified.has(playerKey(event.teamId, playerId))) {
      throw new ScoringRuleError(
        'PLAYER_DISQUALIFIED',
        `Jersey #${playerId} was ordered off and cannot return.`,
      );
    }
    squad.add(playerId);
  }
  if (squad.size > config.maxRosterSize) {
    throw new ScoringRuleError(
      'BAD_LINEUP',
      `A squad can name at most ${config.maxRosterSize} players.`,
    );
  }
}

function requirePlayableSet(
  d: DerivedMatch,
  config: DodgeballScoringConfig,
  atMs: number,
): DerivedSet {
  const set = d.currentSet;
  if (!set) {
    throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live. Start a set first.');
  }
  if (set.completed) {
    throw new ScoringRuleError('SET_ALREADY_COMPLETE', 'This set is already complete.');
  }
  if (set.revivalPendingTeamId) {
    throw new ScoringRuleError(
      'REVIVAL_PENDING',
      'Resolve the revival (all six back in or revival failed) before recording another action.',
    );
  }
  const time = timeStateOf(set, config, atMs);
  if (time.paused) {
    throw new ScoringRuleError('SET_PAUSED', 'The clock is stopped. Resume play first.');
  }
  if (!set.suddenDeath && time.expired) {
    throw new ScoringRuleError(
      'SET_TIME_EXPIRED',
      'Set time is over. End the set (or start extra time when the scores are tied).',
    );
  }
  return set;
}

function assertActivePlayer(
  set: DerivedSet,
  teamId: string,
  playerId: string | undefined,
  code = 'PLAYER_NOT_ON_COURT',
  message = 'The player must be on court and not out.',
): void {
  if (!playerId) return;
  const status = set.players[teamId]?.[playerId];
  if (!status) {
    throw new ScoringRuleError(code, `Jersey #${playerId} is not in this lineup.`);
  }
  if (!status.active) {
    throw new ScoringRuleError(code, `Jersey #${playerId} is already out.`);
  }
}

function validateEventInternal(
  state: DodgeballScoringState,
  candidate: DodgeballScoreEvent,
): void {
  if (!candidate || typeof candidate !== 'object') {
    throw new ScoringRuleError('MALFORMED_EVENT', 'Event payload is missing.');
  }
  if (!candidate.eventId) {
    throw new ScoringRuleError('MALFORMED_EVENT', 'eventId is required.');
  }
  if (!Number.isFinite(candidate.atMs)) {
    throw new ScoringRuleError('MALFORMED_EVENT', 'atMs must be a number.');
  }
  const previousEvent = state.events.length > 0 ? state.events[state.events.length - 1] : null;
  if (previousEvent && candidate.atMs < previousEvent.atMs) {
    throw new ScoringRuleError(
      'TIMESTAMP_OUT_OF_ORDER',
      'Event time is before the last recorded event.',
    );
  }

  const d = deriveMatch(state);
  const view = activeView(state.events);
  const knownTeam = (teamId: string | undefined | null): boolean =>
    typeof teamId === 'string' && state.teams.some((team) => team.id === teamId);

  const winner = winnerOf(d, state);
  if (winner.resolved && candidate.type !== 'VOID') {
    throw new ScoringRuleError(
      'MATCH_COMPLETED',
      `The match is already completed (${winner.label || winner.winnerTeamId}).`,
    );
  }

  switch (candidate.type) {
    case 'TOSS': {
      if (!knownTeam(candidate.winnerTeamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Toss winner is not part of this match.');
      }
      if (candidate.choice !== undefined && candidate.choice !== 'COURT') {
        throw new ScoringRuleError('MALFORMED_EVENT', 'The toss winner chooses the court only.');
      }
      if (d.toss) {
        throw new ScoringRuleError('TOSS_ALREADY_SET', 'The toss is already recorded.');
      }
      if (d.sets.length > 0) {
        throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'The toss cannot be recorded now.');
      }
      return;
    }

    case 'LINEUP_SET': {
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Lineup team is not part of this match.');
      }
      if (d.currentSet) {
        throw new ScoringRuleError(
          'BAD_LINEUP',
          'Lineups can only change before a set or during a set interval; use a substitution at the interval.',
        );
      }
      validateLineup(candidate, state.config, d.disqualified);
      return;
    }

    case 'SUBSTITUTION': {
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Substitution team is not part of this match.');
      }
      if (d.currentSet) {
        throw new ScoringRuleError(
          'SUBSTITUTION_NOT_ALLOWED',
          'Substitutions are allowed only during a set interval.',
        );
      }
      if (d.sets.length === 0) {
        throw new ScoringRuleError(
          'SUBSTITUTION_NOT_ALLOWED',
          'Name the first lineup before the match; substitutions start at the first interval.',
        );
      }
      const lineup = d.lineups.get(candidate.teamId);
      if (!lineup) {
        throw new ScoringRuleError('LINEUP_REQUIRED', 'Set the team lineup before substituting.');
      }
      if (!candidate.outPlayerId || !candidate.inPlayerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'A substitution needs both jerseys.');
      }
      if (candidate.outPlayerId === candidate.inPlayerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Use two different jerseys for a substitution.');
      }
      if (!lineup.onCourt.includes(candidate.outPlayerId)) {
        throw new ScoringRuleError('PLAYER_NOT_ON_COURT', 'The outgoing player is not on court.');
      }
      if (!lineup.subs.includes(candidate.inPlayerId)) {
        throw new ScoringRuleError('PLAYER_NOT_A_SUB', 'The incoming player is not a substitute.');
      }
      if (d.disqualified.has(playerKey(candidate.teamId, candidate.outPlayerId))) {
        throw new ScoringRuleError(
          'PLAYER_DISQUALIFIED',
          'A player ordered off cannot be substituted; replace them with a new lineup.',
        );
      }
      if (d.disqualified.has(playerKey(candidate.teamId, candidate.inPlayerId))) {
        throw new ScoringRuleError(
          'PLAYER_DISQUALIFIED',
          'A player ordered off cannot return to the squad.',
        );
      }
      return;
    }

    case 'SET_START': {
      if (d.currentSet) {
        throw new ScoringRuleError('SET_ALREADY_LIVE', 'A set is already live.');
      }
      const expected = d.sets.length + 1;
      if (candidate.setNo !== expected) {
        throw new ScoringRuleError(
          'SET_NO_MISMATCH',
          `Set ${candidate.setNo} cannot start; the next set is ${expected}.`,
        );
      }
      const regulationSets = Math.max(1, state.config.regulationSets);
      const maxSets = regulationSets + (state.config.decidingSetOnTie ? 1 : 0);
      if (expected > maxSets) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'The match has no further sets.');
      }
      const missing = teamsNeedingLineup(d, state);
      if (missing.length > 0) {
        throw new ScoringRuleError(
          'LINEUP_REQUIRED',
          `Set a valid lineup for: ${missing.join(', ')}.`,
        );
      }
      return;
    }

    case 'TEAM_POINT': {
      requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Scoring team is not part of this match.');
      }
      if (
        candidate.points !== undefined &&
        (!Number.isFinite(candidate.points) ||
          candidate.points <= 0 ||
          !Number.isInteger(candidate.points))
      ) {
        throw new ScoringRuleError(
          'MALFORMED_EVENT',
          'Team points must be a positive whole number.',
        );
      }
      return;
    }

    case 'HIT':
    case 'LINE_OUT': {
      const set = requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Scoring team is not part of this match.');
      }
      if (!candidate.targetPlayerId || typeof candidate.targetPlayerId !== 'string') {
        throw new ScoringRuleError('MALFORMED_EVENT', 'A target jersey number is required.');
      }
      const rival = rivalOf(state.teams, candidate.teamId);
      assertActivePlayer(
        set,
        candidate.teamId,
        candidate.playerId,
        'PLAYER_NOT_ON_COURT',
        'The credited player must be on court for the scoring team.',
      );
      assertActivePlayer(
        set,
        rival,
        candidate.targetPlayerId,
        'TARGET_NOT_ACTIVE',
        'The target player must be on court and not out.',
      );
      return;
    }

    case 'CATCH': {
      const set = requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Catching team is not part of this match.');
      }
      if (!knownTeam(candidate.throwerTeamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Thrower team is not part of this match.');
      }
      if (candidate.throwerTeamId === candidate.teamId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'The thrower must be on the other team.');
      }
      if (!candidate.playerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'A catcher jersey number is required.');
      }
      assertActivePlayer(
        set,
        candidate.teamId,
        candidate.playerId,
        'PLAYER_NOT_ON_COURT',
        'The catcher must be on court and not out.',
      );
      assertActivePlayer(
        set,
        candidate.throwerTeamId,
        candidate.throwerPlayerId,
        'THROWER_NOT_ACTIVE',
        'The thrower must be on court and not out.',
      );
      if (candidate.revivePlayerId) {
        if (!state.config.catchRevivesTeammate) {
          throw new ScoringRuleError(
            'CATCH_REVIVE_DISABLED',
            'Catch revivals are disabled in this configuration.',
          );
        }
        const status = set.players[candidate.teamId]?.[candidate.revivePlayerId];
        if (!status || status.active) {
          throw new ScoringRuleError(
            'REVIVE_NOT_ALLOWED',
            'The catch revival target must be an out team-mate.',
          );
        }
        if (d.disqualified.has(playerKey(candidate.teamId, candidate.revivePlayerId))) {
          throw new ScoringRuleError(
            'PLAYER_DISQUALIFIED',
            'A player ordered off cannot be revived.',
          );
        }
      }
      return;
    }

    case 'CARD': {
      const set = requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Card team is not part of this match.');
      }
      if (!CARD_TYPES.includes(candidate.cardType)) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'cardType must be YELLOW or RED.');
      }
      if (!candidate.playerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'A card needs a jersey number.');
      }
      assertActivePlayer(
        set,
        candidate.teamId,
        candidate.playerId,
        'PLAYER_NOT_ON_COURT',
        'The carded player must be on court and not out.',
      );
      const key = playerKey(candidate.teamId, candidate.playerId);
      if (candidate.cardType === 'YELLOW' && d.yellowCards.has(key)) {
        throw new ScoringRuleError(
          'SECOND_YELLOW_IS_RED',
          'This player already has a yellow card; record a red card.',
        );
      }
      if (candidate.cardType === 'RED' && d.disqualified.has(key)) {
        throw new ScoringRuleError('PLAYER_DISQUALIFIED', 'This player is already ordered off.');
      }
      return;
    }

    case 'INJURY': {
      const set = requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Injury team is not part of this match.');
      }
      if (!candidate.playerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'An injured jersey number is required.');
      }
      assertActivePlayer(
        set,
        candidate.teamId,
        candidate.playerId,
        'PLAYER_NOT_ON_COURT',
        'The injured player must be on court and not out.',
      );
      return;
    }

    case 'DELAY': {
      const set = requirePlayableSet(d, state.config, candidate.atMs);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Delay team is not part of this match.');
      }
      if (!DELAY_TYPES.includes(candidate.delayType)) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown delay type.');
      }
      assertActivePlayer(
        set,
        candidate.teamId,
        candidate.playerId,
        'PLAYER_NOT_ON_COURT',
        'The delaying player must be on court and not out.',
      );
      return;
    }

    case 'REVIVE': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Revival team is not part of this match.');
      }
      if (set.revivalPendingTeamId !== candidate.teamId) {
        throw new ScoringRuleError(
          'REVIVAL_NOT_PENDING',
          'This team does not have a pending all-out revival.',
        );
      }
      if (!Array.isArray(candidate.playerIds) || candidate.playerIds.length === 0) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'List the jersey numbers that re-entered.');
      }
      const expected = revivableOutPlayersOf(d, set, candidate.teamId);
      const requested = new Set(candidate.playerIds);
      if (
        requested.size !== expected.length ||
        !expected.every((playerId) => requested.has(playerId))
      ) {
        throw new ScoringRuleError(
          'REVIVE_PLAYERS_MISMATCH',
          `Revive all waiting players: ${expected.join(', ') || 'none'}.`,
        );
      }
      if (candidate.reason !== undefined && candidate.reason !== 'REVIVAL' && candidate.reason !== 'CATCH') {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown revival reason.');
      }
      return;
    }

    case 'REVIVAL_FAILED': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Revival team is not part of this match.');
      }
      if (set.revivalPendingTeamId !== candidate.teamId) {
        throw new ScoringRuleError(
          'REVIVAL_NOT_PENDING',
          'This team does not have a pending all-out revival.',
        );
      }
      return;
    }

    case 'PAUSE': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (set.completed) {
        throw new ScoringRuleError('SET_ALREADY_COMPLETE', 'This set is already complete.');
      }
      if (isPaused(set)) {
        throw new ScoringRuleError('SET_ALREADY_PAUSED', 'The clock is already stopped.');
      }
      if (candidate.reason !== undefined && !PAUSE_REASONS.includes(candidate.reason)) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown pause reason.');
      }
      const time = timeStateOf(set, state.config, candidate.atMs);
      if (!set.suddenDeath && time.expired) {
        throw new ScoringRuleError('SET_TIME_EXPIRED', 'Set time is already over.');
      }
      return;
    }

    case 'RESUME': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (!isPaused(set)) {
        throw new ScoringRuleError('SET_NOT_PAUSED', 'The clock is not stopped.');
      }
      return;
    }

    case 'SET_END': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (candidate.setNo !== set.setNo) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'The end event must match the live set.');
      }
      const reason = candidate.reason ?? 'MANUAL';
      if (!SET_END_REASONS.includes(reason)) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown set-end reason.');
      }
      if (set.suddenDeath) {
        throw new ScoringRuleError(
          'SUDDEN_DEATH_IN_PROGRESS',
          'Sudden death ends automatically when the first point is scored.',
        );
      }
      const time = timeStateOf(set, state.config, candidate.atMs);
      if (reason === 'TIMER' && !time.expired) {
        throw new ScoringRuleError('SET_TIME_NOT_EXPIRED', 'Set time is not over yet.');
      }
      // A level set is valid in DSO dodgeball: it is recorded as a draw and
      // no set point is awarded to either team.
      return;
    }

    case 'EXTRA_TIME_START': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (candidate.setNo !== set.setNo) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'Extra time must match the live set.');
      }
      if (set.extraTime || set.suddenDeath) {
        throw new ScoringRuleError('EXTRA_TIME_NOT_ALLOWED', 'Extra time is already under way.');
      }
      if (isPaused(set)) {
        throw new ScoringRuleError('SET_PAUSED', 'Resume play before starting extra time.');
      }
      const time = timeStateOf(set, state.config, candidate.atMs);
      if (!time.expired) {
        throw new ScoringRuleError('SET_TIME_NOT_EXPIRED', 'Set time is not over yet.');
      }
      if (!pointsTied(set, state.teams)) {
        throw new ScoringRuleError('EXTRA_TIME_NOT_REQUIRED', 'The set is not tied.');
      }
      return;
    }

    case 'SUDDEN_DEATH_START': {
      const set = d.currentSet;
      if (!set) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live.');
      }
      if (candidate.setNo !== set.setNo) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'Sudden death must match the live set.');
      }
      if (!state.config.suddenDeathEnabled) {
        throw new ScoringRuleError('SUDDEN_DEATH_DISABLED', 'Sudden death is disabled.');
      }
      if (!set.extraTime) {
        throw new ScoringRuleError('SUDDEN_DEATH_NOT_ALLOWED', 'Start extra time first.');
      }
      if (set.suddenDeath) {
        throw new ScoringRuleError('SUDDEN_DEATH_ALREADY_STARTED', 'Sudden death is already live.');
      }
      if (isPaused(set)) {
        throw new ScoringRuleError('SET_PAUSED', 'Resume play before starting sudden death.');
      }
      const time = timeStateOf(set, state.config, candidate.atMs);
      if (!time.expired) {
        throw new ScoringRuleError('SET_TIME_NOT_EXPIRED', 'Extra time is not over yet.');
      }
      if (!pointsTied(set, state.teams)) {
        throw new ScoringRuleError('SUDDEN_DEATH_NOT_REQUIRED', 'The set is not tied.');
      }
      return;
    }

    case 'MANUAL_DECISION': {
      if (d.manual) {
        throw new ScoringRuleError('MATCH_COMPLETED', 'A manual decision is already recorded.');
      }
      if (!knownTeam(candidate.winnerTeamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Manual-decision winner is not part of this match.');
      }
      if (typeof candidate.reason !== 'string' || !candidate.reason.trim()) {
        throw new ScoringRuleError('REASON_REQUIRED', 'A manual decision requires a reason.');
      }
      return;
    }

    case 'VOID': {
      const target = state.events.find((event) => event.eventId === candidate.targetEventId);
      if (!target) {
        throw new ScoringRuleError('VOID_TARGET_INVALID', 'Void target event not found.');
      }
      if (target.type === 'VOID') {
        throw new ScoringRuleError('VOID_TARGET_INVALID', 'A void event cannot be voided.');
      }
      if (view.voidedIds.has(target.eventId)) {
        throw new ScoringRuleError('VOID_TARGET_INVALID', 'The target event is already voided.');
      }
      return;
    }

    default:
      throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown event type.');
  }
}

function lastActiveOf(events: DodgeballScoreEvent[]): DodgeballScoreEvent | null {
  const { active } = activeView(events);
  return active.length > 0 ? active[active.length - 1] : null;
}

export const dodgeballScoringEngine = {
  sport: 'dodgeball' as const,

  createInitialState(input: CreateDodgeballMatchInput): DodgeballScoringState {
    const teams = [...input.teams];
    if (teams.length !== 2) {
      throw new ScoringRuleError('INVALID_TEAMS', 'A dodgeball match requires exactly 2 teams.');
    }
    if (teams.some((team) => !team.id || !team.name) || teams[0].id === teams[1].id) {
      throw new ScoringRuleError(
        'INVALID_TEAMS',
        'Both teams need distinct non-empty ids and names.',
      );
    }
    return {
      sport: 'dodgeball',
      teams,
      config: { ...DEFAULT_DODGEBALL_SCORING_CONFIG, ...(input.config ?? {}) },
      events: [],
    };
  },

  applyEvent(
    state: DodgeballScoringState,
    event: DodgeballScoreEvent,
  ): DodgeballScoringState {
    if (state.events.some((existing) => existing.eventId === event.eventId)) return state;
    validateEventInternal(state, event);
    return { ...state, events: [...state.events, event] };
  },

  validateEvent(state: DodgeballScoringState, candidate: DodgeballScoreEvent): void {
    validateEventInternal(state, candidate);
  },

  getScoreboard(state: DodgeballScoringState, nowMs?: number): DodgeballScoreboard {
    const now =
      typeof nowMs === 'number' && Number.isFinite(nowMs)
        ? nowMs
        : state.events.length > 0
          ? state.events[state.events.length - 1].atMs
          : 0;
    return getScoreboardInternal(state, now);
  },

  getNextAction(state: DodgeballScoringState, nowMs?: number): DodgeballNextAction {
    return dodgeballScoringEngine.getScoreboard(state, nowMs).nextAction;
  },

  getUndoTarget(state: DodgeballScoringState): DodgeballScoreEvent | null {
    const lastActive = lastActiveOf(state.events);
    if (!lastActive || lastActive.type === 'VOID') return null;
    return lastActive;
  },

  canUndo(state: DodgeballScoringState): boolean {
    return dodgeballScoringEngine.getUndoTarget(state) !== null;
  },

  computeWinner(state: DodgeballScoringState): DodgeballWinnerEvaluation {
    return winnerOf(deriveMatch(state), state);
  },

  statColumns(): DodgeballStatColumn[] {
    return [
      { key: 'points', label: 'Pts', kind: 'count', align: 'end' },
      { key: 'hits', label: 'Hit', kind: 'count', align: 'end' },
      { key: 'outs', label: 'Out', kind: 'count', align: 'end' },
      { key: 'catches', label: 'Catch', kind: 'count', align: 'end' },
      { key: 'revives', label: 'Rev', kind: 'count', align: 'end' },
      { key: 'cards', label: 'Card', kind: 'count', align: 'end' },
      { key: 'delays', label: 'Delay', kind: 'count', align: 'end' },
    ];
  },

  /**
   * Team-level statistics only. DSO dodgeball awards points to the team, never
   * to an individual player, so every row has `playerId: null`.
   */
  getPlayerStats(state: DodgeballScoringState): DodgeballStatsRow[] {
    const d = deriveMatch(state);
    const config = state.config;
    const view = activeView(state.events);
    const rows = new Map<string, DodgeballStatsRow>();

    const ensure = (teamId: string): DodgeballStatsRow => {
      let row = rows.get(teamId);
      if (!row) {
        row = {
          playerId: null,
          teamId,
          jerseyNumber: null,
          values: {
            points: 0,
            hits: 0,
            outs: 0,
            catches: 0,
            revives: 0,
            cards: 0,
            delays: 0,
          },
        };
        rows.set(teamId, row);
      }
      return row;
    };

    for (const team of state.teams) ensure(team.id);

    for (const event of view.active) {
      switch (event.type) {
        case 'TEAM_POINT': {
          const points =
            typeof event.points === 'number' && Number.isFinite(event.points) && event.points > 0
              ? Math.floor(event.points)
              : 1;
          ensure(event.teamId).values.points += points;
          break;
        }
        case 'HIT': {
          const rival = rivalOf(state.teams, event.teamId);
          const row = ensure(event.teamId);
          row.values.points += config.hitPoints;
          row.values.hits += 1;
          ensure(rival).values.outs += 1;
          break;
        }
        case 'LINE_OUT': {
          const rival = rivalOf(state.teams, event.teamId);
          ensure(event.teamId).values.points += config.lineOutPoints;
          ensure(rival).values.outs += 1;
          break;
        }
        case 'CATCH': {
          const row = ensure(event.teamId);
          row.values.catches += 1;
          if (event.throwerPlayerId) ensure(event.throwerTeamId).values.outs += 1;
          if (config.catchRevivesTeammate) row.values.revives += 1;
          break;
        }
        case 'CARD': {
          const row = ensure(event.teamId);
          row.values.cards += 1;
          if (event.cardType === 'RED') {
            const rival = rivalOf(state.teams, event.teamId);
            row.values.outs += 1;
            ensure(rival).values.points += config.redCardPoints;
          }
          break;
        }
        case 'INJURY': {
          const rival = rivalOf(state.teams, event.teamId);
          ensure(event.teamId).values.outs += 1;
          ensure(rival).values.points += config.injuryOutPoints;
          break;
        }
        case 'DELAY': {
          const rival = rivalOf(state.teams, event.teamId);
          ensure(event.teamId).values.delays += 1;
          ensure(rival).values.points += config.delayPenaltyPoints;
          break;
        }
        case 'REVIVE': {
          ensure(event.teamId).values.revives += 1;
          break;
        }
        case 'REVIVAL_FAILED': {
          const rival = rivalOf(state.teams, event.teamId);
          ensure(rival).values.points += config.revivalFailurePoints;
          break;
        }
        default:
          break;
      }
    }

    // All-out bonuses are derived from the set fold (not a standalone event).
    for (const set of d.sets) {
      for (const team of state.teams) {
        const count = set.allOutCount[team.id] ?? 0;
        if (count === 0) continue;
        const awarded = config.allOutBonusRepeats ? count : Math.min(1, count);
        const rival = rivalOf(state.teams, team.id);
        ensure(rival).values.points += awarded * config.allOutBonusPoints;
      }
    }

    return Array.from(rows.values()).sort((a, b) =>
      (a.teamId ?? '').localeCompare(b.teamId ?? ''),
    );
  },
};

export type DodgeballScoringEngine = typeof dodgeballScoringEngine;
