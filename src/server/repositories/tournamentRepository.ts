import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { TournamentDoc, TournamentStatus } from '../../shared/types.ts';

export class TournamentRepository {
  async findAll(): Promise<TournamentDoc[]> {
    return Array.from(dbStore.tournaments.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async findById(id: string): Promise<TournamentDoc | null> {
    return dbStore.tournaments.get(id) || null;
  }

  async findCompletedBySportCategory(
    sport: string,
    ageGroup: string,
    gender: 'boys' | 'girls',
    minYear: number
  ): Promise<TournamentDoc[]> {
    return Array.from(dbStore.tournaments.values()).filter(
      (t) =>
        t.status === 'completed' &&
        t.sport.toLowerCase() === sport.toLowerCase() &&
        t.ageGroup === ageGroup &&
        t.gender === gender &&
        t.year >= minYear &&
        t.winner !== null
    );
  }

  async create(data: {
    name: string;
    sport?: string;
    format?: string;
    ageGroup: string;
    gender: 'boys' | 'girls';
    year: number;
    championLookbackYears?: number;
    createdBy?: string;
    teams?: string[];
  }): Promise<TournamentDoc> {
    const id = `tourn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const doc: TournamentDoc = {
      id,
      name: data.name.trim(),
      sport: data.sport || 'kho-kho',
      format: data.format || 'single-elimination',
      ageGroup: data.ageGroup,
      gender: data.gender,
      year: data.year,
      status: 'draft',
      teams: data.teams || [],
      strongTeams: [],
      championLookbackYears: data.championLookbackYears || 3,
      winner: null,
      isEnrollmentLocked: false,
      enrollmentLockedAt: null,
      createdBy: data.createdBy || 'organizer',
      createdAt: now,
      updatedAt: now,
    };
    dbStore.tournaments.set(id, doc);
    return doc;
  }

  async update(id: string, data: Partial<TournamentDoc>): Promise<TournamentDoc | null> {
    const existing = dbStore.tournaments.get(id);
    if (!existing) return null;

    const updated: TournamentDoc = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    dbStore.tournaments.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return dbStore.tournaments.delete(id);
  }
}

export const tournamentRepository = new TournamentRepository();
