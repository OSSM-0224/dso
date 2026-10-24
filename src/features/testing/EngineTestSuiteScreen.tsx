import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import type { TestSuiteSummary } from '@/shared/tests/testSuite.ts';
import { api } from '@/lib/api.ts';

export const EngineTestSuiteScreen: React.FC = () => {
  const [summary, setSummary] = useState<TestSuiteSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      // Run full combined test suite from server (engine + participant access + secrecy)
      const res = await api.tests.run();
      setSummary(res);
    } catch {
      // Fallback to local synchronous engine suite (lazy: the pure engine is
      // never pulled into this page's bundle unless the server route fails).
      try {
        const { runFixtureEngineTestSuite } = await import('@/shared/tests/testSuite.ts');
        setSummary(runFixtureEngineTestSuite());
      } catch {
        // ignore
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Fixture Engine Unit Test Verification Suite
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl mt-1">
            Pure framework-free unit test runner verifying all algorithm constraints: odd/even team sizes (N = 3, 5, 6, 7, 8, 9, 11, 13, 15, 16, 17, 21), 3 strong teams in separate quarters, champions exceeding byes, cross-medium same-school separation in Round 1, deterministic seed reproducibility, and graceful handling of impossible constraints.
          </p>
        </div>

        <button
          onClick={handleRunTests}
          disabled={isRunning}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0"
        >
          {isRunning ? 'Running Test Cases...' : (<><Icon name="play" size="sm" />Run All Engine Tests</>)}
        </button>
      </div>

      {summary && (
        <div className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-500">Total Test Cases</span>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {summary.total}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-500">Passed</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
                {summary.passed}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-500">Failed</span>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  summary.failed === 0 ? 'text-slate-400' : 'text-red-600'
                }`}
              >
                {summary.failed}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] text-slate-500">Duration</span>
              <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                {summary.durationMs}ms
              </div>
            </div>
          </div>

          {/* Test Results Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Detailed Verification Results
            </h3>
            <div className="divide-y divide-slate-100">
              {summary.results.map((r) => (
                <div
                  key={r.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                          r.passed
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {r.passed ? 'PASSED' : 'FAILED'}
                      </span>
                      <span className="font-semibold text-slate-900">{r.name}</span>
                      <span className="text-[11px] text-slate-400">· {r.category}</span>
                    </div>
                    <div className="text-slate-600 text-xs">{r.message}</div>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 font-mono shrink-0">
                    {r.durationMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
