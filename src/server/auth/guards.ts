/**
 * Role guard logic extracted from the old `middlewares/authMiddleware.ts`,
 * now backed by httpOnly cookie sessions (see server/auth/session.ts).
 * Full authorization decisions stay server-side here — the Next.js
 * middleware layer only does lightweight cookie-presence checks.
 */
import { UserSession } from '../../shared/types.ts';
import { ApiError } from '../apiError.ts';
import { getParticipantSession, getStaffSession } from './session.ts';

export async function requireAdminOrOrganizer(): Promise<UserSession> {
  const user = await getStaffSession();

  if (!user) {
    // Old Express behaviour: with no Bearer header the default organizer
    // fallback user was injected, so this branch was effectively unreachable.
    throw new ApiError(
      401,
      'Authentication required. Please sign in or provide a valid Bearer token.'
    );
  }

  if (!['admin', 'organizer'].includes(user.role)) {
    throw new ApiError(
      403,
      `Access denied. Role "${user.role}" is not authorized (allowed: admin, organizer).`
    );
  }

  return user;
}

export async function requireParticipant(): Promise<UserSession> {
  const user = await getParticipantSession();

  if (!user) {
    throw new ApiError(
      401,
      'Authentication required. Please sign in with your School Account credentials.'
    );
  }

  if (user.role !== 'participant' || !user.schoolId) {
    throw new ApiError(
      403,
      'Access denied. Only authenticated school participants may access this portal.'
    );
  }

  return user;
}
