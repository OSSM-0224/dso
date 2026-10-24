import { NextRequest } from 'next/server';

import { participantMatchCalendarGET } from '@/server/controllers/participantPortalHandlers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return participantMatchCalendarGET(req, id);
}
