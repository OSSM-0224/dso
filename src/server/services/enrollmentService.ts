import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { enrollmentRepository } from '../repositories/enrollmentRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { EnrollmentDoc, TournamentDoc, UserSession } from '../../shared/types.ts';

export class EnrollmentService {
  async getEnrollments(tournamentId: string): Promise<EnrollmentDoc[]> {
    return enrollmentRepository.findByTournamentId(tournamentId);
  }

  async enrollTeams(
    tournamentId: string,
    teamIds: string[],
    user: UserSession
  ): Promise<{
    enrollments: EnrollmentDoc[];
    tournament: TournamentDoc;
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.isEnrollmentLocked) {
      throw new Error(
        'Enrollment is locked for this tournament. You must unlock enrollment before adding or removing teams.'
      );
    }

    const currentEnrollments = await enrollmentRepository.findByTournamentId(tournamentId);
    const enrolledTeamIdSet = new Set(
      currentEnrollments.filter((e) => e.status === 'enrolled').map((e) => e.teamId)
    );

    const enrolledTeamNames: string[] = [];

    for (const teamId of teamIds) {
      const team = await teamRepository.findById(teamId);
      if (!team) {
        throw new Error(`Team with ID ${teamId} not found.`);
      }

      // Validation: team's ageGroup and gender must match the tournament!
      if (team.ageGroup !== tournament.ageGroup || team.gender !== tournament.gender) {
        throw new Error(
          `Cannot enroll "${team.name}" (${team.ageGroup} ${team.gender}) into tournament "${tournament.name}" (${tournament.ageGroup} ${tournament.gender}). Category mismatch.`
        );
      }

      // Validation: duplicate detection
      if (enrolledTeamIdSet.has(teamId)) {
        continue; // Already enrolled
      }

      const existingEnrollment = await enrollmentRepository.findByTournamentAndTeam(
        tournamentId,
        teamId
      );

      if (existingEnrollment) {
        await enrollmentRepository.updateStatus(existingEnrollment.id, 'enrolled');
      } else {
        await enrollmentRepository.create({
          tournamentId,
          teamId,
          status: 'enrolled',
          enrolledBy: user.name,
        });
      }

      enrolledTeamIdSet.add(teamId);
      enrolledTeamNames.push(team.name);
    }

    // Update tournament.teams list
    const updatedTeamIds = Array.from(enrolledTeamIdSet);
    const updatedTournament = await tournamentRepository.update(tournamentId, {
      teams: updatedTeamIds,
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'bulk_enroll_teams',
      before: { totalEnrolled: tournament.teams.length },
      after: { totalEnrolled: updatedTeamIds.length },
      details: `Enrolled ${enrolledTeamNames.length} team(s): ${enrolledTeamNames.join(', ') || 'None (already enrolled)'}. Total active: ${updatedTeamIds.length}.`,
    });

    const refreshedEnrollments = await enrollmentRepository.findByTournamentId(tournamentId);

    return {
      enrollments: refreshedEnrollments,
      tournament: updatedTournament!,
    };
  }

  async withdrawTeam(
    tournamentId: string,
    teamId: string,
    user: UserSession
  ): Promise<{
    enrollments: EnrollmentDoc[];
    tournament: TournamentDoc;
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.isEnrollmentLocked) {
      throw new Error(
        'Enrollment is locked for this tournament. You must unlock enrollment before withdrawing teams.'
      );
    }

    const team = await teamRepository.findById(teamId);
    const enrollment = await enrollmentRepository.findByTournamentAndTeam(tournamentId, teamId);

    if (enrollment) {
      await enrollmentRepository.updateStatus(enrollment.id, 'withdrawn');
    }

    // Remove from tournament.teams and strongTeams
    const nextTeams = tournament.teams.filter((id) => id !== teamId);
    const nextStrong = tournament.strongTeams.filter((id) => id !== teamId);

    const updatedTournament = await tournamentRepository.update(tournamentId, {
      teams: nextTeams,
      strongTeams: nextStrong,
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'withdraw_team',
      before: { teamId, teamName: team?.name },
      after: { remainingTeamsCount: nextTeams.length },
      details: `Withdrew team "${team ? team.name : teamId}" from tournament. Remaining enrolled: ${nextTeams.length}.`,
    });

    const refreshedEnrollments = await enrollmentRepository.findByTournamentId(tournamentId);

    return {
      enrollments: refreshedEnrollments,
      tournament: updatedTournament!,
    };
  }

  async lockEnrollment(
    tournamentId: string,
    user: UserSession
  ): Promise<TournamentDoc> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const enrollments = await enrollmentRepository.findByTournamentId(tournamentId);
    const activeEnrolled = enrollments.filter((e) => e.status === 'enrolled');

    // Rule: minimum 4 teams required
    if (activeEnrolled.length < 4) {
      throw new Error(
        `A tournament must have at least 4 enrolled teams to lock enrollment and generate fixtures. Currently enrolled: ${activeEnrolled.length}.`
      );
    }

    const now = new Date().toISOString();
    const updated = await tournamentRepository.update(tournamentId, {
      isEnrollmentLocked: true,
      enrollmentLockedAt: now,
      teams: activeEnrolled.map((e) => e.teamId),
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'lock_enrollment',
      before: { isEnrollmentLocked: false },
      after: { isEnrollmentLocked: true, lockedTeamsCount: activeEnrolled.length },
      details: `Locked team enrollment with ${activeEnrolled.length} teams. Fixture generation is now unlocked.`,
    });

    return updated!;
  }

  async unlockEnrollment(
    tournamentId: string,
    user: UserSession
  ): Promise<{
    tournament: TournamentDoc;
    warning?: string;
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const updated = await tournamentRepository.update(tournamentId, {
      isEnrollmentLocked: false,
      enrollmentLockedAt: null,
    });

    let warning: string | undefined;
    if (tournament.status === 'fixtures-generated' || tournament.status === 'published') {
      warning =
        'Fixtures have already been generated for this tournament. If you modify enrolled teams, you must regenerate the fixtures.';
    }

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'unlock_enrollment',
      before: { isEnrollmentLocked: true },
      after: { isEnrollmentLocked: false },
      details: `Unlocked team enrollment.${warning ? ` Warning: ${warning}` : ''}`,
    });

    return {
      tournament: updated!,
      warning,
    };
  }
}

export const enrollmentService = new EnrollmentService();
