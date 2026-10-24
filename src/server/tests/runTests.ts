import 'dotenv/config';
import { runFixtureEngineTestSuite, TestSuiteSummary } from './testSuite.ts';
import { runParticipantAccessTestSuite } from './participantAccessTestSuite.ts';

async function main() {
  const engineSummary = runFixtureEngineTestSuite();
  const participantSummary = await runParticipantAccessTestSuite();

  const combined: TestSuiteSummary = {
    total: engineSummary.total + participantSummary.total,
    passed: engineSummary.passed + participantSummary.passed,
    failed: engineSummary.failed + participantSummary.failed,
    durationMs: engineSummary.durationMs + participantSummary.durationMs,
    results: [...engineSummary.results, ...participantSummary.results],
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
