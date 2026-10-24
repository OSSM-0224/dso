import { Router, Request, Response, NextFunction } from 'express';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { requireAdminOrOrganizer } from '../middlewares/authMiddleware.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { createSchoolSchema } from '../validations/schemas.ts';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await schoolRepository.findAll();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAdminOrOrganizer,
  validateBody(createSchoolSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const school = await schoolRepository.create(req.body);
      res.status(201).json({ success: true, data: school });
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
      const updated = await schoolRepository.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'School not found' });
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
      const success = await schoolRepository.delete(req.params.id);
      res.json({ success });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
