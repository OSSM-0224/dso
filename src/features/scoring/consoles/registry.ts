'use client';

/**
 * SPORT-PLUGGABLE console registry.
 *
 * Maps `tournament.sport` -> { engineId, Console, LiveView, configSummary }.
 * The scoring console host (`ScoringConsoleHost`) resolves the Console here;
 * hub cards and the school/public live panels resolve the LiveView here.
 * An unknown/unsupported sport returns `null` from `getSportConsole` so the
 * host can render the friendly "not available yet" screen.
 *
 * How to add a new sport (full checklist in README):
 *   1. engine strategy in src/shared/scoring  2. config schema
 *   3. Console component  4. LiveView component  5. registry entry  6. tests
 */
import type { ComponentType } from 'react';

import type { MatchScoreViewDto, MatchDoc, ScoringMatchDetail } from '@/shared/types.ts';
import type { KhoKhoScoringConfig } from '@/shared/scoring/types.ts';
import { defaultKhoKhoConfigForAgeGroup, type ScoringAgeGroup } from '@/shared/scoring/types.ts';

import { KhoKhoConsole } from './khoKho/KhoKhoConsole';
import { KhoKhoLiveView } from './khoKho/KhoKhoLiveView';

/** Common tournament info handed to every console (never a full TeamDoc). */
export type SportConsoleTournament = {
  id: string;
  name: string;
  sport: string;
  status: string;
  ageGroup: string;
  gender: string;
};

/** Session-level operations every console can rely on (host-provided). */
export type SportConsoleActions = {
  /** Create (or resume) the scoring session (POST ensure). */
  startScoring(): Promise<void>;
  /** Re-read the authoritative match/score state. */
  refresh(silent?: boolean): Promise<void>;
  /** Finalize through the engine + bracket pipeline. */
  completeMatch(): Promise<void>;
  /** Emergency winner decision (audited on the server). */
  overrideWinner(data: { winnerTeamId: string; reason: string }): Promise<void>;
};

/** What the registry hands each sport's Console component. */
export type SportConsoleProps = {
  tournamentId: string;
  matchId: string;
  tournament: SportConsoleTournament;
  match: ScoringMatchDetail['match'];
  score: MatchScoreViewDto | null;
  canWrite: boolean;
  /** Completed/archived tournament => render read-only. */
  isReadOnly: boolean;
  scorerNames: string[];
  actions: SportConsoleActions;
};

/** Live summary embedded in hubs, the school portal and the public page. */
export type SportLiveViewProps = {
  match: MatchDoc;
  score: MatchScoreViewDto | null;
  snapshotAt?: number;
  stale?: boolean;
  title?: string;
  isReadOnly?: boolean;
};

export type SportConsoleRegistryEntry = {
  /** Shared engine id used by BOTH the server service and the client replay. */
  engineId: string;
  Console: ComponentType<SportConsoleProps>;
  LiveView: ComponentType<SportLiveViewProps>;
  /** One-line rule summary for the hub header (per-tournament config). */
  configSummary: (tournament: TournamentScorerRosterOrTournament) => string;
};

// Minimal structural tournament type so the registry stays decoupled from the
// full admin-only TournamentDoc.
type TournamentScorerRosterOrTournament = {
  sport: string;
  ageGroup: string;
  gender: string;
};

const registry: Record<string, SportConsoleRegistryEntry> = {
  'kho-kho': {
    engineId: 'kho-kho',
    Console: KhoKhoConsole,
    LiveView: KhoKhoLiveView,
    configSummary: (t) => {
      if (t.sport !== 'kho-kho') return `${t.ageGroup} · ${t.gender}`;
      const cfg: KhoKhoScoringConfig = defaultKhoKhoConfigForAgeGroup(t.ageGroup as ScoringAgeGroup);
      return `${t.ageGroup} · ${t.gender} · ${Math.round(cfg.turnDurationSec / 60)} min turns · ${cfg.pointsPerOut} pt/out`;
    },
  },
};

export function getSportConsole(sport: string): SportConsoleRegistryEntry | null {
  if (!sport) return registry['kho-kho'] ?? null;
  return registry[sport] ?? null;
}

export function getSportLiveView(sport: string): ComponentType<SportLiveViewProps> | null {
  return getSportConsole(sport)?.LiveView ?? null;
}

export function listSportConsoles(): Array<{ sport: string; entry: SportConsoleRegistryEntry }> {
  return Object.entries(registry).map(([sport, entry]) => ({ sport, entry }));
}

export { KhoKhoConsole, KhoKhoLiveView };
