import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/scoring/matches/:id - match detail + current score session for scorers
export async function GET(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const authStart = timing.now();
    const user = await requireScoringWriter();
    timing.measure('auth', authStart);

    const { id } = await ctx.params;
    const scoreStart = timing.now();
    const detail = await scoringController.getMatch(user, id);
    timing.measure('scoring', scoreStart);

    return ok(detail, 200, timing);
  });
}

// POST /api/scoring/matches/:id - create (or resume) the live scoring session
export async function POST(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const authStart = timing.now();
    const user = await requireScoringWriter();
    timing.measure('auth', authStart);

    const { id } = await ctx.params;
    const scoreStart = timing.now();
    const score = await scoringController.ensureScore(user, id);
    timing.measure('scoring', scoreStart);

    return ok(score, 200, timing);
  });
}
