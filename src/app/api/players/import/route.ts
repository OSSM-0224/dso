import { playerController } from "@/server/controllers/playerControllers";
import { requirePlayerAccess } from "@/server/auth/guards";
import { handler, ok } from "@/server/validations/helpers";

export async function POST(req: Request) {
  return handler(async () => {
    const user = await requirePlayerAccess();
    const body = await req.json().catch(() => undefined);

    const report = await playerController.importAndValidate(user, body);

    return ok(report);
  });
}
