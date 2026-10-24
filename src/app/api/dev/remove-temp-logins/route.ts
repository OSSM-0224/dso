// TEMP-LOGIN: remove later
import { runTempLoginSeed } from '@/server/dev/temp-logins/seedRuntime';
import { errorResponse, handler, ok } from '@/server/validations/helpers';
import { ApiError } from '@/server/apiError';

// Hard safety: refuse all actions if NODE_ENV === 'production'
function guardProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(403, 'Forbidden in production');
  }
}

// POST /api/dev/remove-temp-logins - trigger removal dynamically in dev
export async function POST() {
  return handler(async () => {
    try {
      guardProduction();
    } catch (err) {
      return errorResponse(err);
    }
    try {
      const result = await runTempLoginSeed({ remove: true });
      return ok(result);
    } catch (err) {
      return errorResponse(new ApiError(500, err instanceof Error ? err.message : String(err)));
    }
  });
}
