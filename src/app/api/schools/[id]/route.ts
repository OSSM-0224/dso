import { schoolController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    const updated = await schoolController.update(user, id, body);
    return Response.json({ success: true, data: updated });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const success = await schoolController.delete(id);
    return Response.json({ success });
  });
}
