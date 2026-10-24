import { runFixtureEngineTestSuite } from '@/shared/tests/testSuite';
import { runScoringEngineTestSuite } from '@/shared/tests/scoringTestSuite';
import { runParticipantAccessTestSuite } from '@/server/tests/participantAccessTestSuite';
import { runScoringAccessTestSuite } from '@/server/tests/scoringAccessTestSuite';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/tests/run - runs all unit tests: pure fixture engine + kho-kho scoring engine + participant access isolation + scoring access control
export async function GET() {
  return handler(async () => {
    const engineSummary = runFixtureEngineTestSuite();
    const scoringSummary = runScoringEngineTestSuite();
    const participantSummary = await runParticipantAccessTestSuite();
    const scoringAccessSummary = await runScoringAccessTestSuite();

    const combined = {
      total: engineSummary.total + scoringSummary.total + participantSummary.total + scoringAccessSummary.total,
      passed: engineSummary.passed + scoringSummary.passed + participantSummary.passed + scoringAccessSummary.passed,
      failed: engineSummary.failed + scoringSummary.failed + participantSummary.failed + scoringAccessSummary.failed,
      durationMs: engineSummary.durationMs + scoringSummary.durationMs + participantSummary.durationMs + scoringAccessSummary.durationMs,
      results: [...engineSummary.results, ...scoringSummary.results, ...participantSummary.results, ...scoringAccessSummary.results],
    };

    return ok(combined);
  });
}
