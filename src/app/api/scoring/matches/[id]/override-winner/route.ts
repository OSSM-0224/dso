import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/scoring/matches/:id/override-winner - manual winner decision with
// mandatory reason; bypasses the undo-able event flow (admin correction).
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
    const result = await scoringController.overrideWinner(user, id, body);
    timing.measure('scoring', scoreStart);

    return ok(result, 200, timing);
  });
}
