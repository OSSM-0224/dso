import { scoringController } from '@/server/controllers/scoringController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ tournamentId: string }>;
}

// GET /api/admin/tournaments/:tournamentId/scorers - roster + candidate pool.
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { tournamentId } = await ctx.params;
    return ok(await scoringController.getTournamentScorers(user, tournamentId));
  });
}

// PUT /api/admin/tournaments/:tournamentId/scorers - assign or replace the
// tournament scorer roster ({ scorerIds: string[] }). Audited.
export async function PUT(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { tournamentId } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.setTournamentScorers(user, tournamentId, body));
  });
}
