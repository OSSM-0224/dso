/**
 * Next.js request handlers for the participant portal. The old Express
 * router `participantPortalRoutes.ts` was mounted at BOTH /api/my/* AND
 * /api/school/* — these handlers are shared by both mounts, and every one
 * of them resolves schoolId strictly from the school session cookie.
 */
import { NextRequest, NextResponse } from 'next/server';

import { ApiError } from '../apiError.ts';
import { requireParticipant } from '../auth/guards.ts';
import * as portal from './participantPortalController.ts';
import { handler, ok, okMessage } from '../validations/helpers.ts';

export function participantDashboardGET() {
  return handler(async () => {
    const user = await requireParticipant();
    return ok(await portal.getDashboard(user));
  });
}

export function participantMatchesGET(req: NextRequest) {
  return handler(async () => {
    const user = await requireParticipant();
    const { searchParams } = new URL(req.url);
    return ok(
      await portal.getMyMatches(user, {
        tournamentId: searchParams.get('tournamentId'),
        teamId: searchParams.get('teamId'),
        status: searchParams.get('status'),
      })
    );
  });
}

export function participantMatchDetailGET(_req: NextRequest, matchId: string) {
  return handler(async () => {
    const user = await requireParticipant();
    return ok(await portal.getMyMatchDetail(user, matchId));
  });
}

export async function participantMatchCalendarGET(_req: NextRequest, matchId: string) {
  try {
    const user = await requireParticipant();
    const icsContent = await portal.matchCalendar(user, matchId);
    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="dso-match-${matchId}.ics"`,
      },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof Error ? (err.message || 'An internal server error occurred') : 'An internal server error occurred';
    // The original route used res.status(...).send(...) for failures.
    return new NextResponse(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

export function participantBracketPathGET(req: NextRequest) {
  return handler(async () => {
    const user = await requireParticipant();
    const { searchParams } = new URL(req.url);
    return ok(await portal.getBracketPath(user, searchParams.get('tournamentId')));
  });
}

export function participantNotificationsGET() {
  return handler(async () => {
    const user = await requireParticipant();
    return ok(await portal.getNotifications(user));
  });
}

export function participantNotificationReadPUT(_req: NextRequest, notificationId: string) {
  return handler(async () => {
    const user = await requireParticipant();
    return ok(await portal.markNotificationRead(user, notificationId));
  });
}

export function participantNotificationsReadAllPUT() {
  return handler(async () => {
    const user = await requireParticipant();
    const count = await portal.markAllNotificationsRead(user);
    return NextResponse.json({ success: true, count });
  });
}

export function participantAcknowledgePOST(_req: NextRequest, matchId: string) {
  return handler(async () => {
    const user = await requireParticipant();
    const ack = await portal.acknowledgeMatch(user, matchId);
    return okMessage('Schedule acknowledged successfully.', ack);
  });
}
