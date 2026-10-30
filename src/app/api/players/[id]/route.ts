import { playerController } from "@/server/controllers/playerControllers";
import { requirePlayerAccess } from "@/server/auth/guards";
import { handler, ok } from "@/server/validations/helpers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const { id } = await context.params;

    const player = await playerController.getById(user, id);

    return ok(player);
  });
}

export async function PUT(req: Request, context: RouteContext) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const { id } = await context.params;
    const body = await req.json().catch(() => undefined);

    const player = await playerController.update(user, id, body);

    return ok(player);
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const { id } = await context.params;

    await playerController.delete(user, id);

    return ok({ message: "Player deleted successfully" });
  });
}
