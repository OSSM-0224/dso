import {
  CreateScoringMatchInput,
  DEFAULT_KHO_KHO_SCORING_CONFIG,
  KhoKhoDismissalType,
  KhoKhoExtraInningsSummary,
  KhoKhoFollowOnEvent,
  KhoKhoFollowOnSummary,
  KhoKhoManualDecisionEvent,
  KhoKhoMatchPhase,
  KhoKhoMinTimeEvent,
  KhoKhoNextAction,
  KhoKhoScoreEvent,
  KhoKhoScoreboard,
  KhoKhoScoringConfig,
  KhoKhoSuddenDeathSummary,
  KhoKhoTurnEndEvent,
  KhoKhoTurnStageLabel,
  KhoKhoTurnStatus,
  KhoKhoTurnSummary,
  KhoKhoWinnerEvaluation,
  MatchScoringState,
  ScoringRuleError,
  ScoringTeamRef,
  VoidScoringEvent,
} from './types.ts';

const MS_PER_SEC = 1000;

type TurnRec = {
  slot: number;
  innings: number;
  turn: number;
  stage: KhoKhoTurnStageLabel;
  chaserTeamId: string;
  startAtMs: number | null;
  endAtMs: number | null;
  endEvent: KhoKhoTurnEndEvent | null;
  closedRunningMs: number;
  lastOpenAtMs: number | null;
  status: KhoKhoTurnStatus;
  pausedSinceMs: number | null;
  dismissals: number;
  points: number;
  foulCount: number;
  allOut: boolean;
};

type DerivedMatch = {
  firstToss: KhoKhoTossEvent | null;
  extraTosses: KhoKhoTossEvent[];
  turns: TurnRec[];
  totals: Record<string, number>;
  followOn: KhoKhoFollowOnEvent | null;
  manual: KhoKhoManualDecisionEvent | null;
  minTimeResults: KhoKhoMinTimeEvent[];
};

type KhoKhoTossEvent = Extract<KhoKhoScoreEvent, { type: 'TOSS' }>;

type Expectation =
  | { kind: 'open_turn' }
  | { kind: 'prompt_toss' }
  | { kind: 'slot'; slot: number; chaserTeamId: string }
  | { kind: 'prompt_follow_on'; leaderTeamId: string; leadPoints: number }
  | { kind: 'prompt_extra_toss'; round: number }
  | { kind: 'min_time'; pending: string[] }
  | { kind: 'manual_required' }
  | { kind: 'completed'; winner: KhoKhoWinnerEvaluation };

function deriveTotals(state: MatchScoringState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const team of state.teams) totals[team.id] = 0;
  return totals;
}

function rivalOf(teams: ScoringTeamRef[], teamId: string): string {
  const rival = teams.find((t) => t.id !== teamId);
  if (!rival) {
    throw new ScoringRuleError('TEAM_NOT_FOUND', `No rival team found for "${teamId}".`);
  }
  return rival.id;
}

function firstChaserOfToss(toss: KhoKhoTossEvent, teams: ScoringTeamRef[]): string {
  return toss.decision === 'CHASE' ? toss.winnerTeamId : rivalOf(teams, toss.winnerTeamId);
}

function inningsForSlot(slot: number): number {
  if (slot <= 2) return 1;
  if (slot <= 4) return 2;
  return 2 + Math.ceil((slot - 4) / 2);
}

function turnForSlot(slot: number): number {
  return slot % 2 === 1 ? 1 : 2;
}

function stageForSlot(slot: number): KhoKhoTurnStageLabel {
  if (slot <= 2) return 'Innings 1';
  if (slot <= 4) return 'Innings 2';
  return 'Extra Innings';
}

function labelForSlot(slot: number): string {
  return `${stageForSlot(slot)} · Turn ${turnForSlot(slot)}`;
}

function chaserForSlot(att: MatchScoringState, d: DerivedMatch, slot: number): string {
  const { teams } = att;
  if (slot === 1) {
    if (!d.firstToss) {
      throw new ScoringRuleError('TOSS_MISSING', 'Turn 1 cannot start before the toss.');
    }
    return firstChaserOfToss(d.firstToss, teams);
  }
  if (slot === 2) {
    return rivalOf(teams, chaserForSlot(att, d, 1));
  }
  if (slot >= 3 && slot === 3) {
    const firstChaser = chaserForSlot(att, d, 1);
    const secondChaser = rivalOf(teams, firstChaser);
    if (d.followOn && d.followOn.opted) {
      const firstPts = d.turns[0]?.points ?? 0;
      const secondPts = d.turns[1]?.points ?? 0;
      const leaderIsFirst = firstPts >= secondPts;
      return leaderIsFirst ? secondChaser : firstChaser;
    }
    return secondChaser;
  }
  if (slot >= 5 && slot % 2 === 1) {
    const roundIndex = Math.floor((slot - 5) / 2);
    const toss = d.extraTosses[roundIndex];
    if (!toss) {
      throw new ScoringRuleError('TOSS_MISSING', `Extra-innings round ${roundIndex + 1} toss is missing.`);
    }
    return firstChaserOfToss(toss, teams);
  }
  return rivalOf(teams, d.turns[d.turns.length - 1].chaserTeamId);
}

