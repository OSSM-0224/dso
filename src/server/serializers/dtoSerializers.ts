import 'server-only';
import { MatchDoc, TeamDoc, TournamentDoc, NotificationDoc } from '../../shared/types.ts';

/**
 * Whitelist serializer for Team objects sent to public or participant callers.
 * Guarantees no strength flags, seed numbers, or internal engine details are leaked.
 */
export function sanitizeTeamDto(team: TeamDoc | null): any {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    schoolId: team.schoolId,
    schoolName: team.schoolName || '',
    medium: team.medium,
    ageGroup: team.ageGroup,
    gender: team.gender,
    isActive: team.isActive,
  };
}

/**
 * Whitelist serializer for Match objects sent to public or participant callers.
 * Guarantees no seed labels, bye-reasons, or internal scoring weights are leaked.
 */
export function sanitizeMatchDto(match: MatchDoc): any {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    round: match.round,
    matchNumber: match.matchNumber,
    roundName: match.roundName,
    teamA: sanitizeTeamDto(match.teamA),
    teamB: sanitizeTeamDto(match.teamB),
    isBye: match.isBye,
    winner: sanitizeTeamDto(match.winner),
    status: match.status,
    nextMatchId: match.nextMatchId,
    nextSlot: match.nextSlot,
    scheduledAt: match.scheduledAt,
    venue: match.venue,
    quarter: match.quarter,
    score: match.score,
  };
}

/**
 * Whitelist serializer for Tournament objects sent to public or participant callers.
 * STRIP: strongTeams, championLookbackYears, snapshots, engine rules, seeds, warnings.
 */
export function sanitizeTournamentDto(tournament: TournamentDoc): any {
  return {
    id: tournament.id,
    name: tournament.name,
    sport: tournament.sport,
    format: tournament.format,
    ageGroup: tournament.ageGroup,
    gender: tournament.gender,
    year: tournament.year,
    status: tournament.status,
    winner: tournament.winner || null,
    winnerName: tournament.winnerName
      ? tournament.winnerName.replace(/champion/gi, 'Winner')
      : null,
    isEnrollmentLocked: tournament.isEnrollmentLocked,
    publishedAt: tournament.publishedAt || null,
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  };
}

/**
 * Whitelist serializer for Notifications sent to participants.
 */
export function sanitizeNotificationDto(notif: NotificationDoc): any {
  // Strip any accidental words like "champion", "seed", or "strong" from titles or messages
  const sanitizedTitle = notif.title
    .replace(/champion/gi, 'Winner')
    .replace(/strong/gi, 'leading')
    .replace(/seed[a-z0-9]*/gi, '');

  const sanitizedMessage = notif.message
    .replace(/champion/gi, 'Winner')
    .replace(/strong/gi, 'leading')
    .replace(/seed[a-z0-9]*/gi, '');

  return {
    id: notif.id,
    schoolId: notif.schoolId,
    type: notif.type,
    matchId: notif.matchId || null,
    tournamentId: notif.tournamentId || null,
    title: sanitizedTitle,
    message: sanitizedMessage,
    oldValue: notif.oldValue || null,
    newValue: notif.newValue || null,
    isRead: notif.isRead,
    createdAt: notif.createdAt,
  };
}
