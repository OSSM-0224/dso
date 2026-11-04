/**
 * Dodgeball scoring: config, event vocabulary, state and scoreboard types.
 *
 * The values follow the DSO dodgeball rulebook:
 * - 6 main + 4 substitute players, jerseys 1-10.
 * - best of 3 sets of 8 minutes (5-minute short format allowed), 3-minute
 *   interval, teams change ends after each set.
 * - 2-minute extra time when a set is tied, then sudden death (first point).
 * - points for hits, line/area violations, revival failures and red cards.
 * - all six out => +2 bonus (excluding the point for the sixth out) and a
 *   5-second revival window.
 * - 5-second / 3-second delay penalties, yellow/red cards, injury stoppages.
 *
 * Every ambiguous rule is a config flag so a DSO can lock its own reading
 * without touching the engine or the console.
 */
import type { ScoringEventBase, ScoringTeamRef } from "../../types.ts";

export interface DodgeballScoringConfig {
  bestOf: number; // best-of-N sets (default 3 -> first to 2 set wins)
  setDurationSec: number; // 8 minutes (480) or 5-minute short format (300)
  intervalSec: number; // 3-minute interval (display only)
  extraTimeSec: number; // 2-minute extra time when a set is tied
  suddenDeathEnabled: boolean; // first point after extra time wins the set
  playersOnCourt: number; // 6 main players
  minPlayersToStart: number; // 4 players is the minimum to take the court
  maxRosterSize: number; // 10 named players
  maxSubstitutes: number; // 4 substitutes
  jerseyMin: number; // rulebook jerseys 1-10
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
}

export const DEFAULT_DODGEBALL_SCORING_CONFIG: DodgeballScoringConfig = {
  bestOf: 3,
  setDurationSec: 480,
  intervalSec: 180,
  extraTimeSec: 120,
  suddenDeathEnabled: true,
  playersOnCourt: 6,
  minPlayersToStart: 4,
  maxRosterSize: 10,
  maxSubstitutes: 4,
  jerseyMin: 1,
  jerseyMax: 10,
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
  points: number;
  setWins: number;
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
  kind: "sets" | "manual" | null;
  label: string;
  /** Set wins per team (this is what the bracket records). */
  scores: Record<string, number>;
  setWins: Record<string, number>;
}

export type DodgeballNextAction =
  | { action: "prompt_toss" }
  | { action: "require_lineups"; missingTeamIds: string[] }
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
  | { action: "prompt_extra_time"; setNo: number }
  | { action: "prompt_sudden_death"; setNo: number }
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
