// TEMP-LOGIN: remove later
import { userRepository } from '@/server/repositories/userRepository';
import { handler, ok, errorResponse } from '@/server/validations/helpers';
import { ApiError } from '@/server/apiError';

// Hard safety: refuse all actions if NODE_ENV === 'production'
function guardProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError(403, 'Forbidden in production');
  }
}

// GET /api/dev/temp-logins - lists seeded accounts for dev quick login
export async function GET() {
  return handler(async () => {
    try {
      guardProduction();
    } catch (err) {
      return errorResponse(err);
    }
    const allUsers = await userRepository.findAll();
    const list = allUsers.map((u) => ({
      label: `${u.name}${u.schoolName ? ` (${u.schoolName})` : ''}`,
      identifier: u.schoolCode || u.email || u.id,
      role: u.role,
      isTempSeed: Boolean(u.isTempSeed),
    }));
    return ok(list);
  });
}
