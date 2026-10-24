import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { MatchScoreDoc, ScoreEventDoc } from '../../shared/types.ts';
import type { KhoKhoScoreEvent } from '../../shared/scoring/types.ts';

/**
 * Persistence for the LIVE SCORER module. Score docs are keyed by matchId
 * (one scoring session per match); events are ordered by atMs then createdAt
 * so the scoring engine can re-derive the match state deterministically.
 */
export class MatchScoreRepository {
  async findByMatchId(matchId: string): Promise<MatchScoreDoc | null> {
    return dbStore.matchScores.get(matchId) || null;
  }

  async create(data: {
    matchId: string;
    tournamentId: string;
    config: MatchScoreDoc['config'];
    teams: MatchScoreDoc['teams'];
  }): Promise<MatchScoreDoc> {
    const now = new Date().toISOString();
    const doc: MatchScoreDoc = {
      id: `score-${data.matchId}`,
      matchId: data.matchId,
      tournamentId: data.tournamentId,
      sport: 'kho-kho',
      config: data.config,
      teams: data.teams,
      version: 0,
      status: 'active',
      winnerTeamIds: null,
      createdAt: now,
      updatedAt: now,
    };
    dbStore.matchScores.set(data.matchId, doc);
    return doc;
  }

  async update(matchId: string, data: Partial<MatchScoreDoc>, bumpVersion = true): Promise<MatchScoreDoc | null> {
    const existing = dbStore.matchScores.get(matchId);
    if (!existing) return null;

    const updated: MatchScoreDoc = {
      ...existing,
      ...data,
      version: bumpVersion ? existing.version + 1 : data.version ?? existing.version,
      updatedAt: new Date().toISOString(),
    };
    dbStore.matchScores.set(matchId, updated);
    return updated;
  }

  async findByTournamentId(tournamentId: string): Promise<MatchScoreDoc[]> {
    return Array.from(dbStore.matchScores.values()).filter(
      (s) => s.tournamentId === tournamentId
    );
  }

  /** Events for a match, ordered deterministically for the engine derive walk. */
  async findEventsByMatchId(matchId: string): Promise<ScoreEventDoc[]> {
    return Array.from(dbStore.scoreEvents.values())
      .filter((e) => e.matchId === matchId)
      .sort((a, b) => {
        if (a.event.atMs !== b.event.atMs) return a.event.atMs - b.event.atMs;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }

  async appendEvent(data: {
    matchId: string;
    event: KhoKhoScoreEvent;
    recordedBy: string;
    recordedByRole: string;
  }): Promise<ScoreEventDoc> {
    const now = new Date().toISOString();
    const doc: ScoreEventDoc = {
      id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      matchId: data.matchId,
      event: data.event,
      recordedBy: data.recordedBy,
      recordedByRole: data.recordedByRole,
      recordedAt: now,
      createdAt: now,
    };
    dbStore.scoreEvents.set(doc.id, doc);
    return doc;
  }

  async deleteByMatchId(matchId: string): Promise<void> {
    dbStore.matchScores.delete(matchId);
    for (const [id, ev] of Array.from(dbStore.scoreEvents.entries())) {
      if (ev.matchId === matchId) dbStore.scoreEvents.delete(id);
    }
  }

  async deleteByTournamentId(tournamentId: string): Promise<void> {
    const ownedMatchIds = new Set(
      Array.from(dbStore.matchScores.values())
        .filter((s) => s.tournamentId === tournamentId)
        .map((s) => s.matchId)
    );
    for (const matchId of ownedMatchIds) dbStore.matchScores.delete(matchId);
    for (const [id, ev] of Array.from(dbStore.scoreEvents.entries())) {
      if (ownedMatchIds.has(ev.matchId)) dbStore.scoreEvents.delete(id);
    }
  }
}

export const matchScoreRepository = new MatchScoreRepository();
