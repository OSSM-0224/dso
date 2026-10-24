import 'server-only';
/**
 * Role guard logic extracted from the old `middlewares/authMiddleware.ts`,
 * now backed by httpOnly cookie sessions (see server/auth/session.ts).
 * Full authorization decisions stay server-side here â€” the Next.js
 * middleware layer only does lightweight cookie-presence checks.
 */
import { UserSession } from '../../shared/types.ts';
import { ApiError } from '../apiError.ts';
import { getParticipantSession, getStaffSession } from './session.ts';

export async function requireAdminOrOrganizer(): Promise<UserSession> {
  const user = await getStaffSession();

  if (!user) {
    // Production: no staff cookie â†’ 401. (In non-production builds
    // getStaffSession injects the legacy default-organizer dev fallback.)
    throw new ApiError(
      401,
      'Authentication required. Please sign in with staff credentials.'
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

/** Staff-session guard for the LIVE SCORER module. Admins and organizers may
 * score every match; scorers are limited per match by `MatchDoc.scorerIds`
 * (enforced in the scoring service once the match is loaded). */
export async function requireScoringWriter(): Promise<UserSession> {
  const user = await getStaffSession();

  if (!user) {
    throw new ApiError(
      401,
      'Authentication required. Please sign in with scoring staff credentials.'
    );
  }

  if (!['admin', 'organizer', 'scorer'].includes(user.role)) {
    throw new ApiError(
      403,
      `Access denied. Role "${user.role}" is not authorized to score (allowed: admin, organizer, scorer).`
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
