import type { NextRequest } from 'next/server';

import { ApiError } from '@/server/apiError';
import { authService } from '@/server/services/authService';
import { requestIp, setSessionCookie, sessionKindForRole } from '@/server/auth/session';
import { errorResponse, handler, ok, parseJsonRequest } from '@/server/validations/helpers';
import { loginSchema } from '@/server/validations/schemas';

export async function POST(req: NextRequest) {
  return handler(async () => {
    const { identifier, password } = await parseJsonRequest(loginSchema, req);
    const clientIp = requestIp(req);

    try {
      const result = await authService.login(identifier, password, clientIp);
      await setSessionCookie(sessionKindForRole(result.user.role), result.token);
      return ok(result);
    } catch (err) {
      return errorResponse(
        new ApiError(
          401,
          err instanceof Error && err.message
            ? err.message
            : 'Login failed. Please check your credentials.'
        )
      );
    }
  });
}
