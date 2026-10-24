import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/scoring/matches/:id/override-winner - manual winner decision with
// mandatory reason; bypasses the undo-able event flow (admin correction).
export async function POST(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.overrideWinner(user, id, body));
  });
}
