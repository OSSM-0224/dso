import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { ServerTiming } from '@/server/http/serverTiming';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// GET .../matches/:matchId - console detail (match + score session). The
// service verifies the match belongs to THIS tournament (404 otherwise).
export async function GET(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    const detail = await scoringController.getMatch(user, tournamentId, matchId);
    return ok(detail, 200, timing);
  });
}

// POST .../matches/:matchId - create (or resume) the live scoring session.
export async function POST(_req: Request, ctx: Ctx) {
  const timing = new ServerTiming();
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    const score = await scoringController.ensureScore(user, tournamentId, matchId);
    return ok(score, 200, timing);
  });
}
