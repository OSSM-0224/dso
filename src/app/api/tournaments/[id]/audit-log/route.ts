import { tournamentController } from '@/server/controllers/tournamentController';
import { NextResponse } from 'next/server';
import { errorResponse, handler } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    try {
      const logs = await tournamentController.auditLog(id);
      return NextResponse.json({ success: true, data: logs });
    } catch (err) {
      return errorResponse(err);
    }
  });
}
