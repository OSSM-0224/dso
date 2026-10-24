import { tournamentController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    return ok(await tournamentController.getEnrollments(id));
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    return ok(await tournamentController.enrollTeams(user, id, body));
  });
}
