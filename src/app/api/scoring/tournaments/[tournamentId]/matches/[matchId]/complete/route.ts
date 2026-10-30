import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// POST .../matches/:matchId/complete - finalize through matchService.recordResult.
export async function POST(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    return ok(await scoringController.complete(user, tournamentId, matchId));
  });
}
