import { createParticipant } from '@/server/controllers/participantAdminController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { createParticipantSchema } from '@/server/validations/schemas';

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const body = await req.json().catch(() => undefined);
    const parsed = createParticipantSchema.parse(body);
    return ok(await createParticipant(user, parsed), 201);
  });
}
