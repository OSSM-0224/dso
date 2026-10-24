import 'server-only';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { UserSession, UserRole } from '../../shared/types.ts';
import { authService } from '../services/authService.ts';

export type SessionKind = 'staff' | 'school';

export const STAFF_COOKIE = 'dso_staff_session';
export const SCHOOL_COOKIE = 'dso_school_session';

const SEVEN_DAYS_S = 60 * 60 * 24 * 7;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SEVEN_DAYS_S,
  };
}

/** Dev fallback user that the old Express `optionalAuth` middleware applied to
 * every non-participant route when no Authorization header was present.
 * Preserved verbatim so permission behaviour stays identical. */
export function defaultOrganizerSession(): UserSession {
  return {
    id: 'default-organizer',
    name: 'Organizer (Navi Mumbai DSO)',
    role: 'organizer',
    email: 'organizer@dso-navimumbai.gov.in',
  };
}

export function sessionCookieName(kind: SessionKind): string {
  return kind === 'school' ? SCHOOL_COOKIE : STAFF_COOKIE;
}

export async function readSession(kind: SessionKind): Promise<UserSession | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName(kind))?.value;
  if (!token) return null;
  return authService.verifyToken(token);
}

export async function setSessionCookie(kind: SessionKind, token: string): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(kind), token, cookieOptions());
}

export async function clearSessionCookie(kind: SessionKind): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(kind), '', { ...cookieOptions(), maxAge: 0 });
}

/** Staff-side session resolution: explicit staff cookie. Outside production the
 * same dev fallback organizer user Express used to inject (`optionalAuth`) is
 * returned so local DX stays identical; in production an unauthenticated staff
 * request resolves to `null` and the guards reject it with 401. */
export async function getStaffSession(): Promise<UserSession | null> {
  const user = await readSession('staff');
  if (user) return user;
  if (process.env.NODE_ENV !== 'production') {
    return defaultOrganizerSession();
  }
  return null;
}

/** Strict participant session: school cookie only, never a fallback
 * (matches the old `requireParticipant` refusal to use the default user). */
export async function getParticipantSession(): Promise<UserSession | null> {
  const user = await readSession('school');
  if (!user) return null;
  if (user.role !== 'participant' || !user.schoolId) return null;
  return user;
}

/** Which session kind a freshly minted token should be stored into. */
export function sessionKindForRole(role: UserRole): SessionKind {
  return role === 'participant' ? 'school' : 'staff';
}

/** Best-effort client IP equivalent of `req.ip` under Route Handlers. */
export function requestIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'local';
}
