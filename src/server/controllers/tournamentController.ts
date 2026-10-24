import 'server-only';
/**
 * Thin wrappers around tournament/team/match/enrollment/fixture services used
 * by the /api/tournaments/* Route Handlers. Mirrors the old Express route
 * bodies one-to-one.
 */
import { UserSession, SchoolDoc, TeamDoc } from '../../shared/types.ts';
import { ApiError } from '../apiError.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { fixtureSnapshotRepository } from '../repositories/fixtureSnapshotRepository.ts';
import { pastTournamentRepository } from '../repositories/pastTournamentRepository.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { enrollmentService } from '../services/enrollmentService.ts';
import { fixtureService } from '../services/fixtureService.ts';
import { matchService } from '../services/matchService.ts';
import { teamService } from '../services/teamService.ts';
import { tournamentService } from '../services/tournamentService.ts';
import {
  bulkEnrollSchema,
  bulkImportTeamsSchema,
  createPastTournamentSchema,
  createSchoolSchema,
  createTeamSchema,
  createTournamentSchema,
  generateFixturesSchema,
  recordResultSchema,
  swapFixturesSchema,
  updateScheduleSchema,
  updateStrongTeamsSchema,
  updateTournamentTeamsSchema,
} from '../validations/schemas.ts';

export const tournamentController = {
  async list() {
    return tournamentService.getAll();
  },

  async create(user: UserSession, body: unknown) {
    const parsed = createTournamentSchema.parse(body);
    return tournamentService.create(parsed, user);
  },

  async getById(id: string) {
    const tournament = await tournamentService.getById(id);
    if (!tournament) {
      throw new ApiError(404, 'Tournament not found');
    }
    const snapshot = await fixtureSnapshotRepository.findByTournamentId(id);
    return { ...tournament, snapshot };
  },

  async updateTeams(user: UserSession, id: string, body: unknown) {
    const parsed = updateTournamentTeamsSchema.parse(body);
    return tournamentService.updateTeams(id, parsed.teams, user);
  },

  async updateStrongTeams(user: UserSession, id: string, body: unknown) {
    const parsed = updateStrongTeamsSchema.parse(body);
    return tournamentService.updateStrongTeams(id, parsed.strongTeams, user);
  },

  async getRecentChampions(id: string) {
    return tournamentService.getRecentChampions(id);
  },

  async generateFixtures(user: UserSession, id: string, body: unknown) {
    const parsed = generateFixturesSchema.parse(body);
    return fixtureService.generateFixtures(id, {
      seed: parsed.seed,
      user,
    });
  },

  async swapFixtures(user: UserSession, id: string, body: unknown) {
    const parsed = swapFixturesSchema.parse(body);
    return fixtureService.executeSwap(id, parsed.teamAId, parsed.teamBId, parsed.force || false, user);
  },

  async publish(user: UserSession, id: string) {
    return fixtureService.publish(id, user);
  },

  async matches(id: string) {
    return matchService.getTournamentMatches(id);
  },

  async auditLog(id: string) {
    return auditLogRepository.findByTournamentId(id);
  },

  async getEnrollments(id: string) {
    return enrollmentService.getEnrollments(id);
  },

  async enrollTeams(user: UserSession, id: string, body: unknown) {
    const parsed = bulkEnrollSchema.parse(body);
    return enrollmentService.enrollTeams(id, parsed.teamIds, user);
  },

  async withdrawTeam(user: UserSession, id: string, teamId: string) {
    return enrollmentService.withdrawTeam(id, teamId, user);
  },

  async lockEnrollment(user: UserSession, id: string) {
    return enrollmentService.lockEnrollment(id, user);
  },

  async unlockEnrollment(user: UserSession, id: string) {
    return enrollmentService.unlockEnrollment(id, user);
  },
};

export const matchController = {
  async recordResult(user: UserSession, matchId: string, body: unknown) {
    const parsed = recordResultSchema.parse(body);
    return matchService.recordResult(matchId, parsed, user);
  },

  async updateSchedule(user: UserSession, matchId: string, body: unknown) {
    const parsed = updateScheduleSchema.parse(body);
    return matchService.updateSchedule(matchId, parsed, user);
  },
};

export const teamController = {
  async list(params: { ageGroup?: string; gender?: string; schoolId?: string }) {
    return teamRepository.findAll(params);
  },

  async create(user: UserSession, body: unknown) {
    const parsed = createTeamSchema.parse(body);
    return teamRepository.create(parsed);
  },

  async update(user: UserSession, id: string, body: unknown) {
    const updated = await teamRepository.update(id, body as Partial<TeamDoc>);
    if (!updated) {
      throw new ApiError(404, 'Team not found');
    }
    return updated;
  },

  async delete(id: string) {
    return teamRepository.delete(id);
  },

  async importAndValidate(user: UserSession, body: unknown) {
    const parsed = bulkImportTeamsSchema.parse(body);
    return teamService.validateAndImportCsv(parsed.rows, parsed.commit || false);
  },
};

export const schoolController = {
  async list() {
    return schoolRepository.findAll();
  },

  async create(user: UserSession, body: unknown) {
    const parsed = createSchoolSchema.parse(body);
    return schoolRepository.create(parsed);
  },

  async update(user: UserSession, id: string, body: unknown) {
    const updated = await schoolRepository.update(id, body as Partial<Pick<SchoolDoc, 'name' | 'mediums'>>);
    if (!updated) {
      throw new ApiError(404, 'School not found');
    }
    return updated;
  },

  async delete(id: string) {
    return schoolRepository.delete(id);
  },
};

export const pastTournamentController = {
  async list() {
    return pastTournamentRepository.findAll();
  },

  async create(user: UserSession, body: unknown) {
    const parsed = createPastTournamentSchema.parse(body);
    return pastTournamentRepository.create(parsed);
  },

  async delete(id: string) {
    return pastTournamentRepository.delete(id);
  },
};
