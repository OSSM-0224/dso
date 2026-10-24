import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/scoring/matches/:id - match detail + current score session for scorers
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    return ok(await scoringController.getMatch(user, id));
  });
}

// POST /api/scoring/matches/:id - create (or resume) the live scoring session
export async function POST(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    return ok(await scoringController.ensureScore(user, id));
  });
}
