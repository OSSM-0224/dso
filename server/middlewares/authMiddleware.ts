import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.ts';
import { UserRole, UserSession } from '../../shared/types.ts';

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
    }
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = authService.verifyToken(token);
    if (user) {
      req.user = user;
    }
  }

  // Only assign dev fallback user if not calling /api/my routes
  if (!req.user && !req.path.startsWith('/my') && !req.originalUrl.includes('/api/my')) {
    req.user = {
      id: 'default-organizer',
      name: 'Organizer (Navi Mumbai DSO)',
      role: 'organizer',
    };
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let user: UserSession | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      user = authService.verifyToken(authHeader.substring(7));
    }

    if (!user && req.user && req.user.id !== 'default-organizer') {
      user = req.user;
    }

    // Dev fallback only for non-participant routes when no header was passed
    if (!user && req.user && !allowedRoles.includes('participant')) {
      user = req.user;
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in or provide a valid Bearer token.',
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Role "${user.role}" is not authorized (allowed: ${allowedRoles.join(', ')}).`,
      });
    }

    req.user = user;
    next();
  };
}

export const requireAdminOrOrganizer = requireRole(['admin', 'organizer']);

/**
 * Strict server-side participant check:
 * Requires authenticated session with role 'participant' and a valid schoolId.
 * No client-supplied schoolId can override this.
 */
export function requireParticipant(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let user: UserSession | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    user = authService.verifyToken(authHeader.substring(7));
  } else if (req.user && req.user.role === 'participant') {
    user = req.user;
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in with your School Account credentials.',
    });
  }

  if (user.role !== 'participant' || !user.schoolId) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Only authenticated school participants may access this portal.',
    });
  }

  req.user = user;
  next();
}
