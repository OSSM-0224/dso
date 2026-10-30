import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// POST .../matches/:matchId/override-winner - MANUAL_DECISION path (audited).
export async function POST(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.overrideWinner(user, tournamentId, matchId, body));
  });
}
