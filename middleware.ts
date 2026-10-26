import { NextRequest, NextResponse } from 'next/server';

const STAFF_COOKIE = 'dso_staff_session';
const SCHOOL_COOKIE = 'dso_school_session';

/**
 * Lightweight route protection only (cookie presence). Full authorization
 * stays in the Route Handlers / services:
 *  - /api/my/*  → a school cookie must exist; otherwise the same 401 JSON the
 *    route handlers emit.
 *  - /school/*  → participant-only, except the login page; unauthenticated
 *    visitors land on /school/login.
 *  - DSO admin pages → while a school session exists, the admin surface is
 *    replaced by the school portal (same behaviour as the old SPA swap).
 * A visitor with NO staff cookie still gets the default-organizer dev view,
 * exactly like the old Express `optionalAuth` fallback.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const school = req.cookies.get(SCHOOL_COOKIE)?.value;
  const staff = req.cookies.get(STAFF_COOKIE)?.value;

  if (pathname.startsWith('/api/my')) {
    if (!school) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required. Please sign in with your School Account credentials.',
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/school')) {
    if (pathname === '/school/login') {
      if (school) {
        return NextResponse.redirect(new URL('/school/dashboard', req.url));
      }
      return NextResponse.next();
    }
    if (!school) {
      return NextResponse.redirect(new URL('/school/login', req.url));
    }
    return NextResponse.next();
  }

  if (
    school &&
    (pathname === '/' ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/tournaments') ||
      pathname.startsWith('/teams') ||
      pathname.startsWith('/school-accounts') ||
      pathname.startsWith('/past-champions') ||
      pathname.startsWith('/engine-tests') ||
      pathname.startsWith('/public'))
  ) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/my/:path*',
    '/school/:path*',
    '/',
    '/dashboard',
    '/teams',
    '/tournaments/:path*',
    '/school-accounts',
    '/past-champions',
    '/engine-tests',
    '/public/:path*',
  ],
};
