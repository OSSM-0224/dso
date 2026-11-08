/**
 * Dodgeball scoring: config, event vocabulary, state and scoreboard types.
 *
 * The values follow the DSO dodgeball rulebook:
 * - two 1:30 sets; a third set is played only when the first two leave the
 *   match level (0-0 or 1-1). A set winner earns one match point for the team.
 * - no toss: the scorer goes straight to set 1.
 * - no jersey numbers: every team fields six anonymous players (Player 1-6).
 * - each team has three balls to attack with.
 * - points are team points only; no individual player scoring.
 * - all six out => +2 bonus (excluding the point for the sixth out) and a
 *   5-second revival window.
 * - 5-second / 3-second delay penalties, yellow/red cards, injury stoppages.
 *
 * Every ambiguous rule is a config flag so a DSO can lock its own reading
 * without touching the engine or the console.
 */
import type { ScoringEventBase, ScoringTeamRef } from "../../types.ts";

export interface DodgeballScoringConfig {
  /** Legacy alias for the maximum number of sets (regulation + decider). */
  bestOf: number;
  /** Sets scheduled before a decider (DSO default: 2). */
  regulationSets: number;
  /** Play one extra set when regulation ends level (DSO default: true). */
  decidingSetOnTie: boolean;
  setDurationSec: number; // 1:30 (90 seconds) per set
  intervalSec: number; // interval between sets (display only)
  extraTimeSec: number; // legacy extra-time length (0 = not used)
  suddenDeathEnabled: boolean; // legacy flag (false = not used)
  playersOnCourt: number; // 6 main players
  minPlayersToStart: number; // legacy lineup minimum
  maxRosterSize: number; // legacy roster cap
  maxSubstitutes: number; // legacy substitute cap
  ballsPerTeam: number; // 3 balls to attack with
  jerseyMin: number; // legacy lineup validation only
  jerseyMax: number;
  hitPoints: number; // direct hit on an opponent
  lineOutPoints: number; // opponent touches/crosses a boundary line
  allOutBonusPoints: number; // +2 when all six opponents are out
  allOutBonusRepeats: boolean; // award the bonus again after every revival cycle
  revivalWindowSec: number; // 5-second re-entry window
  revivalFailurePoints: number; // points to the opponent when revival fails
  catchOutsThrower: boolean; // a clean catch puts the thrower out
  catchRevivesTeammate: boolean; // a clean catch revives one team-mate
  delayPenaltyPoints: number; // 5s/3s delay penalty
  redCardPoints: number; // opponent point for a red card
  injuryOutPoints: number; // opponent point when an injured player leaves
  /** Legacy team display colors (hex); the DSO console no longer uses them. */
  teamAColor?: string;
  teamBColor?: string;
}

export const DEFAULT_DODGEBALL_SCORING_CONFIG: DodgeballScoringConfig = {
  bestOf: 3,
  regulationSets: 2,
  decidingSetOnTie: true,
  setDurationSec: 90,
  intervalSec: 180,
  extraTimeSec: 0,
  suddenDeathEnabled: false,
  playersOnCourt: 6,
  minPlayersToStart: 4,
  maxRosterSize: 10,
  maxSubstitutes: 4,
  ballsPerTeam: 3,
  jerseyMin: 1,
  jerseyMax: 99,
  hitPoints: 1,
  lineOutPoints: 1,
  allOutBonusPoints: 2,
  allOutBonusRepeats: true,
  revivalWindowSec: 5,
  revivalFailurePoints: 1,
  catchOutsThrower: true,
  catchRevivesTeammate: true,
  delayPenaltyPoints: 1,
  redCardPoints: 1,
  injuryOutPoints: 1,
  teamAColor: "#2563EB", // legacy default
  teamBColor: "#DC2626", // legacy default
};

/** Rules are identical across age groups for now — hook for later DSO tweaks. */
export function defaultDodgeballConfigForAgeGroup(
  _ageGroup: "U-14" | "U-17" | "U-19" | "Open",
): DodgeballScoringConfig {
  return { ...DEFAULT_DODGEBALL_SCORING_CONFIG };
}

/** Roster caps for generic UI surfaces that only need a number. */
export const DODGEBALL_MAX_ROSTER = DEFAULT_DODGEBALL_SCORING_CONFIG.maxRosterSize;

// --------------------------------------------------------------- events

export type DodgeballTossChoice = "COURT";

