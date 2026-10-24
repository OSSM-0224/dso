import type { NextRequest } from 'next/server';

import { ApiError } from '@/server/apiError';
import { authService } from '@/server/services/authService';
import {
  defaultOrganizerSession,
  readSession,
  sessionKindForRole,
  setSessionCookie,
} from '@/server/auth/session';
import { handler, ok, parseJsonRequest, errorResponse } from '@/server/validations/helpers';
import { changePasswordSchema } from '@/server/validations/schemas';

export async function POST(req: NextRequest) {
  return handler(async () => {
    // Old Express behaviour: optionalAuth always populated req.user (falling
    // back to the default organizer), and an unknown id surfaced as
    // authService's "User not found." 400. Preserve that flow.
    const user = (await readSession('school')) ?? (await readSession('staff'));
    const sessionUser = user ?? defaultOrganizerSession();

    const { currentPassword, newPassword } = await parseJsonRequest(changePasswordSchema, req);

    try {
      const result = await authService.changePassword(sessionUser.id, currentPassword, newPassword);
      await setSessionCookie(sessionKindForRole(result.user.role), result.token);
      return ok(result);
    } catch (err) {
      return errorResponse(
        new ApiError(
          400,
          err instanceof Error && err.message ? err.message : 'Failed to update password.'
        )
      );
    }
  });
}
