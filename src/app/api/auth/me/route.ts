import {
  defaultOrganizerSession,
  readSession,
} from '@/server/auth/session';
import { handler, ok } from '@/server/validations/helpers';

export async function GET() {
  return handler(async () => {
    // Old GET /me surfaced whoever optionalAuth resolved: participant for
    // school sessions, otherwise the staff session or the default organizer.
    const schoolUser = await readSession('school');
    if (schoolUser && schoolUser.role === 'participant') {
      return ok(schoolUser);
    }
    const staffUser = await readSession('staff');
    return ok(staffUser ?? defaultOrganizerSession());
  });
}
