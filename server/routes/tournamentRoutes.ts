import { Router, Request, Response, NextFunction } from 'express';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { fixtureSnapshotRepository } from '../repositories/fixtureSnapshotRepository.ts';
import { fixtureService } from '../services/fixtureService.ts';
import { matchService } from '../services/matchService.ts';
import { tournamentService } from '../services/tournamentService.ts';
import { enrollmentService } from '../services/enrollmentService.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import {
  bulkEnrollSchema,
  createTournamentSchema,
  generateFixturesSchema,
  swapFixturesSchema,
  updateStrongTeamsSchema,
  updateTournamentTeamsSchema,
} from '../validations/schemas.ts';

const router = Router();

// GET /tournaments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await tournamentService.getAll();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// POST /tournaments
router.post(
  '/',
  requireAdminOrOrganizer,
  validateBody(createTournamentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.create(req.body, req.user!);
      res.status(201).json({ success: true, data: tournament });
    } catch (err) {
      next(err);
    }
  }
);

// GET /tournaments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await tournamentService.getById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }
    const snapshot = await fixtureSnapshotRepository.findByTournamentId(req.params.id);
    res.json({ success: true, data: { ...tournament, snapshot } });
  } catch (err) {
    next(err);
  }
});

// POST /tournaments/:id/teams
router.post(
  '/:id/teams',
  requireAdminOrOrganizer,
  validateBody(updateTournamentTeamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await tournamentService.updateTeams(
        req.params.id,
        req.body.teams,
        req.user!
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /tournaments/:id/strong-teams
router.put(
  '/:id/strong-teams',
  requireAdminOrOrganizer,
  validateBody(updateStrongTeamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await tournamentService.updateStrongTeams(
        req.params.id,
        req.body.strongTeams,
        req.user!
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// GET /tournaments/:id/recent-champions
router.get('/:id/recent-champions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const champions = await tournamentService.getRecentChampions(req.params.id);
    res.json({ success: true, data: champions });
  } catch (err) {
    next(err);
  }
});

// POST /tournaments/:id/fixtures/generate
router.post(
  '/:id/fixtures/generate',
  requireAdminOrOrganizer,
  validateBody(generateFixturesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fixtureService.generateFixtures(req.params.id, {
        seed: req.body.seed,
        user: req.user!,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /tournaments/:id/fixtures/swap
router.post(
  '/:id/fixtures/swap',
  requireAdminOrOrganizer,
  validateBody(swapFixturesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fixtureService.executeSwap(
        req.params.id,
        req.body.teamAId,
        req.body.teamBId,
        req.body.force || false,
        req.user!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /tournaments/:id/fixtures/publish
router.post(
  '/:id/fixtures/publish',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await fixtureService.publish(req.params.id, req.user!);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// GET /tournaments/:id/matches
router.get('/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const matches = await matchService.getTournamentMatches(req.params.id);
    res.json({ success: true, data: matches });
  } catch (err) {
    next(err);
  }
});

// GET /tournaments/:id/audit-log
router.get('/:id/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await auditLogRepository.findByTournamentId(req.params.id);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

// GET /tournaments/:id/enrollments
router.get('/:id/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await enrollmentService.getEnrollments(req.params.id);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// POST /tournaments/:id/enrollments
router.post(
  '/:id/enrollments',
  requireAdminOrOrganizer,
  validateBody(bulkEnrollSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await enrollmentService.enrollTeams(
        req.params.id,
        req.body.teamIds,
        req.user!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /tournaments/:id/enrollments/:teamId
router.delete(
  '/:id/enrollments/:teamId',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await enrollmentService.withdrawTeam(
        req.params.id,
        req.params.teamId,
        req.user!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /tournaments/:id/enrollments/lock
router.post(
  '/:id/enrollments/lock',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await enrollmentService.lockEnrollment(req.params.id, req.user!);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /tournaments/:id/enrollments/unlock
router.post(
  '/:id/enrollments/unlock',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await enrollmentService.unlockEnrollment(req.params.id, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
