import { teamController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const body = await req.json().catch(() => undefined);
    return ok(await teamController.importAndValidate(user, body));
  });
}
