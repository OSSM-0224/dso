import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/scoring/matches/:id/undo - VOID the last actionable scoring event
export async function POST(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    return ok(await scoringController.undo(user, id));
  });
}
