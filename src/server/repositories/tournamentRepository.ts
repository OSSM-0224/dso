import 'server-only';
import { collections } from '../db/docStore.ts';
import { TournamentDoc } from '../../shared/types.ts';

export class TournamentRepository {
  async findAll(): Promise<TournamentDoc[]> {
    const list = await collections.tournaments.all();
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async findById(id: string): Promise<TournamentDoc | null> {
    return collections.tournaments.get(id);
  }

  async findCompletedBySportCategory(
    sport: string,
    ageGroup: string,
    gender: 'boys' | 'girls',
    minYear: number
  ): Promise<TournamentDoc[]> {
    const list = await collections.tournaments.all();
    return list.filter(
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
    await collections.tournaments.set(doc);
    return doc;
  }

  async update(id: string, data: Partial<TournamentDoc>): Promise<TournamentDoc | null> {
    const existing = await collections.tournaments.get(id);
    if (!existing) return null;

    const updated: TournamentDoc = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await collections.tournaments.set(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return collections.tournaments.delete(id);
  }
}

export const tournamentRepository = new TournamentRepository();
