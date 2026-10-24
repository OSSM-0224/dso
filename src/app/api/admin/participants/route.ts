import { createParticipant, listParticipants } from '@/server/controllers/participantAdminController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';
import { createParticipantSchema } from '@/server/validations/schemas';

// GET /api/admin/participants - list all school participant accounts
export async function GET() {
  return handler(async () => {
    await requireAdminOrOrganizer();
    return ok(await listParticipants());
  });
}

// POST /api/admin/participants - create a participant account for a school
export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const body = await req.json().catch(() => undefined);
    const parsed = createParticipantSchema.parse(body);
    return ok(await createParticipant(user, parsed), 201);
  });
}
