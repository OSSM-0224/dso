import { NextRequest } from 'next/server';

import { participantNotificationReadPUT } from '@/server/controllers/participantPortalHandlers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return participantNotificationReadPUT(req, id);
}
