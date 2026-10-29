import { teamController } from '@/server/controllers/tournamentController';
import { requireAdminOrOrganizer } from '@/server/auth/guards';
import { handler, ok } from '@/server/validations/helpers';

export async function GET(req: Request) {
  return handler(async () => {
    const { searchParams } = new URL(req.url);
    const list = await teamController.list({
      tournamentId: searchParams.get('tournamentId') ?? undefined,
      ageGroup: searchParams.get('ageGroup') ?? undefined,
      gender: searchParams.get('gender') ?? undefined,
      schoolId: searchParams.get('schoolId') ?? undefined,
    });
    return ok(list);
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requireAdminOrOrganizer();
    const body = await req.json().catch(() => undefined);
    return ok(await teamController.create(user, body), 201);
  });
}
