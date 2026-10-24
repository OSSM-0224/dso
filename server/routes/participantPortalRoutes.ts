import { Router, Request, Response, NextFunction } from 'express';
import { requireParticipant } from '../middlewares/authMiddleware.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { enrollmentRepository } from '../repositories/enrollmentRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { acknowledgementRepository } from '../repositories/acknowledgementRepository.ts';
import { notificationRepository } from '../repositories/notificationRepository.ts';
import { MatchDoc, TeamDoc, TournamentDoc } from '../../shared/types.ts';
import {
  sanitizeMatchDto,
  sanitizeNotificationDto,
  sanitizeTeamDto,
  sanitizeTournamentDto,
} from '../serializers/dtoSerializers.ts';

const router = Router();

// Apply strict server-side participant check on all /api/my/* routes
router.use(requireParticipant);

/**
 * Helper to check if a match involves the given school.
 */
function matchInvolvesSchool(match: MatchDoc, schoolId: string): boolean {
  const aSchool = match.teamA?.schoolId;
  const bSchool = match.teamB?.schoolId;
  return aSchool === schoolId || bSchool === schoolId;
}

/**
 * Format .ics Date-Time (e.g. 20261025T140000Z)
 */
function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * Helper to compute opponent display info, resolving "Winner of Match #X (Depends on A vs B)"
 */