function activeEventView(events: KhoKhoScoreEvent[]): {
  active: KhoKhoScoreEvent[];
  voidedIds: Set<string>;
} {
  const voidedIds = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'VOID') voidedIds.add(ev.targetEventId);
  }
  const active = events.filter((ev) => !voidedIds.has(ev.eventId));
  return { active, voidedIds };
}

function deriveMatch(state: MatchScoringState): DerivedMatch {
  const { config } = state;
  const d: DerivedMatch = {
    firstToss: null,
    extraTosses: [],
    turns: [],
    totals: deriveTotals(state),
    followOn: null,
    manual: null,
    minTimeResults: [],
  };

  for (const ev of activeEventView(state.events).active) {
    if (ev.type === 'TOSS') {
      if (ev.stage === 'first_innings') d.firstToss = ev;
      else d.extraTosses.push(ev);
      continue;
    }
    if (ev.type === 'FOLLOW_ON_DECISION') {
      d.followOn = ev;
      continue;
    }
    if (ev.type === 'MANUAL_DECISION') {
      d.manual = ev;
      continue;
    }
    if (ev.type === 'MIN_TIME_RESULT') {
      d.minTimeResults.push(ev);
      continue;
    }

    const current = d.turns.length > 0 ? d.turns[d.turns.length - 1] : null;

    if (ev.type === 'TURN_START') {
      const slot = d.turns.length + 1;
      d.turns.push({
        slot,
        innings: inningsForSlot(slot),
        turn: turnForSlot(slot),
        stage: stageForSlot(slot),
        chaserTeamId: chaserForSlot(state, d, slot),
        startAtMs: ev.atMs,
        endAtMs: null,
        endEvent: null,
        closedRunningMs: 0,
        lastOpenAtMs: ev.atMs,
        status: 'live',
        pausedSinceMs: null,
        dismissals: 0,
        points: 0,
        foulCount: 0,
        allOut: false,
      });
      continue;
    }

    if (!current) continue;

    if (ev.type === 'DISMISSAL') {
      current.dismissals += 1;
      current.points = current.dismissals * config.pointsPerOut;
      current.allOut = current.dismissals >= state.config.activeSquadCount;
      d.totals[current.chaserTeamId] =
        (d.totals[current.chaserTeamId] ?? 0) + config.pointsPerOut;
      continue;
    }
    if (ev.type === 'FOUL_LOG') {
      current.foulCount += 1;
      continue;
    }
    if (ev.type === 'TURN_PAUSE') {
      if (current.status === 'live' && current.lastOpenAtMs !== null) {
        current.closedRunningMs += Math.max(0, ev.atMs - current.lastOpenAtMs);
      }
      current.status = 'paused';
      current.lastOpenAtMs = null;
      current.pausedSinceMs = ev.atMs;
      continue;
    }
    if (ev.type === 'TURN_RESUME') {
      current.status = 'live';
      current.lastOpenAtMs = ev.atMs;
      current.pausedSinceMs = null;
      continue;
    }
    if (ev.type === 'TURN_END') {
      if (current.status === 'live' && current.lastOpenAtMs !== null) {
        current.closedRunningMs += Math.max(0, ev.atMs - current.lastOpenAtMs);
        current.lastOpenAtMs = null;
      }
      current.status = 'ended';
      current.endAtMs = ev.atMs;
      current.endEvent = ev;
      current.pausedSinceMs = null;
    }
  }

  for (const turn of d.turns) {
    turn.points = turn.dismissals * config.pointsPerOut;
  }

  return d;
}

function runningMsAt(turn: TurnRec, atMs: number): number {
  const open =
    turn.status === 'live' && turn.lastOpenAtMs !== null
      ? atMs - turn.lastOpenAtMs
      : 0;
  return turn.closedRunningMs + Math.max(0, open);
}

function remainingMsAt(turn: TurnRec, atMs: number, config: KhoKhoScoringConfig): number {
  return config.turnDurationSec * MS_PER_SEC - runningMsAt(turn, atMs);
}

function openTurnOf(d: DerivedMatch): TurnRec | null {
  const last = d.turns.length > 0 ? d.turns[d.turns.length - 1] : null;
  if (!last || last.status === 'ended') return null;
  return last;
}

