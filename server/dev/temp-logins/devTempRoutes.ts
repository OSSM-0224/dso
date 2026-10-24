// TEMP-LOGIN: remove later
import { Router, Request, Response } from 'express';
import { userRepository } from '../../repositories/userRepository.ts';
import { runTempLoginSeed } from '../../../scripts/seed-temp-logins.ts';

const router = Router();

// Hard safety: refuse all actions if NODE_ENV === 'production'
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'Forbidden in production' });
  }
  next();
});

// GET /api/dev/temp-logins - lists seeded accounts for dev quick login
router.get('/temp-logins', async (req: Request, res: Response) => {
  const allUsers = await userRepository.findAll();
  const list = allUsers.map((u) => ({
    label: `${u.name}${u.schoolName ? ` (${u.schoolName})` : ''}`,
    identifier: u.schoolCode || u.email || u.id,
    role: u.role,
    isTempSeed: Boolean(u.isTempSeed),
  }));
  res.json({ success: true, data: list });
});

// POST /api/dev/seed-temp-logins - trigger seed dynamically in dev
router.post('/seed-temp-logins', async (req: Request, res: Response) => {
  try {
    const result = await runTempLoginSeed();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/dev/remove-temp-logins - trigger removal dynamically in dev
router.post('/remove-temp-logins', async (req: Request, res: Response) => {
  try {
    const result = await runTempLoginSeed({ remove: true });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
