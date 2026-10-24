import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/scoring/matches/:id/events - append one validated scoring event
export async function POST(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.appendEvent(user, id, body));
  });
}