function minTimeEvaluation(
  d: DerivedMatch,
  teams: Array<{ id: string; name: string }>
): KhoKhoWinnerEvaluation | null {
  const scoreboard: KhoKhoWinnerEvaluation = {
    resolved: true,
    winnerTeamId: null,
    kind: 'min_time',
    label: 'WON BY SUDDEN DEATH (MINIMUM TIME)',
    marginPoints: null,
    scores: summarizeScores(d, teams),
  };
  const attemptFor = (teamId: string) =>
    d.minTimeResults.find((r) => r.teamId === teamId) ?? null;
  const a = attemptFor(teams[0].id);
  const b = attemptFor(teams[1].id);
  if (!a || !b) return null;
  if (a.scored && !b.scored) {
    scoreboard.winnerTeamId = a.teamId;
    return scoreboard;
  }
  if (b.scored && !a.scored) {
    scoreboard.winnerTeamId = b.teamId;
    return scoreboard;
  }
  if (a.scored && b.scored) {
    const aElapsed = a.elapsedMs ?? Number.MAX_SAFE_INTEGER;
    const bElapsed = b.elapsedMs ?? Number.MAX_SAFE_INTEGER;
    if (aElapsed < bElapsed) {
      scoreboard.winnerTeamId = a.teamId;
      scoreboard.marginPoints = 0;
      return scoreboard;
    }
    if (bElapsed < aElapsed) {
      scoreboard.winnerTeamId = b.teamId;
      scoreboard.marginPoints = 0;
      return scoreboard;
    }
    return null;
  }
  return null;
}

function summarizeScores(
  d: DerivedMatch,
  teams: Array<{ id: string; name: string }>
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const team of teams) scores[team.id] = d.totals[team.id] ?? 0;
  return scores;
}

function inningsWinEvaluation(
  d: DerivedMatch,
  teams: Array<{ id: string; name: string }>,
  config: KhoKhoScoringConfig
): KhoKhoWinnerEvaluation | null {
  const [teamA, teamB] = teams;
  const totalA = d.totals[teamA.id] ?? 0;
  const totalB = d.totals[teamB.id] ?? 0;
  const leader: { id: string; name: string } = totalA > totalB ? teamA : teamB;
  const trailing: { id: string; name: string } = totalA > totalB ? teamB : teamA;
  const leaderTotal = Math.max(totalA, totalB);
  const trailingTotal = Math.min(totalA, totalB);
  const maxRecovery = config.activeSquadCount * config.pointsPerOut;
  if (trailingTotal + maxRecovery >= leaderTotal) return null;
  return {
    resolved: true,
    winnerTeamId: leader.id,
    kind: 'innings',
    label: `WON BY AN INNINGS & ${leaderTotal - trailingTotal} PTS`,
    marginPoints: leaderTotal - trailingTotal,
    scores: summarizeScores(d, teams),
  };
}

