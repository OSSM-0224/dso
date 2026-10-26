import { clearSessionCookie } from '@/server/auth/session';
import { handler, ok } from '@/server/validations/helpers';

export async function POST() {
  return handler(async () => {
    await clearSessionCookie('staff');
    await clearSessionCookie('school');
    return ok({ signedOut: true });
  });
}
