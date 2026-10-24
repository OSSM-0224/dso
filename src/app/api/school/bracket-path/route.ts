import { NextRequest } from 'next/server';

import { participantBracketPathGET } from '@/server/controllers/participantPortalHandlers';

export async function GET(req: NextRequest) {
  return participantBracketPathGET(req);
}
