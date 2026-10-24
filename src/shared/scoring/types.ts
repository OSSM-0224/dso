export type ScoringSport = 'kho-kho';

export type ScoringAgeGroup = 'U-14' | 'U-17' | 'U-19' | 'Open';

export interface ScoringTeamRef {
  id: string;
  name: string;
}

export interface KhoKhoScoringConfig {
  turnDurationSec: number;
  activeSquadCount: number;
  defendersPerBatch: number;
  pointsPerOut: number;
  followOnEnabled: boolean;
  followOnThreshold: number;
  extraInningsEnabled: boolean;
  extraInningsRounds: number;
  suddenDeathEnabled: boolean;
  suddenDeathTurnDurationSec: number;
  turnEndGraceMs: number;
}

export const DEFAULT_KHO_KHO_SCORING_CONFIG: KhoKhoScoringConfig = {
  turnDurationSec: 420,
  activeSquadCount: 9,
  defendersPerBatch: 3,
  pointsPerOut: 1,
  followOnEnabled: true,
  followOnThreshold: 9,
  extraInningsEnabled: true,
  extraInningsRounds: 1,
  suddenDeathEnabled: true,
  suddenDeathTurnDurationSec: 300,
  turnEndGraceMs: 2000,
};

export function defaultKhoKhoConfigForAgeGroup(
  ageGroup: ScoringAgeGroup
): KhoKhoScoringConfig {
  const turnDurationSec = ageGroup === 'U-17' || ageGroup === 'U-19' ? 540 : 420;
  return { ...DEFAULT_KHO_KHO_SCORING_CONFIG, turnDurationSec };
}

export class ScoringRuleError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScoringRuleError';
    this.code = code;
  }
}

interface ScoringEventBase {
  eventId: string;
  atMs: number;
  recordedBy?: string;
}

export type KhoKhoTossStage = 'first_innings' | 'extra_innings';

export interface KhoKhoTossEvent extends ScoringEventBase {
  type: 'TOSS';
  stage: KhoKhoTossStage;
  winnerTeamId: string;
  decision: 'CHASE' | 'DEFEND';
}

export interface KhoKhoTurnStartEvent extends ScoringEventBase {
  type: 'TURN_START';
  innings?: number;
  turn?: number;
  chaserTeamId?: string;
}

export interface KhoKhoTurnPauseEvent extends ScoringEventBase {
  type: 'TURN_PAUSE';
}

export interface KhoKhoTurnResumeEvent extends ScoringEventBase {
  type: 'TURN_RESUME';
}

export type KhoKhoTurnEndReason = 'timer_expired' | 'all_out' | 'manual';

export interface KhoKhoTurnEndEvent extends ScoringEventBase {
  type: 'TURN_END';
  reason: KhoKhoTurnEndReason;
  reasonText?: string;
}

export type KhoKhoDismissalType = 'TAG' | 'OUT_OF_BOUNDS' | 'LATE_ENTRY';

export interface KhoKhoDismissalEvent extends ScoringEventBase {
  type: 'DISMISSAL';
  dismissalType: KhoKhoDismissalType;
  defenderPlayerId?: string;
}

export interface KhoKhoFoulEvent extends ScoringEventBase {
  type: 'FOUL_LOG';
  note?: string;
}

export interface KhoKhoFollowOnEvent extends ScoringEventBase {
  type: 'FOLLOW_ON_DECISION';
  optedByTeamId: string;
  opted: boolean;
}

export interface KhoKhoMinTimeEvent extends ScoringEventBase {
  type: 'MIN_TIME_RESULT';
  teamId: string;
  scored: boolean;
  elapsedMs?: number;
}

export interface KhoKhoManualDecisionEvent extends ScoringEventBase {
  type: 'MANUAL_DECISION';
  winnerTeamId: string;
  reason: string;
}

export interface VoidScoringEvent extends ScoringEventBase {
  type: 'VOID';
  targetEventId: string;
}

export type KhoKhoScoreEvent =
  | KhoKhoTossEvent
  | KhoKhoTurnStartEvent
  | KhoKhoTurnPauseEvent
  | KhoKhoTurnResumeEvent
  | KhoKhoTurnEndEvent
  | KhoKhoDismissalEvent
  | KhoKhoFoulEvent
  | KhoKhoFollowOnEvent
  | KhoKhoMinTimeEvent
  | KhoKhoManualDecisionEvent
  | VoidScoringEvent;

