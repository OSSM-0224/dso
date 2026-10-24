import { scoringController } from '@/server/controllers/scoringController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/admin/scorers - scorer accounts available for match assignment
export async function GET() {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    return ok(await scoringController.listScorerCandidates(user));
  });
}
