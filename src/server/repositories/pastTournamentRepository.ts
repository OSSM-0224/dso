import 'server-only';
import { collections } from '../db/docStore.ts';
import { PastTournamentDoc } from '../../shared/types.ts';

export class PastTournamentRepository {
  async findAll(): Promise<PastTournamentDoc[]> {
    const list = await collections.pastTournaments.all();
    return list.sort((a, b) => b.year - a.year);
  }

  async findByFilter(
    sport: string,
    ageGroup: string,
    gender: 'boys' | 'girls',
    minYear: number
  ): Promise<PastTournamentDoc[]> {
    return (await collections.pastTournaments.all()).filter(
      (p) =>
        p.sport.toLowerCase() === sport.toLowerCase() &&
        p.ageGroup === ageGroup &&
        p.gender === gender &&
        p.year >= minYear
    );
  }

  async create(data: {
    name: string;
    sport: string;
    ageGroup: string;
    gender: 'boys' | 'girls';
    year: number;
    winnerTeamId?: string;
    winnerTeamName: string;
    schoolName: string;
  }): Promise<PastTournamentDoc> {
    const id = `past-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const doc: PastTournamentDoc = {
      id,
      name: data.name.trim(),
      sport: data.sport,
      ageGroup: data.ageGroup,
      gender: data.gender,
      year: data.year,
      winnerTeamId: data.winnerTeamId,
      winnerTeamName: data.winnerTeamName.trim(),
      schoolName: data.schoolName.trim(),
      createdAt: new Date().toISOString(),
    };
    await collections.pastTournaments.set(doc);
    return doc;
  }

  async delete(id: string): Promise<boolean> {
    return collections.pastTournaments.delete(id);
  }
}

export const pastTournamentRepository = new PastTournamentRepository();
