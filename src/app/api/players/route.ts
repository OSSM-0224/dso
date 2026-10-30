import { playerController } from "@/server/controllers/playerControllers";
import { requirePlayerAccess } from "@/server/auth/guards";
import { handler, ok } from "@/server/validations/helpers";

export async function GET(req: Request) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const { searchParams } = new URL(req.url);

    const list = await playerController.list(user, {
      teamId: searchParams.get("teamId") ?? undefined,
      schoolId: searchParams.get("schoolId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    return ok(list);
  });
}

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const body = await req.json().catch(() => undefined);

    const player = await playerController.create(user, body);

    return ok(player, 201);
  });
}
