import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.ts';
import { validateBody } from '../middlewares/validationMiddleware.ts';
import { changePasswordSchema, loginSchema } from '../validations/schemas.ts';
import { UserRole } from '../../shared/types.ts';

const router = Router();

/**
 * POST /api/auth/login - School Participant Login
 * Accepts identifier (School Code, Email, or Phone) and password.
 */
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identifier, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress || 'client';

      const result = await authService.login(identifier, password, clientIp);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: err.message || 'Login failed. Please check your credentials.',
      });
    }
  }
);

/**
 * POST /api/auth/change-password - Change or force update password
 */
router.post(
  '/change-password',
  validateBody(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const { currentPassword, newPassword } = req.body;
      const result = await authService.changePassword(
        req.user.id,
        currentPassword,
        newPassword
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to update password.',
      });
    }
  }
);

/**
 * POST /api/auth/session - switch or login as specific role (Admin, Organizer, Viewer)
 */
router.post('/session', (req: Request, res: Response) => {
  const role: UserRole = req.body.role || 'organizer';
  if (!['admin', 'organizer', 'viewer', 'participant'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const { user, token } = authService.createRoleSession(role);
  res.json({ success: true, data: { user, token } });
});

/**
 * GET /api/auth/me - inspect current session
 */
router.get('/me', (req: Request, res: Response) => {
  res.json({ success: true, data: req.user || null });
});

export default router;
