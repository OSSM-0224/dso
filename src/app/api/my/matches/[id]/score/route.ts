import { scoringController } from '@/server/controllers/scoringController';
import { requireParticipant } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { NextRequest } from 'next/server';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/my/matches/:id/score - live score for the signed-in school with a
// ?version= short-circuit for cheap polling (`{changed:false}` when unchanged).
export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const user = await requireParticipant();
    const { id } = await ctx.params;
    const versionParam = req.nextUrl.searchParams.get('version');
    const clientVersion = versionParam === null ? null : Number(versionParam);
    return ok(
      await scoringController.participantScore(
        user.schoolId!,
        id,
        Number.isFinite(clientVersion) ? clientVersion : null
      )
    );
  });
}
