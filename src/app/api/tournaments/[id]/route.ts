import { tournamentController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    return ok(await tournamentController.getById(id));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const success = await tournamentController.delete(user, id);
    return ok({ success });
  });
}