function expectationOf(att: MatchScoringState, d: DerivedMatch): Expectation {
  const { teams, config } = att;

  if (d.manual) {
    return {
      kind: 'completed',
      winner: {
        resolved: true,
        winnerTeamId: d.manual.winnerTeamId,
        kind: 'manual',
        label: 'WON BY DECISION',
        marginPoints: null,
        scores: summarizeScores(d, teams),
      },
    };
  }

  if (openTurnOf(d)) return { kind: 'open_turn' };

  const n = d.turns.length;

  if (n === 0) {
    return d.firstToss ? { kind: 'slot', slot: 1, chaserTeamId: chaserForSlot(att, d, 1) } : { kind: 'prompt_toss' };
  }

  if (n === 1) {
    return { kind: 'slot', slot: 2, chaserTeamId: chaserForSlot(att, d, 2) };
  }

  if (n === 3) {
    const inningsWin = inningsWinEvaluation(d, teams, config);
    if (inningsWin) return { kind: 'completed', winner: inningsWin };
    return { kind: 'slot', slot: 4, chaserTeamId: chaserForSlot(att, d, 4) };
  }

  if (n >= 5 && n % 2 === 1) {
    const inningsWin = inningsWinEvaluation(d, teams, config);
    if (inningsWin) return { kind: 'completed', winner: inningsWin };
    return { kind: 'slot', slot: n + 1, chaserTeamId: chaserForSlot(att, d, n + 1) };
  }

  if (n === 2) {
    const firstPts = d.turns[0].points;
    const secondPts = d.turns[1].points;
    const lead = Math.abs(firstPts - secondPts);
    const leaderTeamId = firstPts >= secondPts ? d.turns[0].chaserTeamId : d.turns[1].chaserTeamId;
    if (config.followOnEnabled && lead >= config.followOnThreshold) {
      if (!d.followOn) {
        return { kind: 'prompt_follow_on', leaderTeamId, leadPoints: lead };
      }
    }
    return { kind: 'slot', slot: 3, chaserTeamId: chaserForSlot(att, d, 3) };
  }

  const teamA = teams[0];
  const teamB = teams[1];
  const totalA = d.totals[teamA.id] ?? 0;
  const totalB = d.totals[teamB.id] ?? 0;

  if (n >= 4 && n % 2 === 0) {
    if (n !== 4 + 2 * d.extraTosses.length) {
      return { kind: 'slot', slot: n + 1, chaserTeamId: chaserForSlot(att, d, n + 1) };
    }
    if (totalA !== totalB) {
      const leader: { id: string; name: string } = totalA > totalB ? teamA : teamB;
      const kind = n === 4 ? 'points' : 'extra';
      const suffix = n === 4 ? '' : ' (EXTRA INNINGS)';
      return {
        kind: 'completed',
        winner: {
          resolved: true,
          winnerTeamId: leader.id,
          kind,
          label: `WON BY ${Math.abs(totalA - totalB)} PTS${suffix}`,
          marginPoints: Math.abs(totalA - totalB),
          scores: summarizeScores(d, teams),
        },
      };
    }

    const roundsUsed = d.extraTosses.length;
    if (config.extraInningsEnabled && roundsUsed < config.extraInningsRounds) {
      return { kind: 'prompt_extra_toss', round: roundsUsed + 1 };
    }

    if (config.suddenDeathEnabled) {
      const bothAttempted = teams.every((team) =>
        d.minTimeResults.some((r) => r.teamId === team.id)
      );
      if (bothAttempted) {
        const evaluation = minTimeEvaluation(d, teams);
        if (evaluation) return { kind: 'completed', winner: evaluation };
        return { kind: 'manual_required' };
      }
      return {
        kind: 'min_time',
        pending: teams.filter((team) => !d.minTimeResults.some((r) => r.teamId === team.id)).map((t) => t.id),
      };
    }

    return {
      kind: 'manual_required',
    };
  }

  return {
    kind: 'manual_required',
  };
}

function phaseFor(
  d: DerivedMatch,
  expectation: Expectation
): KhoKhoMatchPhase {
  if (expectation.kind === 'completed') return 'completed';
  const open = openTurnOf(d);
  if (open) return open.status === 'paused' ? 'turn_paused' : 'turn_live';
  switch (expectation.kind) {
    case 'prompt_toss':
      return 'awaiting_toss';
    case 'slot':
      return 'turn_break';
    case 'prompt_follow_on':
      return 'follow_on_prompt';
    case 'prompt_extra_toss':
      return 'awaiting_extra_toss';
    case 'min_time':
      return 'min_time';
    case 'manual_required':
      return 'awaiting_manual_decision';
    default:
      return 'completed';
  }
}

function turnSummary(
  d: DerivedMatch,
  turn: TurnRec,
  teams: Array<{ id: string; name: string }>,
  config: KhoKhoScoringConfig,
  nowMs: number
): KhoKhoTurnSummary {
  const team = teams.find((t) => t.id === turn.chaserTeamId);
  const batchCount = Math.ceil(config.activeSquadCount / config.defendersPerBatch);
  const isLive = turn.status !== 'ended';
  const currentBatch = isLive && turn.dismissals > 0
    ? Math.min(batchCount, Math.floor(turn.dismissals / config.defendersPerBatch) + 1)
    : null;
  const totalDur = config.turnDurationSec * MS_PER_SEC;
  return {
    slot: turn.slot,
    innings: turn.innings,
    turn: turn.turn,
    stage: turn.stage,
    turnLabel: labelForSlot(turn.slot),
    chaserTeamId: turn.chaserTeamId,
    chaserTeamName: team?.name ?? turn.chaserTeamId,
    points: turn.dismissals * config.pointsPerOut,
    dismissals: turn.dismissals,
    fouls: turn.foulCount,
    allOut: turn.allOut,
    status: turn.status,
    startAtMs: turn.startAtMs,
    endAtMs: turn.endAtMs,
    endReason: turn.endEvent?.reason ?? null,
    runningElapsedMs: turn.status === 'ended'
      ? turn.closedRunningMs
      : runningMsAt(turn, nowMs),
    remainingMs:
      turn.status === 'ended'
        ? Math.max(0, totalDur - turn.closedRunningMs)
        : remainingMsAt(turn, nowMs, config),
    pausedSinceMs: turn.status === 'paused' ? turn.pausedSinceMs : null,
    currentBatch,
    batchCount: isLive ? batchCount : null,
    batchDisplay:
      isLive && currentBatch !== null
        ? `Batch ${currentBatch} / ${batchCount}`
        : null,
  };
}

