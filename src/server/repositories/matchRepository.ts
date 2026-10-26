import 'server-only';
import { collections } from '../db/docStore.ts';
import { MatchDoc } from '../../shared/types.ts';

export class MatchRepository {
  async findByTournamentId(tournamentId: string): Promise<MatchDoc[]> {
    return (await collections.matches.findWhere({ tournamentId })).sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.matchNumber - b.matchNumber;
    });
  }

  async findById(id: string): Promise<MatchDoc | null> {
    return collections.matches.get(id);
  }

  async saveBatch(matches: MatchDoc[]): Promise<MatchDoc[]> {
    for (const m of matches) {
      await collections.matches.set(m);
    }
    return matches;
  }

  async update(id: string, data: Partial<MatchDoc>): Promise<MatchDoc | null> {
    const existing = await collections.matches.get(id);
    if (!existing) return null;

    const updated: MatchDoc = {
      ...existing,
      ...data,
    };
    await collections.matches.set(updated);
    return updated;
  }

  async deleteByTournamentId(tournamentId: string): Promise<number> {
    const list = await collections.matches.all();
    let deletedCount = 0;
    for (const m of list) {
      if (m.tournamentId === tournamentId) {
        if (await collections.matches.delete(m.id)) deletedCount++;
      }
    }
    return deletedCount;
  }
}

export const matchRepository = new MatchRepository();
