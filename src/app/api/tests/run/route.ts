import { runFixtureEngineTestSuite } from '@/shared/tests/testSuite';
import { runScoringEngineTestSuite } from '@/shared/tests/scoringTestSuite';
import { runScoreQueueTestSuite } from '@/shared/tests/scoreQueueTestSuite';
import { runRegistryTestSuite } from '@/shared/tests/registryTestSuite';
import { runParticipantAccessTestSuite } from '@/server/tests/participantAccessTestSuite';
import { runScoringAccessTestSuite } from '@/server/tests/scoringAccessTestSuite';
import { runScoringScopingTestSuite } from '@/server/tests/scoringScopingTestSuite';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/tests/run - runs all unit tests: pure fixture engine, kho-kho
// scoring engine, sport console registry, score event queue (console bug
// fixes), participant access isolation, scoring access control and the
// tournament-scoping guarantees.
export async function GET() {
  return handler(async () => {
    const engineSummary = runFixtureEngineTestSuite();
    const scoringSummary = runScoringEngineTestSuite();
    const registrySummary = runRegistryTestSuite();
    const scoreQueueSummary = await runScoreQueueTestSuite();
    const participantSummary = await runParticipantAccessTestSuite();
    const scoringAccessSummary = await runScoringAccessTestSuite();
    const scoringScopingSummary = await runScoringScopingTestSuite();

    const summaries = [
      engineSummary,
      scoringSummary,
      registrySummary,
      scoreQueueSummary,
      participantSummary,
      scoringAccessSummary,
      scoringScopingSummary,
    ];

    const combined = {
      total: summaries.reduce((acc, s) => acc + s.total, 0),
      passed: summaries.reduce((acc, s) => acc + s.passed, 0),
      failed: summaries.reduce((acc, s) => acc + s.failed, 0),
      durationMs: summaries.reduce((acc, s) => acc + s.durationMs, 0),
      results: summaries.flatMap((s) => s.results),
    };

    return ok(combined);
  });
}
