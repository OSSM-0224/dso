import { dbStore } from '../db/memoryStore.ts';
import { EnrollmentDoc, EnrollmentStatus } from '../../shared/types.ts';
import { teamRepository } from './teamRepository.ts';

export class EnrollmentRepository {
  async findByTournamentId(tournamentId: string): Promise<EnrollmentDoc[]> {
    const list = Array.from(dbStore.enrollments.values()).filter(
      (e) => e.tournamentId === tournamentId
    );

    // Populate team details
    for (const e of list) {
      if (!e.team) {
        const team = await teamRepository.findById(e.teamId);
        if (team) e.team = team;
      }
    }

    return list.sort((a, b) => new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime());
  }

  async findByTournamentAndTeam(
    tournamentId: string,
    teamId: string
  ): Promise<EnrollmentDoc | null> {
    const list = Array.from(dbStore.enrollments.values());
    const found = list.find((e) => e.tournamentId === tournamentId && e.teamId === teamId);
    if (!found) return null;

    if (!found.team) {
      const team = await teamRepository.findById(found.teamId);
      if (team) found.team = team;
    }
    return found;
  }

  async create(data: {
    tournamentId: string;
    teamId: string;
    status?: EnrollmentStatus;
    enrolledBy?: string;
  }): Promise<EnrollmentDoc> {
    const id = `enr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const team = await teamRepository.findById(data.teamId);
    const now = new Date().toISOString();

    const doc: EnrollmentDoc = {
      id,
      tournamentId: data.tournamentId,
      teamId: data.teamId,
      team: team || undefined,
      status: data.status || 'enrolled',
      enrolledBy: data.enrolledBy || 'organizer',
      enrolledAt: now,
      withdrawnAt: null,
    };

    dbStore.enrollments.set(id, doc);
    return doc;
  }

  async updateStatus(id: string, status: EnrollmentStatus): Promise<EnrollmentDoc | null> {
    const existing = dbStore.enrollments.get(id);
    if (!existing) return null;

    existing.status = status;
    if (status === 'withdrawn') {
      existing.withdrawnAt = new Date().toISOString();
    }
    dbStore.enrollments.set(id, existing);
    return existing;
  }

  async delete(id: string): Promise<boolean> {
    return dbStore.enrollments.delete(id);
  }

  async deleteByTournamentAndTeam(tournamentId: string, teamId: string): Promise<boolean> {
    for (const [id, e] of dbStore.enrollments.entries()) {
      if (e.tournamentId === tournamentId && e.teamId === teamId) {
        dbStore.enrollments.delete(id);
        return true;
      }
    }
    return false;
  }
}

export const enrollmentRepository = new EnrollmentRepository();
