import { pastTournamentRepository } from '@/server/repositories/pastTournamentRepository';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const success = await pastTournamentRepository.delete(id);
    return Response.json({ success });
  });
}
