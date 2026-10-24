import { NextRequest } from 'next/server';

import { participantNotificationsReadAllPUT } from '@/server/controllers/participantPortalHandlers';

export async function PUT(req: NextRequest) {
  return participantNotificationsReadAllPUT(req);
}
