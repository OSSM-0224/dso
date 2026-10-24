import { toggleParticipantStatus } from '@/server/controllers/participantAdminController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { ApiError } from '@/server/apiError';
import { handler, ok } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// PUT /api/admin/participants/:id/status - activate or deactivate an account
export async function PUT(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => undefined)) as { isActive?: boolean } | undefined;
    if (!body || typeof body.isActive !== 'boolean') {
      throw new ApiError(400, 'isActive boolean is required');
    }
    return ok(await toggleParticipantStatus(user, id, body.isActive));
  });
}
