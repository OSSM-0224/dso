import 'server-only';
/**
 * Extracted logic of the old `routes/participantPortalRoutes.ts` Express
 * handler bodies. schoolId is ALWAYS taken from the server-side participant
 * session â€” no client-supplied schoolId can override it.
 */
import { MatchDoc, NotificationDoc, TeamDoc, TournamentDoc, UserSession } from '../../shared/types.ts';
import { ApiError } from '../apiError.ts';
import { acknowledgementRepository } from '../repositories/acknowledgementRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { notificationRepository } from '../repositories/notificationRepository.ts';
import { enrollmentRepository } from '../repositories/enrollmentRepository.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import {
  sanitizeMatchDto,
  sanitizeNotificationDto,
  sanitizeTeamDto,
  sanitizeTournamentDto,
} from '../serializers/dtoSerializers.ts';

export function matchInvolvesSchool(match: MatchDoc, schoolId: string): boolean {
  const aSchool = match.teamA?.schoolId;
  const bSchool = match.teamB?.schoolId;
  return aSchool === schoolId || bSchool === schoolId;
}

export function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export async function resolveMatchDisplay(match: MatchDoc, schoolId: string, allTournamentMatches: MatchDoc[]) {
  const isTeamA = match.teamA?.schoolId === schoolId;
  const myTeam = isTeamA ? match.teamA : match.teamB;
  const opponentTeam = isTeamA ? match.teamB : match.teamA;
  const mySlot = isTeamA ? 'A' : 'B';
  const opponentSlot = isTeamA ? 'B' : 'A';

  const opponentDisplay = {
    isDecided: !!opponentTeam,
    team: opponentTeam,
    label: opponentTeam ? opponentTeam.name : 'TBD',
    schoolName: opponentTeam ? (opponentTeam.schoolName || 'Opponent') : 'TBD',
    dependencyText: '',
  };

  if (!opponentTeam) {
    const feeder = allTournamentMatches.find(
      (m) => m.nextMatchId === match.id && m.nextSlot === opponentSlot
    );
    if (feeder) {
      const feederA = feeder.teamA?.name || 'TBD';
      const feederB = feeder.teamB?.name || 'TBD';
      opponentDisplay.label = `Winner of Match #${feeder.matchNumber}`;
      opponentDisplay.dependencyText = `Depends on Match #${feeder.matchNumber} (${feederA} vs ${feederB})`;
    } else {
      opponentDisplay.label = 'Winner of Preceding Match';
      opponentDisplay.dependencyText = 'Awaiting completion of earlier round';
    }
  }

  let byeAdvancementNote: string | null = null;
  if (match.round > 1) {
    const myFeeder = allTournamentMatches.find(
      (m) => m.nextMatchId === match.id && m.nextSlot === mySlot
    );
    if (myFeeder?.isBye) {
      byeAdvancementNote = `BYE: advances directly to ${match.roundName}`;
    }
  }

  return {
    myTeam,
    opponentDisplay,
    byeAdvancementNote,
  };
}

