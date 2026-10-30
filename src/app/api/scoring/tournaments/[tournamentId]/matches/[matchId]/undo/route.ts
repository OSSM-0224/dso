import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// POST .../matches/:matchId/undo - VOID the last actionable scoring event.
export async function POST(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    return ok(await scoringController.undo(user, tournamentId, matchId));
  });
}
