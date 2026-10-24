import { tournamentController } from '@/server/controllers/tournamentController';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    return ok(await tournamentController.getRecentChampions(id));
  });
}
