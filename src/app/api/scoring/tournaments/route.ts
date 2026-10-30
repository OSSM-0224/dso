import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

// GET /api/scoring/tournaments - picker payload; scorers receive ONLY the
// tournaments they are assigned to, admins/organizers every scoreable one.
export async function GET() {
  return handler(async () => {
    const user = await requireScoringWriter();
    return ok(await scoringController.listTournaments(user));
  });
}