export async function getDashboard(user: UserSession) {
  const schoolId = user.schoolId!;
  const school = await schoolRepository.findById(schoolId);
  if (!school) {
    throw new ApiError(404, 'School not found');
  }

  const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
  const teamIds = new Set(allTeams.map((t: TeamDoc) => t.id));

  const allTournaments = await tournamentRepository.findAll();
  const publishedTournaments = allTournaments.filter(
    (t) => t.status === 'published' || t.status === 'ongoing' || t.status === 'completed'
  );

  const enrolledPublishedTournaments: TournamentDoc[] = [];
  for (const tourney of publishedTournaments) {
    const enrollments = await enrollmentRepository.findByTournamentId(tourney.id);
    const hasEnrolledTeam = enrollments.some(
      (e) => teamIds.has(e.teamId) && e.status !== 'withdrawn'
    );
    if (hasEnrolledTeam) {
      enrolledPublishedTournaments.push(tourney);
    }
  }

  let matchesPlayed = 0;
  let matchesWon = 0;
  let matchesLost = 0;
  let matchesUpcoming = 0;

  const myMatchesWithMeta: {
    match: ReturnType<typeof sanitizeMatchDto>;
    tournament: ReturnType<typeof sanitizeTournamentDto>;
    myTeam: ReturnType<typeof sanitizeTeamDto>;
    opponentDisplay: {
      isDecided: boolean;
      team: ReturnType<typeof sanitizeTeamDto>;
      label: string;
      schoolName: string;
      dependencyText: string;
    };
    byeAdvancementNote: string | null;
    isAcknowledged: boolean;
    acknowledgedAt: string | null;
  }[] = [];

  for (const tourney of enrolledPublishedTournaments) {
    const tourneyMatches = await matchRepository.findByTournamentId(tourney.id);
    for (const m of tourneyMatches) {
      if (m.isBye) continue;
      if (matchInvolvesSchool(m, schoolId)) {
        if (m.status === 'completed') {
          matchesPlayed++;
          if (m.winner && m.winner.schoolId === schoolId) {
            matchesWon++;
          } else {
            matchesLost++;
          }
        } else {
          matchesUpcoming++;
        }

        const displayMeta = await resolveMatchDisplay(m, schoolId, tourneyMatches);
        const ack = await acknowledgementRepository.findByMatchAndSchool(m.id, schoolId);

        myMatchesWithMeta.push({
          match: sanitizeMatchDto(m),
          tournament: sanitizeTournamentDto(tourney),
          myTeam: sanitizeTeamDto(displayMeta.myTeam),
          opponentDisplay: {
            ...displayMeta.opponentDisplay,
            team: sanitizeTeamDto(displayMeta.opponentDisplay.team),
          },
          byeAdvancementNote: displayMeta.byeAdvancementNote,
          isAcknowledged: !!ack,
          acknowledgedAt: ack?.acknowledgedAt || null,
        });
      }
    }
  }

  const upcomingMatches = myMatchesWithMeta
    .filter((item) => item.match.status !== 'completed')
    .sort((a, b) => {
      const timeA = a.match.scheduledAt ? new Date(a.match.scheduledAt).getTime() : Infinity;
      const timeB = b.match.scheduledAt ? new Date(b.match.scheduledAt).getTime() : Infinity;
      return timeA - timeB;
    });

  const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[0] : null;
  const unreadNotificationsCount = await notificationRepository.countUnread(schoolId);

  return {
    school: {
      id: school.id,
      name: school.name,
      mediums: school.mediums,
      schoolCode: user.schoolCode || null,
    },
    stats: {
      totalTeams: allTeams.length,
      matchesPlayed,
      matchesWon,
      matchesLost,
      matchesUpcoming,
      unreadNotifications: unreadNotificationsCount,
      activeTournamentsCount: enrolledPublishedTournaments.length,
    },
    nextMatch,
    tournaments: enrolledPublishedTournaments.map((t: TournamentDoc) => sanitizeTournamentDto(t)),
    teams: allTeams.map((t: TeamDoc) => sanitizeTeamDto(t)),
  };
}

export async function getMyMatches(
  user: UserSession,
  params: { tournamentId?: string | null; teamId?: string | null; status?: string | null }
) {
  const schoolId = user.schoolId!;
  const { tournamentId, teamId, status } = params;

  const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
  const teamIds = new Set(allTeams.map((t: TeamDoc) => t.id));

  const allTournaments = await tournamentRepository.findAll();
  const publishedTournaments = allTournaments.filter(
    (t) => t.status === 'published' || t.status === 'ongoing' || t.status === 'completed'
  );

  let targetTournaments = publishedTournaments;
  if (tournamentId && typeof tournamentId === 'string') {
    targetTournaments = targetTournaments.filter((t) => t.id === tournamentId);
  }

  const matchesList: {
    id: string;
    matchNumber: number;
    round: number;
    roundName: string;
    status: string;
    outcome: 'won' | 'lost' | 'pending';
    scheduledAt: string | null;
    venue: string | null;
    score: MatchDoc['score'];
    tournament: ReturnType<typeof sanitizeTournamentDto>;
    myTeam: ReturnType<typeof sanitizeTeamDto>;
    opponentTeam: ReturnType<typeof sanitizeTeamDto>;
    opponentDisplay: {
      isDecided: boolean;
      team: ReturnType<typeof sanitizeTeamDto>;
      label: string;
      schoolName: string;
      dependencyText: string;
    };
    byeAdvancementNote: string | null;
    isAcknowledged: boolean;
    acknowledgedAt: string | null;
  }[] = [];

  for (const tourney of targetTournaments) {
    const enrollments = await enrollmentRepository.findByTournamentId(tourney.id);
    const enrolledTeam = enrollments.find(
      (e) => teamIds.has(e.teamId) && e.status !== 'withdrawn'
    );
    if (!enrolledTeam) continue;

    const tourneyMatches = await matchRepository.findByTournamentId(tourney.id);

    for (const m of tourneyMatches) {
      if (m.isBye) continue;

      if (matchInvolvesSchool(m, schoolId)) {
        const isTeamA = m.teamA?.schoolId === schoolId;
        const myTeam = isTeamA ? m.teamA : m.teamB;
        const opponentTeam = isTeamA ? m.teamB : m.teamA;

        if (teamId && typeof teamId === 'string' && myTeam?.id !== teamId) {
          continue;
        }

        if (status && typeof status === 'string' && m.status !== status) {
          continue;
        }

        const displayMeta = await resolveMatchDisplay(m, schoolId, tourneyMatches);
        const ack = await acknowledgementRepository.findByMatchAndSchool(m.id, schoolId);

        let outcome: 'won' | 'lost' | 'pending' = 'pending';
        if (m.status === 'completed') {
          outcome = m.winner?.schoolId === schoolId ? 'won' : 'lost';
        }

        matchesList.push({
          id: m.id,
          matchNumber: m.matchNumber,
          round: m.round,
          roundName: m.roundName,
          status: m.status,
          outcome,
          scheduledAt: m.scheduledAt,
          venue: m.venue,
          score: m.score,
          tournament: sanitizeTournamentDto(tourney),
          myTeam: sanitizeTeamDto(myTeam),
          opponentTeam: sanitizeTeamDto(opponentTeam),
          opponentDisplay: {
            ...displayMeta.opponentDisplay,
            team: sanitizeTeamDto(displayMeta.opponentDisplay.team),
          },
          byeAdvancementNote: displayMeta.byeAdvancementNote,
          isAcknowledged: !!ack,
          acknowledgedAt: ack?.acknowledgedAt || null,
        });
      }
    }
  }

  matchesList.sort((a, b) => {
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
    const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
    return a.status === 'completed' ? timeB - timeA : timeA - timeB;
  });

  return matchesList;
}

