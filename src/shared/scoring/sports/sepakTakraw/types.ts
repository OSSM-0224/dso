/**
 * Sepak takraw scoring: config, roles, point/fault catalogues, events,
 * state and scoreboard types.
 * Values follow typical ISTAF-style regu rules — DSO must verify each against
 * the school rulebook before publishing a tournament (all are config values).
 */
import type { ScoringEventBase, ScoringTeamRef } from "../../types.ts";

export type SepakTakrawPlayerRole = "TEKONG" | "FEEDER" | "STRIKER";

/** On-court roles in regu: Tekong serves, Feeder + Striker play inside. */
export const SEPAK_TAKRAW_ROLES: SepakTakrawPlayerRole[] = [
  "TEKONG",
  "FEEDER",
  "STRIKER",
];

export const SEPAK_TAKRAW_ROLE_LABELS: Record<SepakTakrawPlayerRole, string> = {
  TEKONG: "T",
  FEEDER: "F",
  STRIKER: "S",
};

export type SepakTakrawPointType = "ACE" | "ATTACK" | "BLOCK" | "OTHER";

export type SepakTakrawFaultCategory = "service" | "play" | "boundary";

export type SepakTakrawFaultType =
  // service faults — serving team only
  | "TEKONG_STANDING_FAULT"
  | "INSIDE_PLAYERS_FAULT"
  | "BAD_THROW"
  | "BALL_TOUCHING_NET_ON_SERVE"
  // play faults
  | "FOUR_TOUCHES"
  | "DOUBLE_KICK"
  | "NET_TOUCH"
  // boundary faults
  | "CROSSING_THE_NET"
  | "UNDER_THE_NET";

export interface SepakTakrawFaultDef {
  type: SepakTakrawFaultType;
  category: SepakTakrawFaultCategory;
  label: string;
}

export const SEPAK_TAKRAW_FAULTS: SepakTakrawFaultDef[] = [
  { type: "TEKONG_STANDING_FAULT", category: "service", label: "Tekong standing fault" },
  { type: "INSIDE_PLAYERS_FAULT", category: "service", label: "Inside players fault" },
  { type: "BAD_THROW", category: "service", label: "Bad throw (foot above baseline level)" },
  { type: "BALL_TOUCHING_NET_ON_SERVE", category: "service", label: "Serve touched the net" },
  { type: "FOUR_TOUCHES", category: "play", label: "Four touches" },
  { type: "DOUBLE_KICK", category: "play", label: "Double kick" },
  { type: "NET_TOUCH", category: "play", label: "Net touch" },
  { type: "CROSSING_THE_NET", category: "boundary", label: "Crossing the net" },
  { type: "UNDER_THE_NET", category: "boundary", label: "Under the net" },
];

export type SepakTakrawFaultByCategory = Record<SepakTakrawFaultCategory, SepakTakrawFaultDef[]>;

export function sepaTakrawFaultsByCategory(): SepakTakrawFaultByCategory {
  return {
    service: SEPAK_TAKRAW_FAULTS.filter((f) => f.category === "service"),
    play: SEPAK_TAKRAW_FAULTS.filter((f) => f.category === "play"),
    boundary: SEPAK_TAKRAW_FAULTS.filter((f) => f.category === "boundary"),
  };
}

export interface SepakTakrawScoringConfig {
  bestOf: number; // best-of-N sets (default 3 → first to 2 set wins)
  setPoints: number; // regular set target (21)
  deuceAt: number; // both teams at/above this → win by 2 (20)
  cap: number; // hard cap for a regular set (25)
  decidingSetPoints: number; // deciding set target (15)
  decidingDeuceAt: number; // deciding set deuce threshold (14)
  decidingCap: number; // deciding set cap (17)
  serveRotation: number; // consecutive serves per team before swapping (3)
  letServeAllowed: boolean; // true = served ball touching the net landing in is played on
  firstServeAlternate: boolean; // set N+1 first server flips
  serveTossInDecidingSet: boolean; // fresh toss decides the deciding set's first serve
  sideChangeDecidingSetAt: number; // deciding-set side change when a team reaches 8
  timeoutsPerSet: number; // timeouts per team per set (1)
  injuryPauseAllowed: boolean; // medical pause support
  playersOnCourt: number; // regu (3)
  maxRosterSize: number; // regu roster (5)
}

export const DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG: SepakTakrawScoringConfig = {
  bestOf: 3,
  setPoints: 21,
  deuceAt: 20,
  cap: 25,
  decidingSetPoints: 15,
  decidingDeuceAt: 14,
  decidingCap: 17,
  serveRotation: 3,
  letServeAllowed: false,
  firstServeAlternate: true,
  serveTossInDecidingSet: true,
  sideChangeDecidingSetAt: 8,
  timeoutsPerSet: 1,
  injuryPauseAllowed: true,
  playersOnCourt: 3,
  maxRosterSize: 5,
};

/** Rules are identical across age groups for now — hook for later DSO tweaks. */
export function defaultSepakTakrawConfigForAgeGroup(
  _ageGroup: "U-14" | "U-17" | "U-19" | "Open",
): SepakTakrawScoringConfig {
  return { ...DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG };
}

/** Roster caps. Sports absent from this map are uncapped (kho-kho untouched). */
export const MAX_ROSTER_BY_SPORT: Record<string, number> = {
  "sepak-takraw": DEFAULT_SEPAK_TAKRAW_SCORING_CONFIG.maxRosterSize,
};

// --------------------------------------------------------------- events

export type SepakTakrawTossChoice = "SERVE" | "RECEIVE";

