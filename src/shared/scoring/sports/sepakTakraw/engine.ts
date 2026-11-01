/**
 * Sepak takraw scoring engine.
 *
 * Pure, event-sourced derivation: the full match state is recomputed by folding
 * the active event list (VOID excludes its target). Mirrors the kho-kho engine
 * contract (createInitialState, applyEvent, validateEvent, getScoreboard,
 * getNextAction, getUndoTarget, canUndo, computeWinner) and adds
 * getPlayerStats() and statColumns().
 *
 * Locked rules implemented here (all values come from SepakTakrawScoringConfig):
 * - regu: 3 on court, best-of-3 sets, rally point.
 * - set to 21, deuce from 20-20 (win by 2), hard cap 25.
 * - deciding set to 15, deuce from 14-14, hard cap 17.
 * - each team serves serveRotation consecutive rallies; a service fault counts
 *   as one of those rallies; at deuce the serve changes after every rally (1/1).
 * - set 1 first serve from the opening toss; later sets alternate; the deciding
 *   set gets a fresh toss when serveTossInDecidingSet is enabled.
 * - every FAULT awards the point to the opposing team; service faults can only
 *   be committed by the serving team.
 */
import { ScoringRuleError, type ScoringTeamRef } from '../../types.ts';
import {
  DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG,
  SEPAK_TAKRAW_FAULTS,
  SEPAK_TAKRAW_ROLES,
  type CreateSepakTakrawMatchInput,
  type SepakTakrawFaultCategory,
  type SepakTakrawFaultType,
  type SepakTakrawLineupEvent,
  type SepakTakrawLineupSlot,
  type SepakTakrawManualDecisionEvent,
  type SepakTakrawNextAction,
  type SepakTakrawPhase,
  type SepakTakrawPlayerRole,
  type SepakTakrawPointType,
  type SepakTakrawScoreEvent,
  type SepakTakrawScoreboard,
  type SepakTakrawScoringConfig,
  type SepakTakrawScoringState,
  type SepakTakrawSetEntry,
  type SepakTakrawServing,
  type SepakTakrawStatsRow,
  type SepakTakrawTossEvent,
  type SepakTakrawWinnerEvaluation,
} from './types.ts';

export interface SepakTakrawStatColumn {
  key: string;
  label: string;
  kind: 'count';
  align: 'end';
}

type DerivedLineup = {
  onCourt: SepakTakrawLineupSlot[];
  subs: string[];
};

type DerivedSet = {
  setNo: number;
  points: Record<string, number>;
  winnerTeamId: string | null;
  completed: boolean;
  deuceEntered: boolean;
  firstServerId: string;
  serveTeamId: string;
  serveCount: number;
  sideChangeConfirmed: boolean;
  timeouts: Record<string, number>;
  lastEventId: string | null;
};

type ScoringEventContext = {
  eventId: string;
  teamId: string;
  kind: 'POINT' | 'FAULT';
  pointType: SepakTakrawPointType | null;
  faultCategory: SepakTakrawFaultCategory | null;
  tekongPlayerId: string | null;
};

type DerivedMatch = {
  tosses: Map<number, SepakTakrawTossEvent>;
  lineups: Map<string, DerivedLineup>;
  lineupHistory: Map<string, Set<string>>;
  sets: DerivedSet[];
  currentSet: DerivedSet | null;
  manual: SepakTakrawManualDecisionEvent | null;
  attributions: Map<string, string | null>;
  scoringEvents: ScoringEventContext[];
  activeCount: number;
  voidedCount: number;
};

const POINT_TYPES: SepakTakrawPointType[] = ['ACE', 'ATTACK', 'BLOCK', 'OTHER'];

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

function isDecidingSet(setNo: number, config: SepakTakrawScoringConfig): boolean {
  return setNo === config.bestOf;
}

function targetsForSet(
  setNo: number,
  config: SepakTakrawScoringConfig,
): { target: number; deuceAt: number; cap: number } {
  if (isDecidingSet(setNo, config)) {
    return {
      target: config.decidingSetPoints,
      deuceAt: config.decidingDeuceAt,
      cap: config.decidingCap,
    };
  }
  return { target: config.setPoints, deuceAt: config.deuceAt, cap: config.cap };
}

function isDeuce(
  points: Record<string, number>,
  teams: ScoringTeamRef[],
  deuceAt: number,
): boolean {
  return teams.every((team) => (points[team.id] ?? 0) >= deuceAt);
}

