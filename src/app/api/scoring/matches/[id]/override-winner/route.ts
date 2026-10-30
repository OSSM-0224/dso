import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ id: string }>;
}

// @deprecated POST /api/scoring/matches/:id/override-winner - legacy alias that
// resolves the tournament and delegates. Prefer
// /api/scoring/tournaments/:tournamentId/matches/:matchId/override-winner.
export async function POST(req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const authStart = timing.now();
    const user = await requireScoringWriter();
    timing.measure('auth', authStart);

    const { id } = await ctx.params;
    const bodyStart = timing.now();
    const body = await req.json().catch(() => undefined);
    timing.measure('body', bodyStart);

    const scoreStart = timing.now();
    const result = await scoringController.legacyOverrideWinner(user, id, body);
    timing.measure('scoring', scoreStart);

    return ok(result, 200, timing);
  });
}
