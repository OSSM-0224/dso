import { scoringController } from '@/server/controllers/scoringController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/scoring/overview - STAFF ONLY: live/scoreable matches across all
// tournaments (grouped by tournament). Scorers are refused (403).
export async function GET() {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    return ok(await scoringController.organizerOverview(user));
  });
}
