import { pastTournamentController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

export async function GET() {
  return handler(async () => ok(await pastTournamentController.list()));
}

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const body = await req.json().catch(() => undefined);
    return ok(await pastTournamentController.create(user, body), 201);
  });
}
