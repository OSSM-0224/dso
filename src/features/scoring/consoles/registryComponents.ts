'use client';

/**
 * Client-side SPORT console component registry. Pairs the pure metadata of
 * `registry.ts` with the actual sport components (kept separate so unit
 * tests under the `react-server` Node condition can import the metadata
 * without pulling `next/link`).
 */
import React, { type ComponentType } from 'react';

import { getSportConsoleMeta, listSportMetas } from './registry';
import type { SportConsoleMetaEntry, SportLiveViewProps } from './registry';
import { KhoKhoConsole } from './khoKho/KhoKhoConsole';
import { KhoKhoLiveView } from './khoKho/KhoKhoLiveView';

export type SportConsoleRegistryEntry = {
  /** Shared engine id used by BOTH the server service and the client replay. */
  engineId: string;
  Console: ComponentType<SportConsolePropsClient>;
  LiveView: ComponentType<SportLiveViewProps>;
  /** One-line rule summary for the hub header (per-tournament config). */
  configSummary: SportConsoleMetaEntry['configSummary'];
};

// Component prop contracts (re-declared locally to avoid importing the
// registry graph from inside this client file — see registry.ts for them).
import type { SportConsoleProps as SportConsolePropsClient } from './registry';

const components: Record<string, { Console: ComponentType<any>; LiveView: ComponentType<any> }> = {
  'kho-kho': {
    Console: KhoKhoConsole,
    LiveView: KhoKhoLiveView,
  },
};

/** Resolves the full console entry (metadata + components) for a sport. */
export function getSportConsole(sport: string): SportConsoleRegistryEntry | null {
  const meta = getSportConsoleMeta(sport);
  if (!meta) return null;
  const pair = components[meta.engineId];
  if (!pair) return null;
  return { ...meta, Console: pair.Console, LiveView: pair.LiveView };
}

export function getSportLiveView(sport: string): ComponentType<SportLiveViewProps> | null {
  return getSportConsole(sport)?.LiveView ?? null;
}

export function listSportConsoles(): Array<{ sport: string; entry: SportConsoleRegistryEntry }> {
  return listSportMetas()
    .map(({ sport, entry }) => ({ sport, entry: getSportConsole(sport) }))
    .filter((x): x is { sport: string; entry: SportConsoleRegistryEntry } => x.entry !== null);
}

export { KhoKhoConsole, KhoKhoLiveView };
