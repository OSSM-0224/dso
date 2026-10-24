import { scoringController } from '@/server/controllers/scoringController';
import { handler, ok } from '@/server/validations/helpers';
import { NextRequest } from 'next/server';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/public/matches/:id/score - sanitized anonymous live score view with
// a ?version= short-circuit for cheap polling (`{changed:false}`).
export async function GET(req: NextRequest, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    const versionParam = req.nextUrl.searchParams.get('version');
    const clientVersion = versionParam === null ? null : Number(versionParam);
    return ok(
      await scoringController.publicScore(
        id,
        Number.isFinite(clientVersion) ? clientVersion : null
      )
    );
  });
}
