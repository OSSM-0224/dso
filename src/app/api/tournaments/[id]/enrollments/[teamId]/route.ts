import { tournamentController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string; teamId: string }>;
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id, teamId } = await ctx.params;
    return ok(await tournamentController.withdrawTeam(user, id, teamId));
  });
}
