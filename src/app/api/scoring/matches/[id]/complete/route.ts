import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/scoring/matches/:id/complete - finalize the match result through the
// existing matchService.recordResult pipeline (advance, champion, notify, audit).
export async function POST(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const authStart = timing.now();
    const user = await requireScoringWriter();
    timing.measure('auth', authStart);

    const { id } = await ctx.params;
    const scoreStart = timing.now();
    const result = await scoringController.complete(user, id);
    timing.measure('scoring', scoreStart);

    return ok(result, 200, timing);
  });
}
