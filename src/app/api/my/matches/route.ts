import { NextRequest } from 'next/server';

import { participantMatchesGET } from '@/server/controllers/participantPortalHandlers';

export async function GET(req: NextRequest) {
  return participantMatchesGET(req);
}
