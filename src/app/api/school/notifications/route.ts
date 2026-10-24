import { NextRequest } from 'next/server';

import { participantNotificationsGET } from '@/server/controllers/participantPortalHandlers';

export async function GET(req: NextRequest) {
  return participantNotificationsGET(req);
}
