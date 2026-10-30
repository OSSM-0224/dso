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
    return collections.matchScores.findOneWhere({ matchId });
  }

  async create(data: {
    matchId: string;
    tournamentId: string;
    /** Resolved from tournament.sport in the scoring service — never hard-coded here. */
    sport: string;
    config: MatchScoreDoc['config'];
    teams: MatchScoreDoc['teams'];
  }): Promise<MatchScoreDoc> {
    const now = new Date().toISOString();
    const doc: MatchScoreDoc = {
      id: `score-${data.matchId}`,
      matchId: data.matchId,
      tournamentId: data.tournamentId,
      sport: data.sport,
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
    return collections.matchScores.findWhere({ tournamentId });
  }

  /** Events for a match, ordered deterministically for the engine derive walk. */
  async findEventsByMatchId(matchId: string): Promise<ScoreEventDoc[]> {
    return (await collections.scoreEvents.findWhere({ matchId })).sort((a, b) => {
      if (a.event.atMs !== b.event.atMs) return a.event.atMs - b.event.atMs;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  async findEventByEventId(matchId: string, eventId: string): Promise<ScoreEventDoc | null> {
    return collections.scoreEvents.findOneWhere({
      matchId,
      'event.eventId': eventId,
    });
  }

  async appendEvent(data: {
    matchId: string;
    event: KhoKhoScoreEvent;
    recordedBy: string;
    recordedByRole: string;
  }): Promise<{ doc: ScoreEventDoc; inserted: boolean }> {
    const now = new Date().toISOString();
    const doc: ScoreEventDoc = {
      id: `ev-${data.matchId}-${data.event.eventId}`,
      matchId: data.matchId,
      event: data.event,
      recordedBy: data.recordedBy,
      recordedByRole: data.recordedByRole,
      recordedAt: now,
      createdAt: now,
    };
    const inserted = await collections.scoreEvents.insertIfAbsent(doc);
    if (inserted) return { doc, inserted };

    const existing = await collections.scoreEvents.get(doc.id);
    return { doc: existing ?? doc, inserted: false };
  }

  async deleteByMatchId(matchId: string): Promise<void> {
    const score = await this.findByMatchId(matchId);
    if (score) await collections.matchScores.delete(score.id);

    const events = await collections.scoreEvents.findWhere({ matchId });
    for (const ev of events) {
      await collections.scoreEvents.delete(ev.id);
    }
  }

  async deleteByTournamentId(tournamentId: string): Promise<void> {
    const scores = await this.findByTournamentId(tournamentId);
    const ownedMatchIds = new Set(scores.map((s) => s.matchId));

    for (const score of scores) {
      await collections.matchScores.delete(score.id);
    }

    for (const matchId of ownedMatchIds) {
      const events = await collections.scoreEvents.findWhere({ matchId });
      for (const ev of events) {
        await collections.scoreEvents.delete(ev.id);
      }
    }
  }
}

export const matchScoreRepository = new MatchScoreRepository();
