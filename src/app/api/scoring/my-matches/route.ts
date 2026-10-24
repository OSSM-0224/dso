import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/scoring/my-matches - scoreable matches for the signed-in staff member
export async function GET() {
  return handler(async () => {
    const user = await requireScoringWriter();
    return ok(await scoringController.myMatches(user));
  });
}
