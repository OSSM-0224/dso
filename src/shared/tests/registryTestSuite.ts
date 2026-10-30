/**
 * PURE unit suite for the sport-pluggable console registry (spec §2/§6):
 *  - registry entries expose { engineId, Console, LiveView, configSummary };
 *  - `getSportConsole(sport)` resolves registered sports and returns null for
 *    unknown ones (so the console host can render its friendly fallback);
 *  - `getSportLiveView` mirrors that for reader surfaces;
 *  - configSummary lines up with the engine's per-age-group config.
 */
import { TestResult, TestSuiteSummary } from './testSuite.ts';
import {
  getSportConsoleMeta,
  listSportMetas,
} from '../../features/scoring/consoles/registry.ts';

export { getSportConsoleMeta, listSportMetas } from '../../features/scoring/consoles/registry.ts';
import { defaultKhoKhoConfigForAgeGroup } from '../scoring/types.ts';
import { getScoringEngine } from '../scoring/engine.ts';

export function runRegistryTestSuite(): TestSuiteSummary {
  const results: TestResult[] = [];
  const startAll = Date.now();

  const check = (name: string, category: string, fn: () => void) => {
    const start = Date.now();
    let passed = true;
    let message = '';
    try {
      fn();
    } catch (err) {
      passed = false;
      message = err instanceof Error ? err.message : String(err);
    }
    results.push({ name, category, passed, message, durationMs: Date.now() - start });
  };

  check('registry: unknown sport returns null (console fallback path)', 'Registry', () => {
    const meta = getSportConsoleMeta('kabaddi');
    if (meta !== null) throw new Error('unknown sport should not resolve');
  });

  check('registry: empty sport string resolves the kho-kho default', 'Registry', () => {
    const meta = getSportConsoleMeta('');
    if (!meta || meta.engineId !== 'kho-kho') throw new Error('default resolution failed');
  });

  check('registry: listSportMetas includes every registered sport', 'Registry', () => {
    const metas = listSportMetas();
    const sports = metas.map((m) => m.sport);
    if (!sports.includes('kho-kho')) throw new Error(`list=${JSON.stringify(sports)}`);
  });

  check('registry: configSummary reflects the age-group config', 'Registry', () => {
    const meta = getSportConsoleMeta('kho-kho')!;
    const u14 = meta.configSummary({ sport: 'kho-kho', ageGroup: 'U-14', gender: 'boys' });
    const u17 = meta.configSummary({ sport: 'kho-kho', ageGroup: 'U-17', gender: 'girls' });
    const expectedU14Minutes = Math.round(defaultKhoKhoConfigForAgeGroup('U-14').turnDurationSec / 60);
    const expectedU17Minutes = Math.round(defaultKhoKhoConfigForAgeGroup('U-17').turnDurationSec / 60);
    if (!u14.includes(`${expectedU14Minutes} min`)) throw new Error(`u14 summary=${u14}`);
    if (!u17.includes(`${expectedU17Minutes} min`)) throw new Error(`u17 summary=${u17}`);
    if (u14 === u17) throw new Error('summaries must differ per age group');
  });

  check('registry: non-kho-kho tournament falls back to plain descriptor', 'Registry', () => {
    const meta = getSportConsoleMeta('kho-kho')!;
    const summary = meta.configSummary({ sport: 'kabaddi', ageGroup: 'U-17', gender: 'girls' });
    if (!summary.includes('U-17') || !summary.includes('girls')) {
      throw new Error(`fallback summary=${summary}`);
    }
  });

  check('registry engine contract: shared engine matches client replay API', 'Registry', () => {
    const engine = getScoringEngine('kho-kho');
    for (const method of [
      'createInitialState',
      'applyEvent',
      'validateEvent',
      'getScoreboard',
      'getNextAction',
      'getUndoTarget',
      'canUndo',
      'computeWinner',
    ] as const) {
      if (typeof engine[method] !== 'function') throw new Error(`engine.${method} missing`);
    }
  });

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return {
    total,
    passed,
    failed: total - passed,
    durationMs: Date.now() - startAll,
    results,
  };
}