export interface MatchScoringState {
  sport: ScoringSport;
  teams: ScoringTeamRef[];
  config: KhoKhoScoringConfig;
  events: KhoKhoScoreEvent[];
}

export interface CreateScoringMatchInput {
  teams: ScoringTeamRef[];
  config?: Partial<KhoKhoScoringConfig>;
}

export type KhoKhoTurnStatus = 'live' | 'paused' | 'ended';

export type KhoKhoTurnStageLabel =
  | 'Innings 1'
  | 'Innings 2'
  | 'Extra Innings';

export interface KhoKhoTurnSummary {
  slot: number;
  innings: number;
  turn: number;
  stage: KhoKhoTurnStageLabel;
  turnLabel: string;
  chaserTeamId: string;
  chaserTeamName: string;
  points: number;
  dismissals: number;
  fouls: number;
  allOut: boolean;
  status: KhoKhoTurnStatus;
  startAtMs: number | null;
  endAtMs: number | null;
  endReason: KhoKhoTurnEndReason | null;
  runningElapsedMs: number;
  remainingMs: number | null;
  pausedSinceMs: number | null;
  currentBatch: number | null;
  batchCount: number | null;
  batchDisplay: string | null;
}

export type KhoKhoMatchPhase =
  | 'awaiting_toss'
  | 'turn_live'
  | 'turn_paused'
  | 'turn_break'
  | 'follow_on_prompt'
  | 'awaiting_extra_toss'
  | 'min_time'
  | 'awaiting_manual_decision'
  | 'completed';

export type KhoKhoWinnerKind =
  | 'points'
  | 'innings'
  | 'extra'
  | 'min_time'
  | 'manual';

export interface KhoKhoWinnerEvaluation {
  resolved: boolean;
  winnerTeamId: string | null;
  kind: KhoKhoWinnerKind | null;
  label: string;
  marginPoints: number | null;
  scores: Record<string, number>;
}

export interface KhoKhoFollowOnSummary {
  enabled: boolean;
  threshold: number;
  leadPoints: number | null;
  leaderTeamId: string | null;
  prompted: boolean;
  decided: boolean;
  opted: boolean | null;
  optedByTeamId: string | null;
}

export interface KhoKhoExtraInningsSummary {
  enabled: boolean;
  roundsAllowed: number;
  roundsUsed: number;
  tied: boolean;
  available: boolean;
}

export interface KhoKhoSuddenDeathResult {
  teamId: string;
  scored: boolean;
  elapsedMs: number | null;
}

export interface KhoKhoSuddenDeathSummary {
  enabled: boolean;
  active: boolean;
  results: KhoKhoSuddenDeathResult[];
  pendingTeamIds: string[];
}

export type KhoKhoNextAction =
  | { action: 'prompt_toss' }
  | {
      action: 'start_turn';
      innings: number;
      turn: number;
      stage: KhoKhoTurnStageLabel;
      turnLabel: string;
      chaserTeamId: string;
      chaserTeamName: string;
    }
  | { action: 'turn_running'; remainingMs: number }
  | {
      action: 'turn_paused';
      remainingMs: number;
      pausedForMs: number;
    }
  | {
      action: 'end_turn_available';
      reasonHint: 'timer_expired' | 'all_out';
      remainingMs: number;
    }
  | {
      action: 'prompt_follow_on';
      leaderTeamId: string;
      leaderTeamName: string;
      leadPoints: number;
      threshold: number;
    }
  | { action: 'prompt_extra_toss'; round: number }
  | { action: 'record_min_time'; pendingTeamIds: string[] }
  | { action: 'prompt_manual_decision' }
  | { action: 'completed'; winner: KhoKhoWinnerEvaluation };

export interface KhoKhoScoreboard {
  sport: ScoringSport;
  teams: Array<{ id: string; name: string; totalPoints: number }>;
  phase: KhoKhoMatchPhase;
  currentTurn: KhoKhoTurnSummary | null;
  completedTurns: KhoKhoTurnSummary[];
  nextAction: KhoKhoNextAction;
  followOn: KhoKhoFollowOnSummary | null;
  extraInnings: KhoKhoExtraInningsSummary;
  suddenDeath: KhoKhoSuddenDeathSummary;
  winner: KhoKhoWinnerEvaluation;
  activeEventCount: number;
  voidedEventCount: number;
}

export const PAUSE_REMINDER_MS = 120000;
