import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// PATCH .../matches/:matchId/config - update scoring config (e.g., team colors for Dodgeball).
export async function PATCH(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.updateConfig(user, tournamentId, matchId, body));
  });
}