function hasWonSet(
  points: Record<string, number>,
  teamId: string,
  rivalId: string,
  config: SepakTakrawScoringConfig,
  setNo: number,
): boolean {
  const { target, cap } = targetsForSet(setNo, config);
  const own = points[teamId] ?? 0;
  const opponent = points[rivalId] ?? 0;
  if (own >= cap) return true;
  return own >= target && own - opponent >= 2;
}

function activeView(events: SepakTakrawScoreEvent[]): {
  active: SepakTakrawScoreEvent[];
  voidedIds: Set<string>;
} {
  const voidedIds = new Set<string>();
  for (const event of events) {
    if (event.type === 'VOID') voidedIds.add(event.targetEventId);
  }
  const active = events.filter((event) => !voidedIds.has(event.eventId));
  return { active, voidedIds };
}

function faultCategoryOf(type: SepakTakrawFaultType): SepakTakrawFaultCategory {
  const def = SEPAK_TAKRAW_FAULTS.find((fault) => fault.type === type);
  if (!def) {
    throw new ScoringRuleError('MALFORMED_EVENT', `Unknown fault type "${type}".`);
  }
  return def.category;
}

function tekongOf(d: DerivedMatch, teamId: string): string | null {
  const lineup = d.lineups.get(teamId);
  return lineup?.onCourt.find((slot) => slot.role === 'TEKONG')?.playerId ?? null;
}

function isOnCourt(d: DerivedMatch, teamId: string, playerId: string): boolean {
  return !!d.lineups.get(teamId)?.onCourt.some((slot) => slot.playerId === playerId);
}