async function resolveMatchDisplay(match: MatchDoc, schoolId: string, allTournamentMatches: MatchDoc[]) {
  const isTeamA = match.teamA?.schoolId === schoolId;
  const myTeam = isTeamA ? match.teamA : match.teamB;
  const opponentTeam = isTeamA ? match.teamB : match.teamA;
  const mySlot = isTeamA ? 'A' : 'B';
  const opponentSlot = isTeamA ? 'B' : 'A';

  let opponentDisplay = {
    isDecided: !!opponentTeam,
    team: opponentTeam,
    label: opponentTeam ? opponentTeam.name : 'TBD',
    schoolName: opponentTeam ? (opponentTeam.schoolName || 'Opponent') : 'TBD',
    dependencyText: '',
  };

  if (!opponentTeam) {
    // Find preceding match that feeds into this slot
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

  // Check if my team had a bye leading directly to this
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

/**
 * GET /api/my/dashboard
 * School profile, "Next Match" highlight card with countdown, quick stats, active tournaments
 */
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const school = await schoolRepository.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }

    // 1. Get all teams for this school across all mediums and categories
    const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
    const teamIds = new Set(allTeams.map((t: TeamDoc) => t.id));

    // 2. Find tournaments where this school's teams are enrolled AND fixtures are published
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

    // 3. Find all matches for this school in published tournaments
    let matchesPlayed = 0;
    let matchesWon = 0;
    let matchesLost = 0;
    let matchesUpcoming = 0;

    const myMatchesWithMeta: any[] = [];

    for (const tourney of enrolledPublishedTournaments) {
      const tourneyMatches = await matchRepository.findByTournamentId(tourney.id);
      for (const m of tourneyMatches) {
        if (m.isBye) continue;
        if (matchInvolvesSchool(m, schoolId)) {
          const isTeamA = m.teamA?.schoolId === schoolId;
          const myTeam = isTeamA ? m.teamA : m.teamB;

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

    // Sort upcoming matches to pick the nearest "Next Match"
    const upcomingMatches = myMatchesWithMeta
      .filter((item) => item.match.status !== 'completed')
      .sort((a, b) => {
        const timeA = a.match.scheduledAt ? new Date(a.match.scheduledAt).getTime() : Infinity;
        const timeB = b.match.scheduledAt ? new Date(b.match.scheduledAt).getTime() : Infinity;
        return timeA - timeB;
      });

    const nextMatch = upcomingMatches.length > 0 ? upcomingMatches[0] : null;
    const unreadNotificationsCount = await notificationRepository.countUnread(schoolId);

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.name,
          mediums: school.mediums,
          schoolCode: req.user!.schoolCode || null,
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
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/my/matches
 * Query params: tournamentId, teamId, status
 * Server derives schoolId strictly from session.
 */
router.get('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const { tournamentId, teamId, status } = req.query;

    const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
    const teamIds = new Set(allTeams.map((t: TeamDoc) => t.id));

    // Get published tournaments
    const allTournaments = await tournamentRepository.findAll();
    const publishedTournaments = allTournaments.filter(
      (t) => t.status === 'published' || t.status === 'ongoing' || t.status === 'completed'
    );

    let targetTournaments = publishedTournaments;
    if (tournamentId && typeof tournamentId === 'string') {
      targetTournaments = targetTournaments.filter((t) => t.id === tournamentId);
    }

    const matchesList: any[] = [];

    for (const tourney of targetTournaments) {
      // Check enrollment
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

          // Apply filters
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

    // Sort: Upcoming nearest first, then completed latest first
    matchesList.sort((a, b) => {
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return a.status === 'completed' ? timeB - timeA : timeA - timeB;
    });

    res.json({ success: true, data: matchesList });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/my/matches/:id
 * Server derives schoolId strictly from session. Returns 403 if match belongs to another school.
 */
router.get('/matches/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const match = await matchRepository.findById(req.params.id);

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // Check tournament publication
    const tournament = await tournamentRepository.findById(match.tournamentId);
    if (!tournament || (tournament.status !== 'published' && tournament.status !== 'ongoing' && tournament.status !== 'completed')) {
      return res.status(403).json({
        success: false,
        error: 'Fixtures for this tournament are not published yet.',
      });
    }

    // STRICT ACCESS CONTROL: Match MUST involve the school
    if (!matchInvolvesSchool(match, schoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You do not have permission to access matches for other schools.',
      });
    }

    const allMatches = await matchRepository.findByTournamentId(match.tournamentId);
    const displayMeta = await resolveMatchDisplay(match, schoolId, allMatches);
    const ack = await acknowledgementRepository.findByMatchAndSchool(match.id, schoolId);

    res.json({
      success: true,
      data: {
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
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/my/matches/:id/calendar
 * Generates and downloads a standard .ics iCalendar file for coaches to add to their Google/Apple calendar.
 */
router.get('/matches/:id/calendar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const match = await matchRepository.findById(req.params.id);

    if (!match) {
      return res.status(404).send('Match not found');
    }

    const tournament = await tournamentRepository.findById(match.tournamentId);
    if (!tournament || tournament.status === 'draft' || tournament.status === 'fixtures-generated') {
      return res.status(403).send('Tournament fixtures are not published.');
    }

    if (!matchInvolvesSchool(match, schoolId)) {
      return res.status(403).send('Forbidden: Not authorized to export calendar for other schools.');
    }

    const isTeamA = match.teamA?.schoolId === schoolId;
    const myTeam = isTeamA ? match.teamA : match.teamB;
    const oppTeam = isTeamA ? match.teamB : match.teamA;

    const myTeamName = myTeam?.name || 'My School Team';
    const oppTeamName = oppTeam?.name || 'Opponent (TBD)';
    const summary = `${tournament.name}: ${myTeamName} vs ${oppTeamName}`;
    const location = match.venue || 'DSO Sports Complex, Navi Mumbai';

    const startDate = match.scheduledAt ? new Date(match.scheduledAt) : new Date(Date.now() + 86400000);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hr match duration

    const dtStart = formatIcsDateTime(startDate);
    const dtEnd = formatIcsDateTime(endDate);
    const dtStamp = formatIcsDateTime(new Date());

    const description = `DSO Navi Mumbai Tournament Match\nTournament: ${tournament.name}\nRound: ${match.roundName}\nOpponent: ${oppTeamName}\nVenue: ${location}`;

    const icsContent = [
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

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dso-match-${match.id}.ics"`);
    res.send(icsContent);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/my/bracket-path?tournamentId=
 * Returns simplified route for the school's teams in the tournament
 */
router.get('/bracket-path', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const { tournamentId } = req.query;

    if (!tournamentId || typeof tournamentId !== 'string') {
      return res.status(400).json({ success: false, error: 'tournamentId parameter is required' });
    }

    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament || (tournament.status !== 'published' && tournament.status !== 'ongoing' && tournament.status !== 'completed')) {
      return res.status(403).json({
        success: false,
        error: 'Tournament fixtures are not published yet.',
      });
    }

    const allTeams: TeamDoc[] = await teamRepository.findBySchoolId(schoolId);
    const allMatches = await matchRepository.findByTournamentId(tournamentId);

    // Track path for each school team enrolled in this tournament
    const teamPaths: any[] = [];

    for (const team of allTeams) {
      // Find matches containing this team or feeding into it
      const teamMatches = allMatches.filter(
        (m) => m.teamA?.id === team.id || m.teamB?.id === team.id
      );

      if (teamMatches.length === 0) continue;

      // Group by round
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
      let overallStatus: 'active' | 'eliminated' | 'winner' = 'active';
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

    res.json({
      success: true,
      data: {
        tournament: sanitizeTournamentDto(tournament),
        teamPaths,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/my/notifications
 * List notifications for the school
 */
router.get('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const notifications = await notificationRepository.findBySchoolId(schoolId);
    const unreadCount = await notificationRepository.countUnread(schoolId);

    res.json({
      success: true,
      data: {
        notifications: notifications.map(sanitizeNotificationDto),
        unreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/my/notifications/:id/read
 * Mark notification as read
 */
router.put('/notifications/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const updated = await notificationRepository.markAsRead(req.params.id, schoolId);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/my/notifications/read-all
 * Mark all notifications for the school as read
 */
router.put('/notifications/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const count = await notificationRepository.markAllAsRead(schoolId);
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/my/matches/:id/acknowledge
 * School coach acknowledges that they have seen and confirmed the match schedule
 */
router.post('/matches/:id/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schoolId = req.user!.schoolId!;
    const match = await matchRepository.findById(req.params.id);

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // Strict Access Control: Match must belong to school
    if (!matchInvolvesSchool(match, schoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot acknowledge matches belonging to other schools.',
      });
    }

    const ack = await acknowledgementRepository.upsert({
      matchId: match.id,
      schoolId,
      acknowledgedBy: req.user!.name,
    });

    res.json({
      success: true,
      message: 'Schedule acknowledged successfully.',
      data: ack,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
