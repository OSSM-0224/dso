import 'server-only';
import 'dotenv/config';
import { runFixtureEngineTestSuite, TestSuiteSummary } from '../../shared/tests/testSuite.ts';
import { runScoringEngineTestSuite } from '../../shared/tests/scoringTestSuite.ts';
import { runParticipantAccessTestSuite } from './participantAccessTestSuite.ts';
import { runScoringAccessTestSuite } from './scoringAccessTestSuite.ts';

async function main() {
  // Tests must run against the isolated in-memory store, never a real cluster.
  process.env.MONGODB_URI = '';

  const engineSummary = runFixtureEngineTestSuite();
  const scoringSummary = runScoringEngineTestSuite();
  const participantSummary = await runParticipantAccessTestSuite();
  const scoringAccessSummary = await runScoringAccessTestSuite();

  const combined: TestSuiteSummary = {
    total: engineSummary.total + scoringSummary.total + participantSummary.total + scoringAccessSummary.total,
    passed: engineSummary.passed + scoringSummary.passed + participantSummary.passed + scoringAccessSummary.passed,
    failed: engineSummary.failed + scoringSummary.failed + participantSummary.failed + scoringAccessSummary.failed,
    durationMs: engineSummary.durationMs + scoringSummary.durationMs + participantSummary.durationMs + scoringAccessSummary.durationMs,
    results: [...engineSummary.results, ...scoringSummary.results, ...participantSummary.results, ...scoringAccessSummary.results],
  };

  for (const r of combined.results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'}  [${r.category}] ${r.name}`);
    if (!r.passed) console.log(`      -> ${r.message}`);
  }

  console.log(`\nTotal: ${combined.total}, Passed: ${combined.passed}, Failed: ${combined.failed}, Duration: ${combined.durationMs}ms`);

  if (combined.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
