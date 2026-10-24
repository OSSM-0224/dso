import { NextRequest } from 'next/server';

import { participantAcknowledgePOST } from '@/server/controllers/participantPortalHandlers';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return participantAcknowledgePOST(req, id);
}
