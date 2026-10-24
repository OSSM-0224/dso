import { NextRequest } from 'next/server';

import { participantDashboardGET } from '@/server/controllers/participantPortalHandlers';

export async function GET() {
  return participantDashboardGET();
}
