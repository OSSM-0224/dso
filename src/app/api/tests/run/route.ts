import { runFixtureEngineTestSuite } from '@/shared/tests/testSuite';
import { runParticipantAccessTestSuite } from '@/server/tests/participantAccessTestSuite';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/tests/run - runs all unit tests: pure fixture engine + participant access isolation
export async function GET() {
  return handler(async () => {
    const engineSummary = runFixtureEngineTestSuite();
    const participantSummary = await runParticipantAccessTestSuite();

    const combined = {
      total: engineSummary.total + participantSummary.total,
      passed: engineSummary.passed + participantSummary.passed,
      failed: engineSummary.failed + participantSummary.failed,
      durationMs: engineSummary.durationMs + participantSummary.durationMs,
      results: [...engineSummary.results, ...participantSummary.results],
    };

    return ok(combined);
  });
}