export async function getMyMatchDetail(user: UserSession, matchId: string) {
  const schoolId = user.schoolId!;
  const match = await matchRepository.findById(matchId);

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  const tournament = await tournamentRepository.findById(match.tournamentId);
  if (
    !tournament ||
    (tournament.status !== 'published' && tournament.status !== 'ongoing' && tournament.status !== 'completed')
  ) {
    throw new ApiError(403, 'Fixtures for this tournament are not published yet.');
  }

  if (!matchInvolvesSchool(match, schoolId)) {
    throw new ApiError(
      403,
      'Forbidden: You do not have permission to access matches for other schools.'
    );
  }

  const allMatches = await matchRepository.findByTournamentId(match.tournamentId);
  const displayMeta = await resolveMatchDisplay(match, schoolId, allMatches);
  const ack = await acknowledgementRepository.findByMatchAndSchool(match.id, schoolId);

  return {
    match: sanitizeMatchDto(match),
    tournament: sanitizeTournamentDto(tournament),
    myTeam: sanitizeTeamDto(displayMeta.myTeam),
    opponentDisplay: {
      ...displayMeta.opponentDisplay,
      team: sanitizeTeamDto(displayMeta.opponentDisplay.team),
    },
    byeAdvancementNote: displayMeta.byeAdvancementNote,
    isAcknowledged: !!ack,
    acknowledgedAt: ack?.acknowledgedAt || null,
    acknowledgedBy: ack?.acknowledgedBy || null,
  };
}

