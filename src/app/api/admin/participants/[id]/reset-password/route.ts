import { resetParticipantPassword } from '@/server/controllers/participantAdminController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { resetPasswordSchema } from '@/server/validations/schemas';

interface Ctx {
  params: Promise<{ id: string }>;
}

// PUT /api/admin/participants/:id/reset-password
export async function PUT(req: Request, ctx: Ctx) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => undefined);
    const parsed = resetPasswordSchema.parse(body);
    const data = await resetParticipantPassword(user, id, parsed.newTemporaryPassword);
    return Response.json(
      {
        success: true,
        message: 'Password reset successfully. User will be required to change password on next login.',
        data,
      }
    );
  });
}