function nextActionOf(
  att: MatchScoringState,
  d: DerivedMatch,
  expectation: Expectation,
  nowMs: number
): KhoKhoNextAction {
  const { teams, config } = att;
  const open = openTurnOf(d);

  if (open) {
    const remaining = remainingMsAt(open, nowMs, config);
    if (open.status === 'paused') {
      return {
        action: 'turn_paused',
        remainingMs: remaining,
        pausedForMs: nowMs - (open.pausedSinceMs ?? nowMs),
      };
    }
    if (open.allOut || remaining <= 0) {
      return { action: 'end_turn_available', reasonHint: open.allOut ? 'all_out' : 'timer_expired', remainingMs: remaining };
    }
    return { action: 'turn_running', remainingMs: remaining };
  }

  if (expectation.kind === 'slot') {
    const chaser = teams.find((t) => t.id === expectation.chaserTeamId);
    return {
      action: 'start_turn',
      innings: inningsForSlot(expectation.slot),
      turn: turnForSlot(expectation.slot),
      stage: stageForSlot(expectation.slot),
      turnLabel: labelForSlot(expectation.slot),
      chaserTeamId: expectation.chaserTeamId,
      chaserTeamName: chaser?.name ?? expectation.chaserTeamId,
    };
  }
  if (expectation.kind === 'prompt_follow_on') {
    const leader = teams.find((t) => t.id === expectation.leaderTeamId);
    return {
      action: 'prompt_follow_on',
      leaderTeamId: expectation.leaderTeamId,
      leaderTeamName: leader?.name ?? expectation.leaderTeamId,
      leadPoints: expectation.leadPoints,
      threshold: config.followOnThreshold,
    };
  }
  if (expectation.kind === 'prompt_extra_toss') return { action: 'prompt_extra_toss', round: expectation.round };
  if (expectation.kind === 'min_time') return { action: 'record_min_time', pendingTeamIds: expectation.pending };
  if (expectation.kind === 'manual_required') return { action: 'prompt_manual_decision' };
  if (expectation.kind === 'completed') return { action: 'completed', winner: expectation.winner };
  return { action: 'prompt_toss' };
}

function getScoreboardInternal(
  state: MatchScoringState,
  nowMs: number
): KhoKhoScoreboard {
  const d = deriveMatch(state);
  const expectation = expectationOf(state, d);
  const open = openTurnOf(d);
  const completedTurns = d.turns
    .filter((turn) => turn.status === 'ended')
    .map((turn) => turnSummary(d, turn, state.teams, state.config, nowMs));

  const teamScore = (teamId: string) => d.totals[teamId] ?? 0;
  const leaderTeamId = finishedScore(d.turns, 2)
    ? (teamScore(d.turns[0].chaserTeamId) >= teamScore(d.turns[1].chaserTeamId)
        ? d.turns[0].chaserTeamId
        : d.turns[1].chaserTeamId)
    : null;
  const leadPoints = finishedScore(d.turns, 2)
    ? Math.abs(teamScore(d.turns[0].chaserTeamId) - teamScore(d.turns[1].chaserTeamId))
    : null;

  const followOn: KhoKhoFollowOnSummary = {
    enabled: state.config.followOnEnabled,
    threshold: state.config.followOnThreshold,
    leadPoints,
    leaderTeamId,
    prompted: expectation.kind === 'prompt_follow_on',
    decided: !!d.followOn,
    opted: d.followOn ? d.followOn.opted : null,
    optedByTeamId: d.followOn ? d.followOn.optedByTeamId : null,
  };

  const tiedNow =
    expectation.kind === 'prompt_extra_toss' ||
    expectation.kind === 'min_time' ||
    (expectation.kind === 'manual_required' && baseTurnsComplete(d.turns) && tiedScores(d, state.teams));

  const extraInnings: KhoKhoExtraInningsSummary = {
    enabled: state.config.extraInningsEnabled,
    roundsAllowed: state.config.extraInningsRounds,
    roundsUsed: d.extraTosses.length,
    tied: tiedNow,
    available: tiedNow && state.config.extraInningsEnabled && d.extraTosses.length < state.config.extraInningsRounds,
  };

  const suddenDeath: KhoKhoSuddenDeathSummary = {
    enabled: state.config.suddenDeathEnabled,
    active: expectation.kind === 'min_time',
    results: d.minTimeResults.map((r) => ({ teamId: r.teamId, scored: r.scored, elapsedMs: r.elapsedMs ?? null })),
    pendingTeamIds: expectation.kind === 'min_time' ? expectation.pending : [],
  };

  const winner = expectation.kind === 'completed'
    ? expectation.winner
    : { resolved: false, winnerTeamId: null, kind: null, label: '', marginPoints: null, scores: summarizeScores(d, state.teams) };

  return {
    sport: 'kho-kho',
    teams: state.teams.map((team) => ({ id: team.id, name: team.name, totalPoints: teamScore(team.id) })),
    phase: phaseFor(d, expectation),
    currentTurn: open ? turnSummary(d, open, state.teams, state.config, nowMs) : null,
    completedTurns,
    nextAction: nextActionOf(state, d, expectation, nowMs),
    followOn,
    extraInnings,
    suddenDeath,
    winner,
    activeEventCount: activeEventView(state.events).active.length,
    voidedEventCount: state.events.length - activeEventView(state.events).active.length,
  };
}