export function buildMatchCalendar(match: MatchDoc, tournament: TournamentDoc | null, schoolId: string): string {
  const isTeamA = match.teamA?.schoolId === schoolId;
  const myTeam = isTeamA ? match.teamA : match.teamB;
  const oppTeam = isTeamA ? match.teamB : match.teamA;

  const myTeamName = myTeam?.name || 'My School Team';
  const oppTeamName = oppTeam?.name || 'Opponent (TBD)';
  const summary = `${tournament!.name}: ${myTeamName} vs ${oppTeamName}`;
  const location = match.venue || 'DSO Sports Complex, Navi Mumbai';

  const startDate = match.scheduledAt ? new Date(match.scheduledAt) : new Date(Date.now() + 86400000);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hr match duration

  const dtStart = formatIcsDateTime(startDate);
  const dtEnd = formatIcsDateTime(endDate);
  const dtStamp = formatIcsDateTime(new Date());

  const description = `DSO Navi Mumbai Tournament Match\nTournament: ${tournament!.name}\nRound: ${match.roundName}\nOpponent: ${oppTeamName}\nVenue: ${location}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DSO Navi Mumbai//Fixtures Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:dso-match-${match.id}@navimumbaidso.gov.in`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function matchCalendar(user: UserSession, matchId: string) {
  const schoolId = user.schoolId!;
  const match = await matchRepository.findById(matchId);

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  const tournament = await tournamentRepository.findById(match.tournamentId);
  if (
    !tournament ||
    tournament.status === 'draft' ||
    tournament.status === 'fixtures-generated'
  ) {
    throw new ApiError(403, 'Tournament fixtures are not published.');
  }

  if (!matchInvolvesSchool(match, schoolId)) {
    throw new ApiError(403, 'Forbidden: Not authorized to export calendar for other schools.');
  }

  return buildMatchCalendar(match, tournament, schoolId);
}

export async function getBracketPath(user: UserSession, tournamentId: string | null) {
  const schoolId = user.schoolId!;

  if (!tournamentId || typeof tournamentId !== 'string') {
    throw new ApiError(400, 'tournamentId parameter is required');
  }

  const tournament = await tournamentRepository.findById(tournamentId);
  if (
    !tournament ||
    (tournament.status !== 'published' && tournament.status !== 'ongoing' && tournament.status !== 'completed')
  ) {
    throw new ApiError(403, 'Tournament fixtures are not published yet.');
  }

  const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
  const allMatches = await matchRepository.findByTournamentId(tournamentId);

  const teamPaths: {
    team: ReturnType<typeof sanitizeTeamDto>;
    overallStatus: 'winner' | 'eliminated' | 'active';
    rounds: {
      round: number;
      roundName: string;
      matchId: string;
      matchNumber: number;
      opponent: Awaited<ReturnType<typeof resolveMatchDisplay>>['opponentDisplay'];
      status: string;
      isWinner: boolean;
      isEliminated: boolean;
      score: MatchDoc['score'];
      scheduledAt: string | null;
      venue: string | null;
    }[];
  }[] = [];

  for (const team of allTeams) {
    const teamMatches = allMatches.filter(
      (m) => m.teamA?.id === team.id || m.teamB?.id === team.id
    );

    if (teamMatches.length === 0) continue;

    const rounds = await Promise.all(
      teamMatches.map(async (m) => {
        const displayMeta = await resolveMatchDisplay(m, schoolId, allMatches);
        const isWinner = m.winner?.id === team.id;
        const isEliminated = m.status === 'completed' && !isWinner;

        return {
          round: m.round,
          roundName: m.roundName,
          matchId: m.id,
          matchNumber: m.matchNumber,
          opponent: displayMeta.opponentDisplay,
          status: m.status,
          isWinner,
          isEliminated,
          score: m.score,
          scheduledAt: m.scheduledAt,
          venue: m.venue,
        };
      })
    );

    rounds.sort((a, b) => a.round - b.round);

    const latestMatch = rounds[rounds.length - 1];
    let overallStatus: 'winner' | 'eliminated' | 'active' = 'active';
    if (tournament.winner === team.id) {
      overallStatus = 'winner';
    } else if (latestMatch && latestMatch.isEliminated) {
      overallStatus = 'eliminated';
    }

    teamPaths.push({
      team: sanitizeTeamDto(team),
      overallStatus,
      rounds,
    });
  }

  return {
    tournament: sanitizeTournamentDto(tournament),
    teamPaths,
  };
}

export async function getNotifications(user: UserSession) {
  const schoolId = user.schoolId!;
  const notifications: NotificationDoc[] = await notificationRepository.findBySchoolId(schoolId);
  const unreadCount = await notificationRepository.countUnread(schoolId);

  return {
    notifications: notifications.map(sanitizeNotificationDto),
    unreadCount,
  };
}

export async function markNotificationRead(user: UserSession, id: string) {
  const schoolId = user.schoolId!;
  const updated = await notificationRepository.markAsRead(id, schoolId);

  if (!updated) {
    throw new ApiError(404, 'Notification not found');
  }

  return updated;
}

export async function markAllNotificationsRead(user: UserSession) {
  const schoolId = user.schoolId!;
  const count = await notificationRepository.markAllAsRead(schoolId);
  return count;
}

export async function acknowledgeMatch(user: UserSession, matchId: string) {
  const schoolId = user.schoolId!;
  const match = await matchRepository.findById(matchId);

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  if (!matchInvolvesSchool(match, schoolId)) {
    throw new ApiError(
      403,
      'Forbidden: Cannot acknowledge matches belonging to other schools.'
    );
  }

  const ack = await acknowledgementRepository.upsert({
    matchId: match.id,
    schoolId,
    acknowledgedBy: user.name,
  });

  return ack;
}
