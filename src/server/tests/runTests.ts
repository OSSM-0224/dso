import 'server-only';
import 'dotenv/config';
import { runFixtureEngineTestSuite, TestSuiteSummary } from '../../shared/tests/testSuite.ts';
import { runScoringEngineTestSuite } from '../../shared/tests/scoringTestSuite.ts';
import { runScoreQueueTestSuite } from '../../shared/tests/scoreQueueTestSuite.ts';
import { runRegistryTestSuite, runRegistryComponentTestSuite } from '../../shared/tests/registryTestSuite.ts';
import { runParticipantAccessTestSuite } from './participantAccessTestSuite.ts';
import { runScoringAccessTestSuite } from './scoringAccessTestSuite.ts';
import { runScoringScopingTestSuite } from './scoringScopingTestSuite.ts';

async function main() {
  // Tests must run against the isolated in-memory store, never a real cluster.
  process.env.MONGODB_URI = '';

  const engineSummary = runFixtureEngineTestSuite();
  const scoringSummary = runScoringEngineTestSuite();
  const registrySummary = runRegistryTestSuite();
  const registryComponentsSummary = await runRegistryComponentTestSuite();
  const scoreQueueSummary = await runScoreQueueTestSuite();
  const participantSummary = await runParticipantAccessTestSuite();
  const scoringAccessSummary = await runScoringAccessTestSuite();
  const scoringScopingSummary = await runScoringScopingTestSuite();

  const summaries = [
    engineSummary,
    scoringSummary,
    registrySummary,
    registryComponentsSummary,
    scoreQueueSummary,
    participantSummary,
    scoringAccessSummary,
    scoringScopingSummary,
  ];

  const combined: TestSuiteSummary = {
    total: summaries.reduce((acc, s) => acc + s.total, 0),
    passed: summaries.reduce((acc, s) => acc + s.passed, 0),
    failed: summaries.reduce((acc, s) => acc + s.failed, 0),
    durationMs: summaries.reduce((acc, s) => acc + s.durationMs, 0),
    results: summaries.flatMap((s) => s.results),
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
