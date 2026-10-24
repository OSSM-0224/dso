import { Router, Request, Response, NextFunction } from 'express';
import { pastTournamentRepository } from '../repositories/pastTournamentRepository.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { createPastTournamentSchema } from '../validations/schemas.ts';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await pastTournamentRepository.findAll();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAdminOrOrganizer,
  validateBody(createPastTournamentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await pastTournamentRepository.create(req.body);
      res.status(201).json({ success: true, data: record });
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
      const success = await pastTournamentRepository.delete(req.params.id);
      res.json({ success });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
