import { scoringController } from '@/server/controllers/scoringController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// PUT /api/admin/matches/:id/scorers - assign or replace the scorer roster
export async function PUT(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await scoringController.setScorers(user, id, body));
  });
}