function missingLineups(d: DerivedMatch, state: SepakTakrawScoringState): string[] {
  return state.teams.filter((team) => !d.lineups.has(team.id)).map((team) => team.id);
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

function winnerOf(d: DerivedMatch, state: SepakTakrawScoringState): SepakTakrawWinnerEvaluation {
  if (d.manual) {
    return {
      resolved: true,
      winnerTeamId: d.manual.winnerTeamId,
      kind: 'manual',
      label: 'WON BY DECISION',
    };
  }
  const wins = setWinsOf(d, state.teams);
  const needed = Math.ceil(state.config.bestOf / 2);
  for (const team of state.teams) {
    const count = wins[team.id] ?? 0;
    if (count >= needed) {
      return {
        resolved: true,
        winnerTeamId: team.id,
        kind: 'sets',
        label: `WON BY ${count} SETS`,
      };
    }
  }
  return { resolved: false, winnerTeamId: null, kind: null, label: '' };
}

function firstServerForSet(
  setNo: number,
  d: DerivedMatch,
  state: SepakTakrawScoringState,
): string | null {
  const config = state.config;
  if (setNo === 1) {
    const toss = d.tosses.get(1);
    if (!toss) return null;
    return toss.choice === 'SERVE' ? toss.winnerTeamId : rivalOf(state.teams, toss.winnerTeamId);
  }
  const previous = d.sets.find((set) => set.setNo === setNo - 1);
  if (!previous || !previous.completed) return null;
  if (isDecidingSet(setNo, config)) {
    if (config.serveTossInDecidingSet) {
      const toss = d.tosses.get(setNo);
      if (!toss) return null;
      return toss.choice === 'SERVE' ? toss.winnerTeamId : rivalOf(state.teams, toss.winnerTeamId);
    }
    return rivalOf(state.teams, previous.firstServerId);
  }
  if (setNo === 2) {
    return config.firstServeAlternate
      ? rivalOf(state.teams, previous.firstServerId)
      : previous.firstServerId;
  }
  return config.firstServeAlternate
    ? rivalOf(state.teams, previous.firstServerId)
    : previous.firstServerId;
}

function deriveMatch(state: SepakTakrawScoringState): DerivedMatch {
  const { teams, config } = state;
  const d: DerivedMatch = {
    tosses: new Map<number, SepakTakrawTossEvent>(),
    lineups: new Map<string, DerivedLineup>(),
    lineupHistory: new Map<string, Set<string>>(),
    sets: [],
    currentSet: null,
    manual: null,
    attributions: new Map<string, string | null>(),
    scoringEvents: [],
    activeCount: 0,
    voidedCount: 0,
  };

  const view = activeView(state.events);
  d.activeCount = view.active.length;
  d.voidedCount = state.events.length - view.active.length;

  const rememberLineup = (teamId: string, lineup: DerivedLineup): void => {
    const history = d.lineupHistory.get(teamId) ?? new Set<string>();
    for (const slot of lineup.onCourt) history.add(slot.playerId);
    for (const playerId of lineup.subs) history.add(playerId);
    d.lineupHistory.set(teamId, history);
  };

  for (const event of view.active) {
    switch (event.type) {
      case 'VOID':
        break;
      case 'TOSS': {
        d.tosses.set(event.forSetNo ?? 1, event);
        break;
      }
      case 'LINEUP_SET': {
        const lineup: DerivedLineup = {
          onCourt: event.onCourt.map((slot) => ({ playerId: slot.playerId, role: slot.role })),
          subs: [...event.subs],
        };
        d.lineups.set(event.teamId, lineup);
        rememberLineup(event.teamId, lineup);
        break;
      }
      case 'ROLE_SWAP': {
        const lineup = d.lineups.get(event.teamId);
        if (!lineup) break;
        const first = lineup.onCourt.find((slot) => slot.playerId === event.playerId);
        const second = lineup.onCourt.find((slot) => slot.playerId === event.withPlayerId);
        if (first && second) {
          const role = first.role;
          first.role = second.role;
          second.role = role;
        }
        break;
      }
      case 'SUBSTITUTION': {
        const lineup = d.lineups.get(event.teamId);
        if (!lineup) break;
        const slot = lineup.onCourt.find((entry) => entry.playerId === event.outPlayerId);
        const subIndex = lineup.subs.indexOf(event.inPlayerId);
        if (slot && subIndex >= 0) {
          slot.playerId = event.inPlayerId;
          lineup.subs.splice(subIndex, 1);
          lineup.subs.push(event.outPlayerId);
          const history = d.lineupHistory.get(event.teamId) ?? new Set<string>();
          history.add(event.inPlayerId);
          history.add(event.outPlayerId);
          d.lineupHistory.set(event.teamId, history);
        }
        break;
      }
      case 'SET_START': {
        const firstServerId = firstServerForSet(event.setNo, d, state);
        if (!firstServerId) break;
        const current: DerivedSet = {
          setNo: event.setNo,
          points: emptyPoints(teams),
          winnerTeamId: null,
          completed: false,
          deuceEntered: false,
          firstServerId,
          serveTeamId: firstServerId,
          serveCount: 1,
          sideChangeConfirmed: false,
          timeouts: emptyPoints(teams),
          lastEventId: event.eventId,
        };
        d.sets.push(current);
        d.currentSet = current;
        break;
      }
      case 'POINT':
      case 'FAULT': {
        const current = d.currentSet;
        if (!current || current.completed) break;
        const scoringTeamId =
          event.type === 'POINT' ? event.scoringTeamId : rivalOf(teams, event.faultyTeamId);
        d.scoringEvents.push({
          eventId: event.eventId,
          teamId: event.type === 'POINT' ? event.scoringTeamId : event.faultyTeamId,
          kind: event.type,
          pointType: event.type === 'POINT' ? event.pointType : null,
          faultCategory: event.type === 'FAULT' ? faultCategoryOf(event.faultType) : null,
          tekongPlayerId: tekongOf(d, current.serveTeamId),
        });
        current.points[scoringTeamId] = (current.points[scoringTeamId] ?? 0) + 1;
        const { deuceAt } = targetsForSet(current.setNo, config);
        const deuceNow = isDeuce(current.points, teams, deuceAt);
        if (deuceNow) current.deuceEntered = true;
        const maxServes = deuceNow ? 1 : config.serveRotation;
        if (current.serveCount >= maxServes) {
          current.serveTeamId = rivalOf(teams, current.serveTeamId);
          current.serveCount = 1;
        } else {
          current.serveCount += 1;
        }
        current.lastEventId = event.eventId;
        if (
          hasWonSet(
            current.points,
            scoringTeamId,
            rivalOf(teams, scoringTeamId),
            config,
            current.setNo,
          )
        ) {
          current.completed = true;
          current.winnerTeamId = scoringTeamId;
          d.currentSet = null;
        }
        break;
      }
      case 'TIMEOUT': {
        const current = d.currentSet;
        if (!current || current.completed) break;
        current.timeouts[event.teamId] = (current.timeouts[event.teamId] ?? 0) + 1;
        current.lastEventId = event.eventId;
        break;
      }
      case 'SIDE_CHANGE_CONFIRMED': {
        const current = d.currentSet;
        if (!current || current.completed) break;
        current.sideChangeConfirmed = true;
        current.lastEventId = event.eventId;
        break;
      }
      case 'MANUAL_DECISION': {
        d.manual = event;
        break;
      }
      case 'PLAYER_ATTRIBUTION': {
        d.attributions.set(event.targetEventId, event.playerId);
        break;
      }
      default:
        break;
    }
  }

  return d;
}

function phaseOf(d: DerivedMatch, state: SepakTakrawScoringState): SepakTakrawPhase {
  if (winnerOf(d, state).resolved) return 'completed';
  if (d.currentSet) return 'set_live';
  if (d.sets.length === 0) {
    if (!d.tosses.has(1)) return 'awaiting_toss';
    return missingLineups(d, state).length > 0 ? 'awaiting_lineups' : 'awaiting_set_start';
  }
  return 'set_break';
}

function sideChangePendingOf(d: DerivedMatch, state: SepakTakrawScoringState): boolean {
  if (winnerOf(d, state).resolved) return false;
  const current = d.currentSet;
  if (!current || current.completed) return false;
  if (!isDecidingSet(current.setNo, state.config)) return false;
  if (current.sideChangeConfirmed) return false;
  return state.teams.some(
    (team) => (current.points[team.id] ?? 0) >= state.config.sideChangeDecidingSetAt,
  );
}

function lastActiveOf(events: SepakTakrawScoreEvent[]): SepakTakrawScoreEvent | null {
  const { active } = activeView(events);
  return active.length > 0 ? active[active.length - 1] : null;
}

function nextActionOf(d: DerivedMatch, state: SepakTakrawScoringState): SepakTakrawNextAction {
  const winner = winnerOf(d, state);
  if (winner.resolved) return { action: 'completed', winner };

  if (d.currentSet) {
    if (sideChangePendingOf(d, state)) {
      return { action: 'side_change_pending', threshold: state.config.sideChangeDecidingSetAt };
    }
    return { action: 'rally_ready' };
  }

  if (d.sets.length === 0) {
    if (!d.tosses.has(1)) return { action: 'prompt_toss', setNo: 1 };
    const missing = missingLineups(d, state);
    if (missing.length > 0) return { action: 'require_lineups', missingTeamIds: missing };
    return { action: 'start_set', setNo: 1, deciding: isDecidingSet(1, state.config) };
  }

  const nextSetNo = d.sets.length + 1;
  const deciding = isDecidingSet(nextSetNo, state.config);
  if (deciding && state.config.serveTossInDecidingSet && !d.tosses.has(nextSetNo)) {
    return { action: 'prompt_toss', setNo: nextSetNo };
  }
  const missing = missingLineups(d, state);
  if (missing.length > 0) return { action: 'require_lineups', missingTeamIds: missing };

  const lastCompleted = d.sets[d.sets.length - 1];
  const lastActive = lastActiveOf(state.events);
  if (lastCompleted && lastActive && lastCompleted.lastEventId === lastActive.eventId) {
    return {
      action: 'set_complete',
      setNo: lastCompleted.setNo,
      winnerTeamId: lastCompleted.winnerTeamId ?? '',
    };
  }
  return { action: 'start_set', setNo: nextSetNo, deciding };
}

function getScoreboardInternal(state: SepakTakrawScoringState): SepakTakrawScoreboard {
  const d = deriveMatch(state);
  const winner = winnerOf(d, state);
  const current = d.currentSet;
  const lastSet = d.sets.length > 0 ? d.sets[d.sets.length - 1] : null;
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
  const liveForPlay = !!current && !winner.resolved;
  const deuce = liveForPlay
    ? isDeuce(current.points, state.teams, targetsForSet(setNo, state.config).deuceAt)
    : false;
  const serving: SepakTakrawServing | null = liveForPlay
    ? {
        teamId: current.serveTeamId,
        playerId: tekongOf(d, current.serveTeamId),
        serveCount: current.serveCount,
        maxServes: deuce ? 1 : state.config.serveRotation,
      }
    : null;
  const sets: SepakTakrawSetEntry[] = d.sets.map((set) => ({
    setNo: set.setNo,
    points: { ...set.points },
    winnerTeamId: set.winnerTeamId,
    completed: set.completed,
    deuceEntered: set.deuceEntered,
  }));

  return {
    sport: 'sepak-takraw',
    teams: state.teams.map((team) => ({ id: team.id, name: team.name })),
    phase: phaseOf(d, state),
    setNo,
    sets,
    setWins: setWinsOf(d, state.teams),
    points,
    serving,
    deuce,
    timeoutsUsed: current ? { ...current.timeouts } : emptyPoints(state.teams),
    sideChangePending: sideChangePendingOf(d, state),
    sideChangeConfirmed:
      liveForPlay && isDecidingSet(current.setNo, state.config) && current.sideChangeConfirmed,
    winner,
    nextAction: nextActionOf(d, state),
    activeEventCount: d.activeCount,
    voidedEventCount: d.voidedCount,
  };
}

function validateLineup(event: SepakTakrawLineupEvent, config: SepakTakrawScoringConfig): void {
  if (!Array.isArray(event.onCourt)) {
    throw new ScoringRuleError('BAD_LINEUP', 'onCourt must be an array of players.');
  }
  if (event.onCourt.length !== config.playersOnCourt) {
    throw new ScoringRuleError(
      'BAD_LINEUP',
      `Exactly ${config.playersOnCourt} players must be on court, received ${event.onCourt.length}.`,
    );
  }
  const playerIds = new Set<string>();
  const roleCounts: Record<string, number> = {};
  for (const slot of event.onCourt) {
    if (!slot || typeof slot.playerId !== 'string' || !slot.playerId.trim()) {
      throw new ScoringRuleError('BAD_LINEUP', 'Every on-court slot needs a player id.');
    }
    if (playerIds.has(slot.playerId)) {
      throw new ScoringRuleError('BAD_LINEUP', `Player "${slot.playerId}" appears twice on court.`);
    }
    playerIds.add(slot.playerId);
    if (!SEPAK_TAKRAW_ROLES.includes(slot.role)) {
      throw new ScoringRuleError('ROLE_SLOTS_INVALID', `Unknown on-court role "${slot.role}".`);
    }
    roleCounts[slot.role] = (roleCounts[slot.role] ?? 0) + 1;
  }
  for (const role of SEPAK_TAKRAW_ROLES) {
    if ((roleCounts[role] ?? 0) !== 1) {
      throw new ScoringRuleError(
        'ROLE_SLOTS_INVALID',
        `Exactly one ${role} must be on court (found ${roleCounts[role] ?? 0}).`,
      );
    }
  }
  if (!Array.isArray(event.subs)) {
    throw new ScoringRuleError('BAD_LINEUP', 'subs must be an array of player ids.');
  }
  if (event.subs.length > config.maxRosterSize - config.playersOnCourt) {
    throw new ScoringRuleError(
      'BAD_LINEUP',
      `At most ${config.maxRosterSize - config.playersOnCourt} substitutes are allowed.`,
    );
  }
  const subIds = new Set<string>();
  for (const playerId of event.subs) {
    if (typeof playerId !== 'string' || !playerId.trim()) {
      throw new ScoringRuleError('BAD_LINEUP', 'Every substitute needs a player id.');
    }
    if (playerIds.has(playerId) || subIds.has(playerId)) {
      throw new ScoringRuleError(
        'BAD_LINEUP',
        `Substitute "${playerId}" is duplicated or already on court.`,
      );
    }
    subIds.add(playerId);
  }
}

function requireLiveSet(d: DerivedMatch): DerivedSet {
  if (!d.currentSet) {
    throw new ScoringRuleError('SET_NOT_STARTED', 'No set is live. Start a set first.');
  }
  return d.currentSet;
}

function validateEventInternal(
  state: SepakTakrawScoringState,
  candidate: SepakTakrawScoreEvent,
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
  if (winner.resolved && candidate.type !== 'VOID' && candidate.type !== 'PLAYER_ATTRIBUTION') {
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
      if (candidate.choice !== 'SERVE' && candidate.choice !== 'RECEIVE') {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Toss choice must be SERVE or RECEIVE.');
      }
      const forSetNo = candidate.forSetNo ?? 1;
      if (!Number.isInteger(forSetNo) || forSetNo < 1) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'forSetNo must be a positive set number.');
      }
      if (forSetNo === 1) {
        if (d.tosses.has(1)) {
          throw new ScoringRuleError('TOSS_ALREADY_SET', 'The opening toss is already recorded.');
        }
        if (d.sets.length > 0) {
          throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'The opening toss cannot be recorded now.');
        }
        return;
      }
      const expected = d.sets.length + 1;
      if (forSetNo !== expected) {
        throw new ScoringRuleError(
          'TOSS_NOT_EXPECTED',
          `A toss for set ${forSetNo} is not expected; the next set is ${expected}.`,
        );
      }
      if (!isDecidingSet(forSetNo, state.config)) {
        throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'Only the deciding set gets a fresh toss.');
      }
      if (!state.config.serveTossInDecidingSet) {
        throw new ScoringRuleError(
          'TOSS_NOT_EXPECTED',
          'A deciding-set toss is disabled; the first serve alternates.',
        );
      }
      if (d.tosses.has(forSetNo)) {
        throw new ScoringRuleError('TOSS_ALREADY_SET', `The toss for set ${forSetNo} is recorded.`);
      }
      if (d.currentSet) {
        throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'The deciding toss cannot be recorded mid-set.');
      }
      return;
    }

    case 'LINEUP_SET': {
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Lineup team is not part of this match.');
      }
      const phase = phaseOf(d, state);
      if (phase === 'awaiting_toss') {
        throw new ScoringRuleError('TOSS_REQUIRED', 'Record the toss before setting lineups.');
      }
      if (phase === 'set_live') {
        throw new ScoringRuleError(
          'BAD_LINEUP',
          'Lineups can only change before a set or at a set break; use a substitution or role swap.',
        );
      }
      validateLineup(candidate, state.config);
      return;
    }

    case 'ROLE_SWAP': {
      requireLiveSet(d);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Role-swap team is not part of this match.');
      }
      const lineup = d.lineups.get(candidate.teamId);
      if (!lineup) {
        throw new ScoringRuleError('LINEUP_REQUIRED', 'Set the team lineup before swapping roles.');
      }
      if (
        !candidate.playerId ||
        !candidate.withPlayerId ||
        candidate.playerId === candidate.withPlayerId
      ) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Role swap needs two distinct players.');
      }
      if (
        !lineup.onCourt.some((slot) => slot.playerId === candidate.playerId) ||
        !lineup.onCourt.some((slot) => slot.playerId === candidate.withPlayerId)
      ) {
        throw new ScoringRuleError('PLAYER_NOT_ON_COURT', 'Both role-swap players must be on court.');
      }
      return;
    }

    case 'SUBSTITUTION': {
      requireLiveSet(d);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Substitution team is not part of this match.');
      }
      const lineup = d.lineups.get(candidate.teamId);
      if (!lineup) {
        throw new ScoringRuleError('LINEUP_REQUIRED', 'Set the team lineup before substituting.');
      }
      if (!candidate.outPlayerId || !candidate.inPlayerId) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'Substitution needs an outgoing and incoming player.');
      }
      if (!lineup.onCourt.some((slot) => slot.playerId === candidate.outPlayerId)) {
        throw new ScoringRuleError('PLAYER_NOT_ON_COURT', 'The outgoing player is not on court.');
      }
      if (!lineup.subs.includes(candidate.inPlayerId)) {
        throw new ScoringRuleError('PLAYER_NOT_A_SUB', 'The incoming player is not listed as a substitute.');
      }
      return;
    }

    case 'SET_START': {
      if (d.currentSet) {
        throw new ScoringRuleError('SET_NOT_STARTED', 'A set is already live.');
      }
      const expected = d.sets.length + 1;
      if (candidate.setNo !== expected) {
        throw new ScoringRuleError(
          'SET_NO_MISMATCH',
          `Set ${candidate.setNo} cannot start; the next set is ${expected}.`,
        );
      }
      if (expected > state.config.bestOf) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'The match has no further sets.');
      }
      if (!firstServerForSet(expected, d, state)) {
        throw new ScoringRuleError('TOSS_REQUIRED', `Record the toss for set ${expected} first.`);
      }
      const missing = missingLineups(d, state);
      if (missing.length > 0) {
        throw new ScoringRuleError(
          'LINEUP_REQUIRED',
          `Set a lineup for: ${missing.join(', ')}.`,
        );
      }
      return;
    }

    case 'POINT': {
      const current = requireLiveSet(d);
      if (!knownTeam(candidate.scoringTeamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Scoring team is not part of this match.');
      }
      if (!POINT_TYPES.includes(candidate.pointType)) {
        throw new ScoringRuleError('MALFORMED_EVENT', 'pointType must be ACE, ATTACK, BLOCK or OTHER.');
      }
      if (candidate.pointType === 'ACE') {
        if (current.serveTeamId !== candidate.scoringTeamId) {
          throw new ScoringRuleError('NOT_SERVING_TEAM', 'An ace can only be scored by the serving team.');
        }
        const tekong = tekongOf(d, current.serveTeamId);
        if (candidate.playerId && candidate.playerId !== tekong) {
          throw new ScoringRuleError('NOT_TEKONG', 'An ace can only be credited to the current Tekong.');
        }
      } else if (candidate.pointType === 'ATTACK' || candidate.pointType === 'BLOCK') {
        if (candidate.playerId && !isOnCourt(d, candidate.scoringTeamId, candidate.playerId)) {
          throw new ScoringRuleError(
            'PLAYER_NOT_ON_COURT',
            'The credited player must be on court for the scoring team.',
          );
        }
      } else if (candidate.playerId) {
        throw new ScoringRuleError('ATTRIBUTION_NOT_ALLOWED', 'OTHER points cannot be attributed to a player.');
      }
      return;
    }

    case 'FAULT': {
      const current = requireLiveSet(d);
      if (!knownTeam(candidate.faultyTeamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Faulting team is not part of this match.');
      }
      const def = SEPAK_TAKRAW_FAULTS.find((fault) => fault.type === candidate.faultType);
      if (!def) {
        throw new ScoringRuleError('MALFORMED_EVENT', `Unknown fault type "${candidate.faultType}".`);
      }
      if (def.category === 'service') {
        if (current.serveTeamId !== candidate.faultyTeamId) {
          throw new ScoringRuleError('NOT_SERVING_TEAM', 'Only the serving team can commit a service fault.');
        }
        if (
          candidate.faultType === 'BALL_TOUCHING_NET_ON_SERVE' &&
          state.config.letServeAllowed
        ) {
          throw new ScoringRuleError(
            'LET_SERVE_ALLOWED',
            'Let serves are played on; a net-touching serve is not a fault in this configuration.',
          );
        }
      }
      if (candidate.playerId && !isOnCourt(d, candidate.faultyTeamId, candidate.playerId)) {
        throw new ScoringRuleError(
          'PLAYER_NOT_ON_COURT',
          'The faulting player must be on court for the faulty team.',
        );
      }
      return;
    }

    case 'TIMEOUT': {
      const current = requireLiveSet(d);
      if (!knownTeam(candidate.teamId)) {
        throw new ScoringRuleError('TEAM_NOT_FOUND', 'Timeout team is not part of this match.');
      }
      if (candidate.setNo !== current.setNo) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'Timeouts belong to the live set.');
      }
      if ((current.timeouts[candidate.teamId] ?? 0) >= state.config.timeoutsPerSet) {
        throw new ScoringRuleError(
          'TIMEOUT_LIMIT',
          `This team has used all ${state.config.timeoutsPerSet} timeout(s) for the set.`,
        );
      }
      return;
    }

    case 'SIDE_CHANGE_CONFIRMED': {
      const current = requireLiveSet(d);
      if (!isDecidingSet(current.setNo, state.config)) {
        throw new ScoringRuleError(
          'SIDE_CHANGE_NOT_PENDING',
          'A mid-set side change only applies to the deciding set.',
        );
      }
      if (candidate.setNo !== current.setNo) {
        throw new ScoringRuleError('SET_NO_MISMATCH', 'Side-change confirmation belongs to the live set.');
      }
      if (current.sideChangeConfirmed) {
        throw new ScoringRuleError('SIDE_CHANGE_NOT_PENDING', 'The side change is already confirmed.');
      }
      const reached = state.teams.some(
        (team) => (current.points[team.id] ?? 0) >= state.config.sideChangeDecidingSetAt,
      );
      if (!reached) {
        throw new ScoringRuleError(
          'SIDE_CHANGE_NOT_PENDING',
          `A team must reach ${state.config.sideChangeDecidingSetAt} points first.`,
        );
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

    case 'PLAYER_ATTRIBUTION': {
      const target = state.events.find((event) => event.eventId === candidate.targetEventId);
      if (!target || target.type === 'VOID' || view.voidedIds.has(target.eventId)) {
        throw new ScoringRuleError(
          'ATTRIBUTION_NOT_ALLOWED',
          'Attribution target must be an active point or fault event.',
        );
      }
      if (target.type !== 'POINT' && target.type !== 'FAULT') {
        throw new ScoringRuleError(
          'ATTRIBUTION_NOT_ALLOWED',
          'Only point and fault events can be attributed.',
        );
      }
      if (target.type === 'POINT' && target.pointType === 'OTHER') {
        throw new ScoringRuleError('ATTRIBUTION_NOT_ALLOWED', 'OTHER points cannot be attributed.');
      }
      const teamId = target.type === 'POINT' ? target.scoringTeamId : target.faultyTeamId;
      if (candidate.playerId !== null) {
        if (typeof candidate.playerId !== 'string' || !candidate.playerId) {
          throw new ScoringRuleError('ATTRIBUTION_NOT_ALLOWED', 'playerId must be a player id or null.');
        }
        const history = d.lineupHistory.get(teamId);
        if (!history || !history.has(candidate.playerId)) {
          throw new ScoringRuleError(
            'ATTRIBUTION_NOT_ALLOWED',
            'The player was never listed in that team lineup.',
          );
        }
        if (target.type === 'POINT' && target.pointType === 'ACE') {
          const context = d.scoringEvents.find((entry) => entry.eventId === target.eventId);
          if (!context || context.tekongPlayerId !== candidate.playerId) {
            throw new ScoringRuleError(
              'NOT_TEKONG',
              'An ace can only be attributed to the Tekong who served it.',
            );
          }
        }
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

export const sepakTakrawScoringEngine = {
  sport: 'sepak-takraw' as const,

  createInitialState(input: CreateSepakTakrawMatchInput): SepakTakrawScoringState {
    const teams = [...input.teams];
    if (teams.length !== 2) {
      throw new ScoringRuleError('INVALID_TEAMS', 'A sepak takraw match requires exactly 2 teams.');
    }
    if (teams.some((team) => !team.id || !team.name) || teams[0].id === teams[1].id) {
      throw new ScoringRuleError(
        'INVALID_TEAMS',
        'Both teams need distinct non-empty ids and names.',
      );
    }
    return {
      sport: 'sepak-takraw',
      teams,
      config: { ...DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG, ...(input.config ?? {}) },
      events: [],
    };
  },

  applyEvent(
    state: SepakTakrawScoringState,
    event: SepakTakrawScoreEvent,
  ): SepakTakrawScoringState {
    if (state.events.some((existing) => existing.eventId === event.eventId)) return state;
    validateEventInternal(state, event);
    return { ...state, events: [...state.events, event] };
  },

  validateEvent(state: SepakTakrawScoringState, candidate: SepakTakrawScoreEvent): void {
    validateEventInternal(state, candidate);
  },

  getScoreboard(state: SepakTakrawScoringState, _nowMs?: number): SepakTakrawScoreboard {
    return getScoreboardInternal(state);
  },

  getNextAction(state: SepakTakrawScoringState, _nowMs?: number): SepakTakrawNextAction {
    return getScoreboardInternal(state).nextAction;
  },

  getUndoTarget(state: SepakTakrawScoringState): SepakTakrawScoreEvent | null {
    const lastActive = lastActiveOf(state.events);
    if (!lastActive || lastActive.type === 'VOID') return null;
    return lastActive;
  },

  canUndo(state: SepakTakrawScoringState): boolean {
    return sepakTakrawScoringEngine.getUndoTarget(state) !== null;
  },

  computeWinner(state: SepakTakrawScoringState): SepakTakrawWinnerEvaluation {
    return winnerOf(deriveMatch(state), state);
  },

  statColumns(): SepakTakrawStatColumn[] {
    return [
      { key: 'points', label: 'Pts', kind: 'count', align: 'end' },
      { key: 'aces', label: 'Ace', kind: 'count', align: 'end' },
      { key: 'attacks', label: 'Atk', kind: 'count', align: 'end' },
      { key: 'blocks', label: 'Blk', kind: 'count', align: 'end' },
      { key: 'faults', label: 'Flt', kind: 'count', align: 'end' },
      { key: 'serviceFaults', label: 'S-Flt', kind: 'count', align: 'end' },
    ];
  },

  getPlayerStats(state: SepakTakrawScoringState): SepakTakrawStatsRow[] {
    const d = deriveMatch(state);
    const rows = new Map<string, SepakTakrawStatsRow>();
    const ensure = (teamId: string, playerId: string | null): SepakTakrawStatsRow => {
      const key = `${teamId}:${playerId ?? '__unassigned__'}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          playerId,
          teamId,
          jerseyNumber: null,
          values: {
            points: 0,
            aces: 0,
            attacks: 0,
            blocks: 0,
            faults: 0,
            serviceFaults: 0,
          },
        };
        rows.set(key, row);
      }
      return row;
    };

    for (const team of state.teams) {
      const history = d.lineupHistory.get(team.id);
      if (history) {
        for (const playerId of history) ensure(team.id, playerId);
      }
      ensure(team.id, null);
    }

    for (const context of d.scoringEvents) {
      const target = state.events.find((event) => event.eventId === context.eventId);
      if (!target || (target.type !== 'POINT' && target.type !== 'FAULT')) continue;
      const attributed = d.attributions.has(context.eventId)
        ? (d.attributions.get(context.eventId) ?? null)
        : (target.playerId ?? null);
      const row = ensure(context.teamId, attributed);
      if (target.type === 'POINT') {
        if (target.pointType === 'ACE') {
          row.values.aces = (row.values.aces ?? 0) + 1;
          row.values.points = (row.values.points ?? 0) + 1;
        } else if (target.pointType === 'ATTACK') {
          row.values.attacks = (row.values.attacks ?? 0) + 1;
          row.values.points = (row.values.points ?? 0) + 1;
        } else if (target.pointType === 'BLOCK') {
          row.values.blocks = (row.values.blocks ?? 0) + 1;
          row.values.points = (row.values.points ?? 0) + 1;
        }
      } else {
        row.values.faults = (row.values.faults ?? 0) + 1;
        if (context.faultCategory === 'service') {
          row.values.serviceFaults = (row.values.serviceFaults ?? 0) + 1;
        }
      }
    }

    return Array.from(rows.values());
  },
};
