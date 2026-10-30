/**
 * SPORT-PLUGGABLE console registry — PURE METADATA (no component imports).
 *
 * Maps `tournament.sport` -> { engineId, configSummary }. Client components
 * are wired in `registryComponents.ts` ('use client') so this module stays
 * importable in server-side unit tests (importing the real Console would
 * pull `next/link`, which is NOT loadable under the `react-server` Node
 * condition that the test runner uses).
 *
 * The console host + reader panels resolve the actual Console/LiveView via
 * `registryComponents.ts`; hub cards and the picker use the pure metadata.
 *
 * How to add a new sport (full checklist in README):
 *   1. engine strategy in src/shared/scoring
 *   2. config schema
 *   3. Console component    4. LiveView component
 *   5. registry entry here   6. registryComponents entry
 *   7. tests
 */
import type { KhoKhoScoringConfig } from '@/shared/scoring/types.ts';
import { defaultKhoKhoConfigForAgeGroup, type ScoringAgeGroup } from '@/shared/scoring/types.ts';

import type { MatchScoreViewDto, MatchDoc, ScoringMatchDetail } from '@/shared/types.ts';

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
  /**
   * Queue a scoring event through the ordered event queue (bug-fix home).
   * Returns false when the score session is not loaded yet.
   */
  postEvent(payload: Record<string, unknown>): boolean;
  /** Undo the last actionable event through the SAME ordered queue. */
  undoEvent(): void;
  /** Create (or resume) the scoring session (POST ensure). */
  startScoring(): Promise<void>;
  /** Re-read the authoritative match/score state. */
  refresh(silent?: boolean): Promise<void>;
  /** Finalize through the engine + bracket pipeline. */
  completeMatch(): Promise<void>;
  /** Emergency winner decision (audited on the server). */
  overrideWinner(data: { winnerTeamId: string; reason: string }): Promise<void>;
};

/** Live sync/window status of the console queue (drives Undo/Complete gating). */
export type SportConsoleSyncStatus = {
  pendingCount: number;
  inFlight: boolean;
  offline: boolean;
  /** Queue drained AND engine allows undo. */
  canUndo: boolean;
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
  sync: SportConsoleSyncStatus;
  /** Message attached to a server 4xx rejection (dropped-count banner). */
  fault: { message: string; droppedCount: number } | null;
  clearFault: () => void;
  /** Clock anchors (server-authoritative, interpolated between polls). */
  nowTick: number;
  snapshotAt: number;
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

/** Pure metadata entry (server-test safe; no React components attached). */
export type SportConsoleMetaEntry = {
  /** Shared engine id used by BOTH the server service and the client replay. */
  engineId: string;
  /** One-line rule summary for the hub header (per-tournament config). */
  configSummary: (tournament: SportConsoleTournamentLike) => string;
};

/** Minimal structural tournament type (decoupled from the admin TournamentDoc). */
export type SportConsoleTournamentLike = {
  sport: string;
  ageGroup: string;
  gender: string;
};

const metaRegistry: Record<string, SportConsoleMetaEntry> = {
  'kho-kho': {
    engineId: 'kho-kho',
    configSummary: (t) => {
      if (t.sport !== 'kho-kho') return `${t.ageGroup} · ${t.gender}`;
      const cfg: KhoKhoScoringConfig = defaultKhoKhoConfigForAgeGroup(t.ageGroup as ScoringAgeGroup);
      return `${t.ageGroup} · ${t.gender} · ${Math.round(cfg.turnDurationSec / 60)} min turns · ${cfg.pointsPerOut} pt/out`;
    },
  },
};

export function getSportConsoleMeta(sport: string): SportConsoleMetaEntry | null {
  if (!sport) return metaRegistry['kho-kho'] ?? null;
  return metaRegistry[sport] ?? null;
}

export function listSportMetas(): Array<{ sport: string; entry: SportConsoleMetaEntry }> {
  return Object.entries(metaRegistry).map(([sport, entry]) => ({ sport, entry }));
}