function baseTurnsComplete(turns: TurnRec[]): boolean {
  return turns.length >= 4 && turns.every((t) => t.status === 'ended');
}

function tiedScores(d: DerivedMatch, teams: Array<{ id: string; name: string }>): boolean {
  const a = d.totals[teams[0].id] ?? 0;
  const b = d.totals[teams[1].id] ?? 0;
  return a === b;
}

function finishedScore(turns: TurnRec[], count: number): boolean {
  return turns.length >= count && turns.slice(0, count).every((t) => t.status === 'ended');
}

export const khoKhoScoringEngine = {
  sport: 'kho-kho' as const,

  createInitialState(input: CreateScoringMatchInput): MatchScoringState {
    const teams = [...input.teams];
    if (teams.length !== 2) {
      throw new ScoringRuleError('INVALID_TEAMS', 'A scoring match requires exactly 2 teams.');
    }
    if (teams.some((t) => !t.id || !t.name) || teams[0].id === teams[1].id) {
      throw new ScoringRuleError('INVALID_TEAMS', 'Both teams need distinct non-empty ids and names.');
    }
    return {
      sport: 'kho-kho',
      teams,
      config: { ...DEFAULT_KHO_KHO_SCORING_CONFIG, ...(input.config ?? {}) },
      events: [],
    };
  },

  applyEvent(state: MatchScoringState, event: KhoKhoScoreEvent): MatchScoringState {
    if (state.events.some((ev) => ev.eventId === event.eventId)) return state;
    this.validateEvent(state, event);
    return { ...state, events: [...state.events, event] };
  },

  validateEvent(state: MatchScoringState, candidate: KhoKhoScoreEvent): void {
    const { config } = state;
    if (!candidate.eventId) throw new ScoringRuleError('MALFORMED_EVENT', 'eventId is required.');
    if (!Number.isFinite(candidate.atMs)) throw new ScoringRuleError('MALFORMED_EVENT', 'atMs must be a number.');

    const last = state.events.length > 0 ? state.events[state.events.length - 1] : null;
    if (last && candidate.atMs < last.atMs) {
      throw new ScoringRuleError('TIMESTAMP_OUT_OF_ORDER', 'Event time is before the last recorded event.');
    }

    const d = deriveMatch(state);
    const view = activeEventView(state.events);
    const isKnownTeam = (id: string | undefined | null) => !!id && state.teams.some((t) => t.id === id);

    switch (candidate.type) {
      case 'TOSS':
      case 'TURN_START':
      case 'DISMISSAL':
      case 'FOUL_LOG':
      case 'TURN_PAUSE':
      case 'TURN_RESUME':
      case 'TURN_END': {
        const dManual = d.manual;
        if (dManual) {
          throw new ScoringRuleError(
            'MATCH_ALREADY_COMPLETED',
            `The match is already decided by a manual decision recorded for team ${dManual.winnerTeamId}.`
          );
        }
        break;
      }
      default:
        break;
    }

    switch (candidate.type) {
      case 'TOSS': {
        if (!isKnownTeam(candidate.winnerTeamId)) {
          throw new ScoringRuleError('TEAM_NOT_FOUND', 'Toss winner is not part of this match.');
        }
        if (candidate.decision !== 'CHASE' && candidate.decision !== 'DEFEND') {
          throw new ScoringRuleError('MALFORMED_EVENT', 'Toss decision must be CHASE or DEFEND.');
        }
        if (candidate.stage === 'first_innings') {
          if (d.firstToss) throw new ScoringRuleError('TOSS_ALREADY_RECORDED', 'The first-innings toss is already recorded.');
          const expectation = expectationOf(state, d);
          if (expectation.kind !== 'prompt_toss') {
            throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'A first-innings toss cannot be recorded right now.');
          }
          return;
        }
        if (!d.firstToss) {
          throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'Extra-innings toss cannot come before the first toss.');
        }
        const expectation = expectationOf(state, d);
        if (expectation.kind !== 'prompt_extra_toss') {
          throw new ScoringRuleError('TOSS_NOT_EXPECTED', 'An extra-innings toss is not expected right now.');
        }
        return;
      }

      case 'TURN_START': {
        const expectation = expectationOf(state, d);
        if (expectation.kind !== 'slot') {
          throw new ScoringRuleError('TURN_START_NOT_EXPECTED', 'A turn cannot start right now. Complete the pending prompt first.');
        }
        if (candidate.chaserTeamId !== undefined && candidate.chaserTeamId !== expectation.chaserTeamId) {
          throw new ScoringRuleError('TURN_START_MISMATCH', 'Supplied chaser does not match the scheduled chaser.');
        }
        if (candidate.innings !== undefined && candidate.innings !== inningsForSlot(expectation.slot)) {
          throw new ScoringRuleError('TURN_START_MISMATCH', 'Supplied innings does not match the scheduled turn.');
        }
        if (candidate.turn !== undefined && candidate.turn !== turnForSlot(expectation.slot)) {
          throw new ScoringRuleError('TURN_START_MISMATCH', 'Supplied turn number does not match the scheduled turn.');
        }
        return;
      }

      case 'DISMISSAL': {
        const open = openTurnOf(d);
        if (!open || open.status === 'ended') {
          throw new ScoringRuleError('NO_OPEN_TURN', 'No turn is running; start a turn before recording a dismissal.');
        }
        if (open.status === 'paused') {
          throw new ScoringRuleError('CLOCK_STOPPED_RESUME_REQUIRED', 'The turn clock is stopped. Resume the clock before recording dismissals.');
        }
        if (remainingMsAt(open, candidate.atMs, config) <= 0) {
          throw new ScoringRuleError('TURN_TIMER_EXPIRED', 'The turn timer has expired; end the turn before recording further events.');
        }
        const types: KhoKhoDismissalType[] = ['TAG', 'OUT_OF_BOUNDS', 'LATE_ENTRY'];
        if (!types.includes(candidate.dismissalType)) {
          throw new ScoringRuleError('MALFORMED_EVENT', 'dismissalType must be TAG, OUT_OF_BOUNDS or LATE_ENTRY.');
        }
        return;
      }

      case 'FOUL_LOG': {
        const open = openTurnOf(d);
        if (!open || open.status !== 'live') {
          throw new ScoringRuleError(
            open && open.status === 'paused' ? 'CLOCK_STOPPED_RESUME_REQUIRED' : 'NO_OPEN_TURN',
            open && open.status === 'paused'
              ? 'The turn clock is stopped. Resume the clock before logging a foul.'
              : 'No turn is running; start a turn before logging a foul.'
          );
        }
        if (remainingMsAt(open, candidate.atMs, config) <= 0) {
          throw new ScoringRuleError('TURN_TIMER_EXPIRED', 'The turn timer has expired; end the turn before logging further events.');
        }
        return;
      }

      case 'TURN_PAUSE': {
        const open = openTurnOf(d);
        if (!open || open.status !== 'live') {
          throw new ScoringRuleError('CLOCK_NOT_RUNNING', 'Pause requires a running turn.');
        }
        if (remainingMsAt(open, candidate.atMs, config) <= 0) {
          throw new ScoringRuleError('TURN_TIMER_EXPIRED', 'The turn timer has expired; end the turn instead of pausing.');
        }
        return;
      }

      case 'TURN_RESUME': {
        const open = openTurnOf(d);
        if (!open || open.status !== 'paused') {
          throw new ScoringRuleError('CLOCK_NOT_STOPPED', 'Resume requires a stopped clock.');
        }
        return;
      }

      case 'TURN_END': {
        const open = openTurnOf(d);
        if (!open) throw new ScoringRuleError('NO_OPEN_TURN', 'No turn is running to end.');
        if (open.status === 'paused') {
          throw new ScoringRuleError('CLOCK_STOPPED_END_BLOCKED', 'The turn cannot end while the clock is stopped. Resume the clock first.');
        }
        if (open.status !== 'live') {
          throw new ScoringRuleError('NO_OPEN_TURN', 'No turn is running to end.');
        }
        if (candidate.reason === 'timer_expired') {
          if (remainingMsAt(open, candidate.atMs, config) > config.turnEndGraceMs) {
            throw new ScoringRuleError('TURN_NOT_EXPIRED', 'The turn timer has not reached zero yet.');
          }
          return;
        }
        if (candidate.reason === 'all_out') {
          if (open.dismissals < config.activeSquadCount) {
            throw new ScoringRuleError('ALL_OUT_NOT_REACHED', 'All-out requires every active defender dismissed.');
          }
          return;
        }
        if (candidate.reason === 'manual') {
          if (!candidate.reasonText || !candidate.reasonText.trim()) {
            throw new ScoringRuleError('REASON_REQUIRED', 'A manual turn end requires a reason.');
          }
          return;
        }
        throw new ScoringRuleError('MALFORMED_EVENT', 'Turn end reason must be timer_expired, all_out or manual.');
      }

      case 'FOLLOW_ON_DECISION': {
        const expectation = expectationOf(state, d);
        if (expectation.kind !== 'prompt_follow_on') {
          throw new ScoringRuleError('FOLLOW_ON_NOT_EXPECTED', 'A follow-on decision is not expected right now.');
        }
        if (candidate.optedByTeamId !== expectation.leaderTeamId) {
          throw new ScoringRuleError('NOT_LEADING_TEAM', 'Only the leading team can exercise the follow-on option.');
        }
        return;
      }

      case 'MIN_TIME_RESULT': {
        const expectation = expectationOf(state, d);
        if (expectation.kind !== 'min_time' || !expectation.pending.includes(candidate.teamId)) {
          throw new ScoringRuleError('MIN_TIME_NOT_EXPECTED', 'A sudden-death result is not expected for this team right now.');
        }
        if (!isKnownTeam(candidate.teamId)) {
          throw new ScoringRuleError('TEAM_NOT_FOUND', 'Sudden-death team is not part of this match.');
        }
        if (candidate.scored) {
          if (!Number.isFinite(candidate.elapsedMs) || (candidate.elapsedMs ?? 0) <= 0) {
            throw new ScoringRuleError('ELAPSED_REQUIRED', 'A scored sudden-death attempt requires a positive elapsedMs.');
          }
          const limit = config.suddenDeathTurnDurationSec * MS_PER_SEC + config.turnEndGraceMs;
          if ((candidate.elapsedMs ?? 0) > limit) {
            throw new ScoringRuleError('ELAPSED_OUT_OF_RANGE', 'The score was recorded after the sudden-death limit; record it as a failed attempt instead.');
          }
        }
        return;
      }

      case 'MANUAL_DECISION': {
        if (d.manual) throw new ScoringRuleError('ALREADY_DECIDED', 'The match already has a manual decision recorded.');
        if (!isKnownTeam(candidate.winnerTeamId)) {
          throw new ScoringRuleError('TEAM_NOT_FOUND', 'Manual-decision winner is not part of this match.');
        }
        if (!candidate.reason || !candidate.reason.trim()) {
          throw new ScoringRuleError('REASON_REQUIRED', 'A manual decision requires a reason.');
        }
        const expectation = expectationOf(state, d);
        if (expectation.kind === 'completed') {
          throw new ScoringRuleError('MATCH_ALREADY_COMPLETED', 'The match is already decided.');
        }
        return;
      }

      case 'VOID': {
        const target = state.events.find((ev) => ev.eventId === candidate.targetEventId);
        if (!target) throw new ScoringRuleError('TARGET_NOT_FOUND', 'Void target event not found.');
        if (view.voidedIds.has(candidate.targetEventId)) {
          throw new ScoringRuleError('TARGET_ALREADY_VOIDED', 'The target event is already voided.');
        }
        if (target.type === 'VOID') {
          throw new ScoringRuleError('VOID_TARGET_INVALID', 'A void event cannot be the target of another void.');
        }
        const active = view.active;
        const lastActive = active.length > 0 ? active[active.length - 1] : null;
        if (!lastActive || lastActive.eventId !== candidate.targetEventId) {
          throw new ScoringRuleError('ONLY_LAST_EVENT_VOIDABLE', 'Only the most recent scoring action can be voided.');
        }
        return;
      }

      default:
        throw new ScoringRuleError('MALFORMED_EVENT', 'Unknown event type.');
    }
  },

  getScoreboard(state: MatchScoringState, nowMs?: number): KhoKhoScoreboard {
    return getScoreboardInternal(state, nowMs ?? Date.now());
  },

  getNextAction(state: MatchScoringState, nowMs?: number): KhoKhoNextAction {
    return this.getScoreboard(state, nowMs).nextAction;
  },

  canUndo(state: MatchScoringState): boolean {
    return khoKhoScoringEngine.getUndoTarget(state) !== null;
  },

  getUndoTarget(state: MatchScoringState): KhoKhoScoreEvent | null {
    const view = activeEventView(state.events);
    const lastActive = view.active.length > 0 ? view.active[view.active.length - 1] : null;
    if (!lastActive || lastActive.type === 'VOID') return null;
    return lastActive;
  },

  computeWinner(state: MatchScoringState): KhoKhoWinnerEvaluation {
    const d = deriveMatch(state);
    const expectation = expectationOf(state, d);
    if (expectation.kind === 'completed') return expectation.winner;
    return {
      resolved: false,
      winnerTeamId: null,
      kind: null,
      label: '',
      marginPoints: null,
      scores: summarizeScores(d, state.teams),
    };
  },
};

export { activeEventView, expectationOf, deriveMatch };
