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
  getSportConsole,
  getSportLiveView,
  listSportConsoles,
} from '../../features/scoring/consoles/registry.ts';
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

  check('registry: kho-kho entry resolves with Console + LiveView', 'Registry', () => {
    const entry = getSportConsole('kho-kho');
    if (!entry) throw new Error('kho-kho missing from the registry');
    if (typeof entry.Console !== 'function') throw new Error('Console missing');
    if (typeof entry.LiveView !== 'function') throw new Error('LiveView missing');
    if (entry.engineId !== 'kho-kho') throw new Error(`engineId=${entry.engineId}`);
  });

  check('registry: unknown sport returns null (console fallback path)', 'Registry', () => {
    const entry = getSportConsole('kabaddi');
    if (entry !== null) throw new Error('unknown sport should not resolve');
    if (getSportLiveView('kabaddi') !== null) throw new Error('LiveView should not resolve');
  });

  check('registry: empty sport string resolves the kho-kho default', 'Registry', () => {
    const entry = getSportConsole('');
    if (!entry || entry.engineId !== 'kho-kho') throw new Error('default resolution failed');
  });

  check('registry: listSportConsoles includes every registered sport', 'Registry', () => {
    const list = listSportConsoles();
    const sports = list.map((l) => l.sport);
    if (!sports.includes('kho-kho')) throw new Error(`list=${JSON.stringify(sports)}`);
  });

  check('registry: configSummary reflects the age-group config', 'Registry', () => {
    const entry = getSportConsole('kho-kho')!;
    const u14 = entry.configSummary({ sport: 'kho-kho', ageGroup: 'U-14', gender: 'boys' });
    const u17 = entry.configSummary({ sport: 'kho-kho', ageGroup: 'U-17', gender: 'girls' });
    const expectedU14Minutes = Math.round(defaultKhoKhoConfigForAgeGroup('U-14').turnDurationSec / 60);
    const expectedU17Minutes = Math.round(defaultKhoKhoConfigForAgeGroup('U-17').turnDurationSec / 60);
    if (!u14.includes(`${expectedU14Minutes} min`)) throw new Error(`u14 summary=${u14}`);
    if (!u17.includes(`${expectedU17Minutes} min`)) throw new Error(`u17 summary=${u17}`);
    if (u14 === u17) throw new Error('summaries must differ per age group');
  });

  check('registry: non-kho-kho tournament falls back to plain descriptor', 'Registry', () => {
    const entry = getSportConsole('kho-kho')!;
    const summary = entry.configSummary({ sport: 'kabaddi', ageGroup: 'U-17', gender: 'girls' });
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
