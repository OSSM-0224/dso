import { scoringController } from '@/server/controllers/scoringController';
import { requireScoringWriter } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string; matchId: string }>;
}

// POST .../matches/:matchId/events - append one validated scoring event
// (server-authoritative, engine resolved from tournament.sport).
export async function POST(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireScoringWriter();
    const { tournamentId, matchId } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    const score = await scoringController.appendEvent(user, tournamentId, matchId, body);
    return ok(score);
  });
}
