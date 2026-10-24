import { Router, Request, Response, NextFunction } from 'express';
import { teamRepository } from '../repositories/teamRepository.ts';
import { teamService } from '../services/teamService.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { bulkImportTeamsSchema, createTeamSchema } from '../validations/schemas.ts';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ageGroup, gender, schoolId } = req.query;
    const list = await teamRepository.findAll({
      ageGroup: ageGroup as string,
      gender: gender as string,
      schoolId: schoolId as string,
    });
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAdminOrOrganizer,
  validateBody(createTeamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const team = await teamRepository.create(req.body);
      res.status(201).json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/:id',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await teamRepository.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Team not found' });
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  requireAdminOrOrganizer,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const success = await teamRepository.delete(req.params.id);
      res.json({ success });
    } catch (err) {
      next(err);
    }
  }
);

// POST /teams/import - CSV validation, duplicate detection and bulk commit
router.post(
  '/import',
  requireAdminOrOrganizer,
  validateBody(bulkImportTeamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await teamService.validateAndImportCsv(
        req.body.rows,
        req.body.commit || false
      );
      res.json({ success: true, data: report });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
