import { runFixtureEngineTestSuite } from '@/shared/tests/testSuite';
import { runScoringEngineTestSuite } from '@/shared/tests/scoringTestSuite';
import { runParticipantAccessTestSuite } from '@/server/tests/participantAccessTestSuite';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/tests/run - runs all unit tests: pure fixture engine + kho-kho scoring engine + participant access isolation
export async function GET() {
  return handler(async () => {
    const engineSummary = runFixtureEngineTestSuite();
    const scoringSummary = runScoringEngineTestSuite();
    const participantSummary = await runParticipantAccessTestSuite();

    const combined = {
      total: engineSummary.total + scoringSummary.total + participantSummary.total,
      passed: engineSummary.passed + scoringSummary.passed + participantSummary.passed,
      failed: engineSummary.failed + scoringSummary.failed + participantSummary.failed,
      durationMs: engineSummary.durationMs + scoringSummary.durationMs + participantSummary.durationMs,
      results: [...engineSummary.results, ...scoringSummary.results, ...participantSummary.results],
    };

    return ok(combined);
  });
}