export interface SepakTakrawTossEvent extends ScoringEventBase {
  type: "TOSS";
  winnerTeamId: string;
  choice: SepakTakrawTossChoice;
  /** 1 for the opening toss; the deciding set number for the deciding toss. */
  forSetNo?: number;
}

export interface SepakTakrawLineupSlot {
  playerId: string;
  role: SepakTakrawPlayerRole;
}

export interface SepakTakrawLineupEvent extends ScoringEventBase {
  type: "LINEUP_SET";
  teamId: string;
  onCourt: SepakTakrawLineupSlot[];
  subs: string[];
}

export interface SepakTakrawRoleSwapEvent extends ScoringEventBase {
  type: "ROLE_SWAP";
  teamId: string;
  playerId: string;
  withPlayerId: string;
}

export interface SepakTakrawSubstitutionEvent extends ScoringEventBase {
  type: "SUBSTITUTION";
  teamId: string;
  outPlayerId: string;
  inPlayerId: string;
}

export interface SepakTakrawSetStartEvent extends ScoringEventBase {
  type: "SET_START";
  setNo: number;
}

export interface SepakTakrawPointEvent extends ScoringEventBase {
  type: "POINT";
  pointType: SepakTakrawPointType;
  scoringTeamId: string;
  playerId?: string;
}

export interface SepakTakrawFaultEvent extends ScoringEventBase {
  type: "FAULT";
  faultType: SepakTakrawFaultType;
  faultyTeamId: string;
  playerId?: string;
}

export interface SepakTakrawAttributionEvent extends ScoringEventBase {
  type: "PLAYER_ATTRIBUTION";
  targetEventId: string;
  playerId: string | null;
}

export interface SepakTakrawTimeoutEvent extends ScoringEventBase {
  type: "TIMEOUT";
  teamId: string;
  setNo: number;
}

export interface SepakTakrawSideChangeEvent extends ScoringEventBase {
  type: "SIDE_CHANGE_CONFIRMED";
  setNo: number;
}

export interface SepakTakrawManualDecisionEvent extends ScoringEventBase {
  type: "MANUAL_DECISION";
  winnerTeamId: string;
  reason: string;
}

export interface SepakTakrawVoidEvent extends ScoringEventBase {
  type: "VOID";
  targetEventId: string;
}

export type SepakTakrawScoreEvent =
  | SepakTakrawTossEvent
  | SepakTakrawLineupEvent
  | SepakTakrawRoleSwapEvent
  | SepakTakrawSubstitutionEvent
  | SepakTakrawSetStartEvent
  | SepakTakrawPointEvent
  | SepakTakrawFaultEvent
  | SepakTakrawAttributionEvent
  | SepakTakrawTimeoutEvent
  | SepakTakrawSideChangeEvent
  | SepakTakrawManualDecisionEvent
  | SepakTakrawVoidEvent;

// ---------------------------------------------------------------- state

export interface SepakTakrawScoringState {
  sport: "sepak-takraw";
  teams: ScoringTeamRef[];
  config: SepakTakrawScoringConfig;
  events: SepakTakrawScoreEvent[];
}

export interface CreateSepakTakrawMatchInput {
  teams: ScoringTeamRef[];
  config?: Partial<SepakTakrawScoringConfig>;
}

// ------------------------------------------------------------ scoreboard

export interface SepakTakrawSetEntry {
  setNo: number;
  points: Record<string, number>; // teamId -> points in that set
  winnerTeamId: string | null;
  completed: boolean;
  deuceEntered: boolean;
}

export type SepakTakrawPhase =
  | "awaiting_toss"
  | "awaiting_lineups"
  | "awaiting_set_start"
  | "set_live"
  | "set_break"
  | "completed";

export interface SepakTakrawServing {
  teamId: string;
  playerId: string | null; // current TEKONG role holder
  serveCount: number; // 1..maxServes (displayed BEFORE each serve: 1/3, 2/3, 3/3)
  maxServes: number; // serveRotation normally; 1 at deuce (display 1/1)
}

export type SepakTakrawWinnerEvaluation = {
  resolved: boolean;
  winnerTeamId: string | null;
  kind: "sets" | "manual" | null;
  label: string;
};

export type SepakTakrawNextAction =
  | { action: "prompt_toss"; setNo: number }
  | { action: "require_lineups"; missingTeamIds: string[] }
  | { action: "start_set"; setNo: number; deciding: boolean }
  | { action: "rally_ready" }
  | { action: "side_change_pending"; threshold: number }
  | { action: "set_complete"; setNo: number; winnerTeamId: string }
  | { action: "completed"; winner: SepakTakrawWinnerEvaluation };

export interface SepakTakrawStatsRow {
  playerId: string | null;
  teamId: string | null;
  jerseyNumber: number | null;
  values: Record<string, number>;
}

export interface SepakTakrawScoreboard {
  sport: "sepak-takraw";
  teams: ScoringTeamRef[];
  phase: SepakTakrawPhase;
  setNo: number; // set currently open, or next to start
  sets: SepakTakrawSetEntry[];
  setWins: Record<string, number>;
  points: Record<string, number>; // current/set-to-start context
  serving: SepakTakrawServing | null;
  deuce: boolean;
  timeoutsUsed: Record<string, number>; // current set
  sideChangePending: boolean;
  sideChangeConfirmed: boolean;
  winner: SepakTakrawWinnerEvaluation;
  nextAction: SepakTakrawNextAction;
  activeEventCount: number;
  voidedEventCount: number;
}
