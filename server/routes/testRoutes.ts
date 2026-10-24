import { Router, Request, Response, NextFunction } from 'express';
import { runFixtureEngineTestSuite } from '../tests/testSuite.ts';
import { runParticipantAccessTestSuite } from '../tests/participantAccessTestSuite.ts';

const router = Router();

// GET /tests/run - runs all unit tests: pure fixture engine + participant access isolation
router.get('/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const engineSummary = runFixtureEngineTestSuite();
    const participantSummary = await runParticipantAccessTestSuite();

    const combined = {
      total: engineSummary.total + participantSummary.total,
      passed: engineSummary.passed + participantSummary.passed,
      failed: engineSummary.failed + participantSummary.failed,
      durationMs: engineSummary.durationMs + participantSummary.durationMs,
      results: [...engineSummary.results, ...participantSummary.results],
    };

    res.json({ success: true, data: combined });
  } catch (err) {
    next(err);
  }
});

export default router;
