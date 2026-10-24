import { participantNotificationsGET } from '@/server/controllers/participantPortalHandlers';

export async function GET() {
  return participantNotificationsGET();
}
