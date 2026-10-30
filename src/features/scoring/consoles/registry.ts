import { ScoringEngine } from '@/shared/scoring/engine.ts';
import { KhoKhoConsole } from './khoKho/KhoKhoConsole.tsx';
import { KhoKhoLiveView } from './khoKho/KhoKhoLiveView.tsx';
import type { ComponentType } from 'react';

export type SportConsoleProps = {
  tournamentId: string;
  matchId: string;
  tournament?: any;
  match?: any;
};

export type SportConsoleRegistryEntry = {
  engineId: string;
  Console: ComponentType<SportConsoleProps>;
  LiveView: ComponentType<any>;
  configSummary?: (tournament: any) => string;
};

const registry: Record<string, SportConsoleRegistryEntry> = {
  'kho-kho': {
    engineId: 'kho-kho',
    Console: KhoKhoConsole,
    LiveView: KhoKhoLiveView,
    configSummary: (t) => `${t.ageGroup} • ${t.gender}`,
  },
};

export function getSportConsole(sport: string): SportConsoleRegistryEntry | null {
  if (!sport) return registry['kho-kho'] ?? null;
  return registry[sport] ?? null;
}

export function listSportConsoles() {
  return Object.entries(registry).map(([sport, entry]) => ({ sport, ...entry }));
}

export { KhoKhoConsole, KhoKhoLiveView };
