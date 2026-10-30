import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ id: string }>;
}

// @deprecated POST /api/scoring/matches/:id/undo - legacy alias that resolves
// the tournament and delegates. Prefer
// /api/scoring/tournaments/:tournamentId/matches/:matchId/undo.
export async function POST(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const authStart = timing.now();
    const user = await requireScoringWriter();
    timing.measure('auth', authStart);

    const { id } = await ctx.params;
    const scoreStart = timing.now();
    const score = await scoringController.legacyUndo(user, id);
    timing.measure('scoring', scoreStart);

    return ok(score, 200, timing);
  });
}
