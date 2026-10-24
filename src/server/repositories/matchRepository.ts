import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { MatchDoc } from '../../shared/types.ts';

export class MatchRepository {
  async findByTournamentId(tournamentId: string): Promise<MatchDoc[]> {
    return Array.from(dbStore.matches.values())
      .filter((m) => m.tournamentId === tournamentId)
      .sort((a, b) => {
        if (a.round !== b.round) return a.round - b.round;
        return a.matchNumber - b.matchNumber;
      });
  }

  async findById(id: string): Promise<MatchDoc | null> {
    return dbStore.matches.get(id) || null;
  }

  async saveBatch(matches: MatchDoc[]): Promise<MatchDoc[]> {
    for (const m of matches) {
      dbStore.matches.set(m.id, m);
    }
    return matches;
  }

  async update(id: string, data: Partial<MatchDoc>): Promise<MatchDoc | null> {
    const existing = dbStore.matches.get(id);
    if (!existing) return null;

    const updated: MatchDoc = {
      ...existing,
      ...data,
    };
    dbStore.matches.set(id, updated);
    return updated;
  }

  async deleteByTournamentId(tournamentId: string): Promise<number> {
    let deletedCount = 0;
    for (const [id, m] of dbStore.matches.entries()) {
      if (m.tournamentId === tournamentId) {
        dbStore.matches.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

export const matchRepository = new MatchRepository();
