import type { NextRequest } from 'next/server';

import { ApiError } from '@/server/apiError';
import { authService } from '@/server/services/authService';
import { clearSessionCookie, sessionKindForRole, setSessionCookie } from '@/server/auth/session';
import { handler, ok, errorResponse } from '@/server/validations/helpers';
import { UserRole } from '@/shared/types';

export async function POST(req: NextRequest) {
  return handler(async () => {
    let body: { role?: string } = {};
    try {
      body = (await req.json()) as { role?: string };
    } catch {
      body = {};
    }

    const role = body.role || 'organizer';
    if (!['admin', 'organizer', 'viewer', 'participant'].includes(role)) {
      return errorResponse(new ApiError(400, 'Invalid role'));
    }

    const { user, token } = authService.createRoleSession(role as UserRole);
    await setSessionCookie(sessionKindForRole(user.role), token);
    // Switching away from the school portal ends the participant session too —
    // this mirrors the old single localStorage token being replaced on
    // signOut/switchRole.
    if (user.role !== 'participant') {
      await clearSessionCookie('school');
    }
    return ok({ user, token });
  });
}
