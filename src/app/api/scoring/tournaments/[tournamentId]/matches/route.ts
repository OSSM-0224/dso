import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string }>;
}

// GET /api/scoring/tournaments/:tournamentId/matches - hub list; returns ONLY
// this tournament's matches (Live / Today / Upcoming / Completed grouping is
// done by the hub screen). Scorers must be assigned to this tournament (403).
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId } = await ctx.params;
    return ok(await scoringController.listTournamentMatches(user, tournamentId));
  });
}
