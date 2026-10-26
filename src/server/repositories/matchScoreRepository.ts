import 'server-only';
import { collections } from '../db/docStore.ts';
import { MatchScoreDoc, ScoreEventDoc } from '../../shared/types.ts';
import type { KhoKhoScoreEvent } from '../../shared/scoring/types.ts';

/**
 * Persistence for the LIVE SCORER module. Score docs are keyed by matchId
 * (one scoring session per match); events are ordered by atMs then createdAt
 * so the scoring engine can re-derive the match state deterministically.
 */
export class MatchScoreRepository {
  async findByMatchId(matchId: string): Promise<MatchScoreDoc | null> {
    const list = await collections.matchScores.all();
    return list.find((s) => s.matchId === matchId) || null;
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
    await collections.matchScores.set(doc);
    return doc;
  }

  async update(matchId: string, data: Partial<MatchScoreDoc>, bumpVersion = true): Promise<MatchScoreDoc | null> {
    const existing = await this.findByMatchId(matchId);
    if (!existing) return null;

    const updated: MatchScoreDoc = {
      ...existing,
      ...data,
      version: bumpVersion ? existing.version + 1 : data.version ?? existing.version,
      updatedAt: new Date().toISOString(),
    };
    await collections.matchScores.set(updated);
    return updated;
  }

  async findByTournamentId(tournamentId: string): Promise<MatchScoreDoc[]> {
    return (await collections.matchScores.all()).filter(
      (s) => s.tournamentId === tournamentId
    );
  }

  /** Events for a match, ordered deterministically for the engine derive walk. */
  async findEventsByMatchId(matchId: string): Promise<ScoreEventDoc[]> {
    return (await collections.scoreEvents.all())
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
    await collections.scoreEvents.set(doc);
    return doc;
  }

  async deleteByMatchId(matchId: string): Promise<void> {
    const score = await this.findByMatchId(matchId);
    if (score) await collections.matchScores.delete(score.id);

    const events = await collections.scoreEvents.all();
    for (const ev of events) {
      if (ev.matchId === matchId) await collections.scoreEvents.delete(ev.id);
    }
  }

  async deleteByTournamentId(tournamentId: string): Promise<void> {
    const scores = await this.findByTournamentId(tournamentId);
    const ownedMatchIds = new Set(scores.map((s) => s.matchId));

    for (const score of scores) {
      await collections.matchScores.delete(score.id);
    }

    const events = await collections.scoreEvents.all();
    for (const ev of events) {
      if (ownedMatchIds.has(ev.matchId)) await collections.scoreEvents.delete(ev.id);
    }
  }
}

export const matchScoreRepository = new MatchScoreRepository();
