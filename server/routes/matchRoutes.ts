import { Router, Request, Response, NextFunction } from 'express';
import { matchService } from '../services/matchService.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { recordResultSchema, updateScheduleSchema } from '../validations/schemas.ts';

const router = Router();

// PUT /matches/:id/result
router.put(
  '/:id/result',
  requireAdminOrOrganizer,
  validateBody(recordResultSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await matchService.recordResult(
        req.params.id,
        req.body,
        req.user!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /matches/:id/schedule
router.put(
  '/:id/schedule',
  requireAdminOrOrganizer,
  validateBody(updateScheduleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await matchService.updateSchedule(
        req.params.id,
        req.body,
        req.user!
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
