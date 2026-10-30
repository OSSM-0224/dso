import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// @deprecated GET /api/scoring/matches/:id now only resolves the match's
// tournament and delegates to the tournament-scoped controller. Prefer
// /api/scoring/tournaments/:tournamentId/matches/:matchId.
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    return ok(await scoringController.legacyGetMatch(user, id));
  });
}

// @deprecated POST /api/scoring/matches/:id - legacy alias (see GET).
export async function POST(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { id } = await ctx.params;
    return ok(await scoringController.legacyEnsureScore(user, id));
  });
}