export interface DodgeballTossEvent extends ScoringEventBase {
  type: "TOSS";
  winnerTeamId: string;
  /** The rulebook gives the toss winner the choice of court only. */
  choice?: DodgeballTossChoice;
}

export interface DodgeballLineupEvent extends ScoringEventBase {
  type: "LINEUP_SET";
  teamId: string;
  /** Jersey numbers of the players on court (4-6). */
  onCourt: string[];
  /** Jersey numbers of the substitutes (up to 4). */
  subs: string[];
}

export interface DodgeballSubstitutionEvent extends ScoringEventBase {
  type: "SUBSTITUTION";
  teamId: string;
  outPlayerId: string;
  inPlayerId: string;
}

export interface DodgeballSetStartEvent extends ScoringEventBase {
  type: "SET_START";
  setNo: number;
}

/**
 * DSO team point: one tap awards points to the team only. No player is
 * selected or attributed, and no player is put out.
 */
export interface DodgeballTeamPointEvent extends ScoringEventBase {
  type: "TEAM_POINT";
  teamId: string;
  /** Points to add (default 1). */
  points?: number;
  reason?: string;
}

export interface DodgeballHitEvent extends ScoringEventBase {
  type: "HIT";
  /** Team that scored the hit. The victim is on the other team. */
  teamId: string;
  /** Jersey number of the thrower (optional for unattributed hits). */
  playerId?: string;
  targetPlayerId: string;
}

export interface DodgeballLineOutEvent extends ScoringEventBase {
  type: "LINE_OUT";
  /** Team that scored because the opponent touched/crossed a line. */
  teamId: string;
  /** Optional thrower/player who forced the error. */
  playerId?: string;
  targetPlayerId: string;
}

export interface DodgeballCatchEvent extends ScoringEventBase {
  type: "CATCH";
  /** Team that caught the ball. */
  teamId: string;
  /** Jersey number of the catcher. */
  playerId: string;
  throwerTeamId: string;
  throwerPlayerId?: string;
  /** Out team-mate revived by the catch (when enabled). */
  revivePlayerId?: string;
}

export type DodgeballCardType = "YELLOW" | "RED";

export interface DodgeballCardEvent extends ScoringEventBase {
  type: "CARD";
  cardType: DodgeballCardType;
  /** Team of the offending player. */
  teamId: string;
  playerId: string;
  reason?: string;
}

export interface DodgeballInjuryEvent extends ScoringEventBase {
  type: "INJURY";
  /** Team of the injured player. */
  teamId: string;
  playerId: string;
}

export type DodgeballDelayType = "FIVE_SECOND" | "THREE_SECOND";

export interface DodgeballDelayEvent extends ScoringEventBase {
  type: "DELAY";
  delayType: DodgeballDelayType;
  /** Team that delayed. */
  teamId: string;
  playerId?: string;
}

export interface DodgeballReviveEvent extends ScoringEventBase {
  type: "REVIVE";
  teamId: string;
  /** All out players that re-entered inside the revival window. */
  playerIds: string[];
  reason?: "REVIVAL" | "CATCH";
}

export interface DodgeballRevivalFailedEvent extends ScoringEventBase {
  type: "REVIVAL_FAILED";
  /** Team that failed to re-enter in time. */
  teamId: string;
}

export type DodgeballPauseReason = "INJURY" | "OFFICIAL";

export interface DodgeballPauseEvent extends ScoringEventBase {
  type: "PAUSE";
  reason?: DodgeballPauseReason;
}

export interface DodgeballResumeEvent extends ScoringEventBase {
  type: "RESUME";
}

export type DodgeballSetEndReason = "TIMER" | "MANUAL";

export interface DodgeballSetEndEvent extends ScoringEventBase {
  type: "SET_END";
  setNo: number;
  reason?: DodgeballSetEndReason;
}

export interface DodgeballExtraTimeStartEvent extends ScoringEventBase {
  type: "EXTRA_TIME_START";
  setNo: number;
}

export interface DodgeballSuddenDeathStartEvent extends ScoringEventBase {
  type: "SUDDEN_DEATH_START";
  setNo: number;
}

export interface DodgeballManualDecisionEvent extends ScoringEventBase {
  type: "MANUAL_DECISION";
  winnerTeamId: string;
  reason: string;
}

export interface DodgeballVoidEvent extends ScoringEventBase {
  type: "VOID";
  targetEventId: string;
}

export type DodgeballScoreEvent =
  | DodgeballTossEvent
  | DodgeballLineupEvent
  | DodgeballSubstitutionEvent
  | DodgeballSetStartEvent
  | DodgeballTeamPointEvent
  | DodgeballHitEvent
  | DodgeballLineOutEvent
  | DodgeballCatchEvent
  | DodgeballCardEvent
  | DodgeballInjuryEvent
  | DodgeballDelayEvent
  | DodgeballReviveEvent
  | DodgeballRevivalFailedEvent
  | DodgeballPauseEvent
  | DodgeballResumeEvent
  | DodgeballSetEndEvent
  | DodgeballExtraTimeStartEvent
  | DodgeballSuddenDeathStartEvent
  | DodgeballManualDecisionEvent
  | DodgeballVoidEvent;

// ---------------------------------------------------------------- state

export interface DodgeballScoringState {
  sport: "dodgeball";
  teams: ScoringTeamRef[];
  config: DodgeballScoringConfig;
  events: DodgeballScoreEvent[];
}

export interface CreateDodgeballMatchInput {
  teams: ScoringTeamRef[];
  config?: Partial<DodgeballScoringConfig>;
}

// ------------------------------------------------------------ scoreboard

export type DodgeballOutReason = "HIT" | "LINE_OUT" | "RED_CARD" | "INJURY" | "CATCH";

export type DodgeballPhase =
  | "awaiting_toss"
  | "awaiting_lineups"
  | "awaiting_set_start"
  | "set_live"
  | "set_paused"
  | "awaiting_revival"
  | "extra_time"
  | "sudden_death"
  | "set_break"
  | "completed";

export type DodgeballTimePeriod = "regulation" | "extra_time" | "sudden_death" | "ended";

export interface DodgeballTimeState {
  period: DodgeballTimePeriod;
  remainingMs: number | null;
  expired: boolean;
  paused: boolean;
}

export interface DodgeballSetEntry {
  setNo: number;
  points: Record<string, number>;
  winnerTeamId: string | null;
  completed: boolean;
  startedAtMs: number | null;
  endedAtMs: number | null;
  remainingMs: number | null;
  period: DodgeballTimePeriod;
  extraTime: boolean;
  suddenDeath: boolean;
  allOutCount: Record<string, number>;
}

export interface DodgeballTeamState {
  teamId: string;
  teamName: string;
  /** Team points in the current set (never attributed to a player). */
  points: number;
  /** Match points: one per set won by this team. */
  setWins: number;
  /** Balls available to attack with (DSO rule: 3). */
  balls: number;
  onCourt: string[];
  subs: string[];
  activePlayerIds: string[];
  outPlayerIds: string[];
  disqualifiedPlayerIds: string[];
  activeCount: number;
  revivalPending: boolean;
}

export interface DodgeballRevivalState {
  teamId: string;
  teamName: string;
  outPlayerIds: string[];
  deadlineAtMs: number;
  remainingMs: number;
}

export interface DodgeballWinnerEvaluation {
  resolved: boolean;
  winnerTeamId: string | null;
  kind: "sets" | "manual" | "draw" | null;
  label: string;
  /** Set wins per team (this is what the bracket records). */
  scores: Record<string, number>;
  setWins: Record<string, number>;
}

export type DodgeballNextAction =
  | { action: "start_set"; setNo: number; deciding: boolean }
  | { action: "record_events"; setNo: number }
  | {
      action: "require_revival";
      teamId: string;
      outPlayerIds: string[];
      deadlineAtMs: number;
      remainingMs: number;
    }
  | { action: "set_paused"; remainingMs: number | null; period: DodgeballTimePeriod }
  | { action: "end_set"; setNo: number }
  | { action: "sudden_death"; setNo: number }
  | { action: "completed"; winner: DodgeballWinnerEvaluation };

export interface DodgeballStatsRow {
  playerId: string | null;
  teamId: string | null;
  jerseyNumber: number | null;
  values: Record<string, number>;
}

export interface DodgeballScoreboard {
  sport: "dodgeball";
  teams: ScoringTeamRef[];
  phase: DodgeballPhase;
  /** Set currently open, or the next set to start. */
  setNo: number;
  sets: DodgeballSetEntry[];
  setWins: Record<string, number>;
  /** Points in the current set (or the last played set). */
  points: Record<string, number>;
  time: DodgeballTimeState | null;
  teamStates: DodgeballTeamState[];
  revival: DodgeballRevivalState | null;
  winner: DodgeballWinnerEvaluation;
  nextAction: DodgeballNextAction;
  activeEventCount: number;
  voidedEventCount: number;
}
