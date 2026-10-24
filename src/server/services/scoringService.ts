import 'server-only';
/**
 * LIVE SCORER service. All scoring decisions are server-authoritative:
 * authz (staff roles + per-match scorer assignment), rule validation through
 * the shared scoring engine, monotonic event storage with versioned score
 * docs, completion through the existing `matchService.recordResult` (bracket
 * auto-advance, champion crowning, notifications, audit), and sanitized
 * read payloads for participants and the public view.
 */
import { ApiError } from '../apiError.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { matchScoreRepository } from '../repositories/matchScoreRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { matchService } from './matchService.ts';
import { sanitizeMatchDto, sanitizeMatchScoreDto } from '../serializers/dtoSerializers.ts';
import { MatchDoc, MatchScoreDoc, MatchScoreViewDto, ScoreEventDoc, ScoringMatchListItem, TeamDoc, TournamentDoc, UserSession } from '../../shared/types.ts';
import {
  getScoringEngine,
} from '../../shared/scoring/engine.ts';
import {
  KhoKhoScoreEvent,
  ScoringAgeGroup,
  defaultKhoKhoConfigForAgeGroup,
} from '../../shared/scoring/types.ts';

const SCOREABLE_TOURNAMENT_STATUSES = ['published', 'ongoing'] as const;
const READABLE_TOURNAMENT_STATUSES = ['published', 'ongoing', 'completed'] as const;

const engine = getScoringEngine('kho-kho');

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const rule = err as { code?: string; message?: string; name?: string };
  if (rule && rule.name === 'ScoringRuleError' && rule.code) {
    return new ApiError(409, `${rule.code}: ${rule.message || 'Scoring rule violated'}`);
  }
  if (err instanceof Error) {
    return new ApiError(500, err.message || 'An internal server error occurred');
  }
  return new ApiError(500, 'An internal server error occurred');
}

interface ScoringContext {
  match: MatchDoc;
  tournament: TournamentDoc;
}

class ScoringService {
  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async assertScoreableMatch(matchId: string): Promise<ScoringContext> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new ApiError(404, 'Match not found');

    const tournament = await tournamentRepository.findById(match.tournamentId);
    if (!tournament) throw new ApiError(404, 'Tournament for this match not found');

    if (!(SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status)) {
      throw new ApiError(
        403,
        `Scoring is only available for published or ongoing tournaments (current status: ${tournament.status}).`
      );
    }

    if (match.isBye) {
      throw new ApiError(400, 'Byes cannot be scored.');
    }

    if (!match.teamA || !match.teamB) {
      throw new ApiError(
        400,
        'Both teams must be decided before scoring can start for this match.'
      );
    }

    return { match, tournament };
  }

  /** Admins/organizers may score every match; scorers only matches they are
   * assigned to via `MatchDoc.scorerIds`. */
  private assertWriterAuthorized(user: UserSession, match: MatchDoc): void {
    if (user.role === 'admin' || user.role === 'organizer') return;
    if (user.role === 'scorer') {
      if (match.scorerIds?.includes(user.id)) return;
      throw new ApiError(403, 'You are not assigned as a scorer for this match.');
    }
    throw new ApiError(403, `Access denied. Role "${user.role}" cannot score matches.`);
  }

  private buildEngineState(scoreDoc: MatchScoreDoc, events: ScoreEventDoc[]) {
    let state = engine.createInitialState({ teams: scoreDoc.teams, config: scoreDoc.config });
    for (const ev of events) {
      try {
        state = engine.applyEvent(state, ev.event);
      } catch (err) {
        throw toApiError(err);
      }
    }
    return state;
  }

  private async ensureScoreDoc(match: MatchDoc, tournament: TournamentDoc): Promise<MatchScoreDoc> {
    const existing = await matchScoreRepository.findByMatchId(match.id);
    if (existing) return existing;

    const teamSnapshot = (team: TeamDoc | null) =>
      team
        ? { id: team.id, name: team.name, schoolName: team.schoolName || undefined }
        : null;

    const created = await matchScoreRepository.create({
      matchId: match.id,
      tournamentId: match.tournamentId,
      config: defaultKhoKhoConfigForAgeGroup(tournament.ageGroup as ScoringAgeGroup),
      teams: [teamSnapshot(match.teamA), teamSnapshot(match.teamB)].filter(
        Boolean
      ) as MatchScoreDoc['teams'],
    });

    // First scoring activity moves the match from upcoming to live.
    if (match.status === 'upcoming') {
      await matchRepository.update(match.id, { status: 'live' });
    }

    return created;
  }

  private sanitizeIncomingEvent(raw: Record<string, unknown>, user: UserSession): KhoKhoScoreEvent {
    const clone = { ...raw } as Record<string, unknown>;
    // recordedBy is always the authenticated session — never client input.
    delete clone['recordedBy'];
    return clone as unknown as KhoKhoScoreEvent;
  }

  private async appendValidatedEvent(
    scoreDoc: MatchScoreDoc,
    event: KhoKhoScoreEvent,
    user: UserSession,
    auditWhat: 'score_event' | 'score_undo',
    match: MatchDoc
  ): Promise<ScoreEventDoc[]> {
    const events = await matchScoreRepository.findEventsByMatchId(scoreDoc.matchId);
    const state = this.buildEngineState(scoreDoc, events);

    // Server-authoritative clock: the event timeline is anchored to the score
    // doc creation epoch, and every event is stamped with server wall time
    // (client-supplied atMs is ignored). This makes turn durations and
    // pause/resume windows tamper-proof while preserving inter-event deltas.
    const epoch = Date.parse(scoreDoc.createdAt) || 0;
    event.atMs = Math.max(0, Date.now() - epoch);

    const last = events.length > 0 ? events[events.length - 1].event : null;
    if (last && event.atMs < last.atMs) {
      // Monotonic timeline: clamp out-of-order arrivals to the last stamp.
      event.atMs = last.atMs;
    }

    try {
      engine.validateEvent(state, event);
    } catch (err) {
      throw toApiError(err);
    }

    await matchScoreRepository.appendEvent({
      matchId: scoreDoc.matchId,
      event,
      recordedBy: user.name,
      recordedByRole: user.role,
    });

    await matchScoreRepository.update(scoreDoc.matchId, {});

    await auditLogRepository.create({
      tournamentId: scoreDoc.tournamentId,
      who: user.name,
      role: user.role,
      what: auditWhat,
      before: null,
      after: { eventId: event.eventId, type: event.type, atMs: event.atMs },
      details: `LIVE score (${auditWhat === 'score_undo' ? 'undo' : 'event'}) for Match ${match.matchNumber} (${match.roundName}): ${event.type} @${event.atMs}ms by ${user.name}`,
    });

    if (match.status === 'upcoming') {
      await matchRepository.update(match.id, { status: 'live' });
    }

    return matchScoreRepository.findEventsByMatchId(scoreDoc.matchId);
  }

  private async buildViewDto(
    scoreDoc: MatchScoreDoc,
    events: ScoreEventDoc[]
  ): Promise<MatchScoreViewDto> {
    const state = this.buildEngineState(scoreDoc, events);
    // `nowMs` must live on the same timeline axis as the (server-stamped,
    // creation-epoch-anchored) events — see appendValidatedEvent.
    const epoch = Date.parse(scoreDoc.createdAt) || 0;
    const scoreboard = engine.getScoreboard(state, Math.max(0, Date.now() - epoch));
    return sanitizeMatchScoreDto(scoreDoc, scoreboard, events);
  }

  // ------------------------------------------------------------------
  // Scoring console endpoints
  // ------------------------------------------------------------------

  async listScoreableMatches(user: UserSession): Promise<ScoringMatchListItem[]> {
    const allUsers = await userRepository.findAll();

    const scoreableTournaments: TournamentDoc[] = [];
    const tournamentIds = new Set<string>();
    for (const t of await tournamentRepository.findAll()) {
      if ((SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(t.status)) {
        scoreableTournaments.push(t);
        tournamentIds.add(t.id);
      }
    }

    const items: ScoringMatchListItem[] = [];

    for (const tournament of scoreableTournaments) {
      const matches = await matchRepository.findByTournamentId(tournament.id);
      for (const match of matches) {
        if (match.isBye) continue;
        if (!match.teamA || !match.teamB) continue;
        if (match.status !== 'upcoming' && match.status !== 'live') continue;

        if (user.role === 'scorer' && !match.scorerIds?.includes(user.id)) continue;

        const scoreDoc = await matchScoreRepository.findByMatchId(match.id);
        const scorerIds = match.scorerIds || [];
        items.push({
          matchId: match.id,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          tournamentStatus: tournament.status,
          sport: tournament.sport,
          ageGroup: tournament.ageGroup,
          gender: tournament.gender,
          round: match.round,
          matchNumber: match.matchNumber,
          roundName: match.roundName,
          scheduledAt: match.scheduledAt,
          venue: match.venue,
          teamA: match.teamA,
          teamB: match.teamB,
          hasScore: !!scoreDoc,
          scoreVersion: scoreDoc?.version ?? 0,
          scorerNames: scorerIds
            .map((id) => allUsers.find((u) => u.id === id)?.name || 'Unknown scorer')
            .filter(Boolean),
        });
      }
    }

    items.sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return a.matchNumber - b.matchNumber;
    });

    return items;
  }

  async getMatchForScoring(user: UserSession, matchId: string) {
    const { match, tournament } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    const scorerIds = match.scorerIds || [];
    const allUsers = await userRepository.findAll();
    const scorerNames = scorerIds.map(
      (id) => allUsers.find((u) => u.id === id)?.name || 'Unknown scorer'
    );

    return {
      match: sanitizeMatchDto(match),
      tournament: {
        id: tournament.id,
        name: tournament.name,
        sport: tournament.sport,
        status: tournament.status,
        ageGroup: tournament.ageGroup,
        gender: tournament.gender,
      },
      scorerIds,
      scorerNames,
      score: scoreDoc
        ? await this.buildViewDto(scoreDoc, await matchScoreRepository.findEventsByMatchId(matchId))
        : null,
    };
  }

  async ensureMatchScore(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    const { match, tournament } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed and cannot be scored.');
    }

    const scoreDoc = await this.ensureScoreDoc(match, tournament);
    return this.buildViewDto(scoreDoc, await matchScoreRepository.findEventsByMatchId(matchId));
  }

  async appendEvent(
    user: UserSession,
    matchId: string,
    rawEvent: Record<string, unknown>
  ): Promise<MatchScoreViewDto> {
    const { match, tournament } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed and cannot be scored.');
    }

    let scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (!scoreDoc) {
      scoreDoc = await this.ensureScoreDoc(match, tournament);
    }
    if (scoreDoc.status === 'completed') {
      throw new ApiError(409, 'Scoring for this match is already completed.');
    }

    const event = this.sanitizeIncomingEvent(rawEvent, user);
    await this.appendValidatedEvent(scoreDoc, event, user, 'score_event', match);

    return this.buildViewDto(
      (await matchScoreRepository.findByMatchId(matchId))!,
      await matchScoreRepository.findEventsByMatchId(matchId)
    );
  }

  async undoLastEvent(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    const { match } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed; use the admin correction tools instead.');
    }

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (!scoreDoc) {
      throw new ApiError(409, 'No active scoring session for this match.');
    }
    if (scoreDoc.status === 'completed') {
      throw new ApiError(409, 'Scoring for this match is already completed.');
    }

    const events = await matchScoreRepository.findEventsByMatchId(matchId);
    const state = this.buildEngineState(scoreDoc, events);
    const target = engine.getUndoTarget(state);
    if (!target) {
      throw new ApiError(409, 'NOTHING_TO_UNDO: There is no active scoring event left to undo.');
    }

    const lastEvent = events.length > 0 ? events[events.length - 1].event : null;
    const voidEvent = {
      eventId: `void-${target.eventId}-${Math.random().toString(36).substring(2, 8)}`,
      atMs: lastEvent ? Math.max(target.atMs, lastEvent.atMs) : target.atMs,
      type: 'VOID',
      targetEventId: target.eventId,
    } as unknown as KhoKhoScoreEvent;

    await this.appendValidatedEvent(scoreDoc, voidEvent, user, 'score_undo', match);

    return this.buildViewDto(
      (await matchScoreRepository.findByMatchId(matchId))!,
      await matchScoreRepository.findEventsByMatchId(matchId)
    );
  }

  async completeMatch(user: UserSession, matchId: string) {
    const { match } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed.');
    }

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (!scoreDoc) {
      throw new ApiError(409, 'Scoring has not started for this match yet.');
    }

    const events = await matchScoreRepository.findEventsByMatchId(matchId);
    const state = this.buildEngineState(scoreDoc, events);
    const evaluation = engine.computeWinner(state);
    if (!evaluation.resolved || !evaluation.winnerTeamId) {
      const epoch = Date.parse(scoreDoc.createdAt) || 0;
      throw new ApiError(
        409,
        `MATCH_NOT_DECIDED: The match is not decided yet (phase: ${engine.getScoreboard(state, Math.max(0, Date.now() - epoch)).phase}).`
      );
    }

    const teamAScore = evaluation.scores[match.teamA!.id];
    const teamBScore = evaluation.scores[match.teamB!.id];

    const result = await matchService.recordResult(
      matchId,
      {
        winnerTeamId: evaluation.winnerTeamId,
        score: {
          teamAScore: teamAScore ?? 0,
          teamBScore: teamBScore ?? 0,
          details: `${evaluation.label} (LIVE scoring)`,
        },
      },
      user
    );

    const updatedScoreDoc = (await matchScoreRepository.update(matchId, {
      status: 'completed',
      winnerTeamIds: [evaluation.winnerTeamId],
    }))!;

    await auditLogRepository.create({
      tournamentId: scoreDoc.tournamentId,
      who: user.name,
      role: user.role,
      what: 'score_complete',
      before: { status: scoreDoc.status },
      after: { winnerTeamId: evaluation.winnerTeamId, label: evaluation.label },
      details: `LIVE scoring completed for Match ${match.matchNumber} (${match.roundName}): ${evaluation.label} (A ${teamAScore ?? 0} - B ${teamBScore ?? 0}) — result recorded as ${result.tournamentCompleted ? 'final tournament result' : 'round advance'}.`,
    });

    return {
      match: result.match,
      nextMatch: result.nextMatch,
      tournamentCompleted: result.tournamentCompleted,
      score: await this.buildViewDto(
        updatedScoreDoc,
        await matchScoreRepository.findEventsByMatchId(matchId)
      ),
    };
  }

  async overrideWinner(
    user: UserSession,
    matchId: string,
    criteria: { winnerTeamId: string; reason: string }
  ) {
    const { match, tournament } = await this.assertScoreableMatch(matchId);
    this.assertWriterAuthorized(user, match);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed.');
    }

    const winnerTeam = match.teamA?.id === criteria.winnerTeamId ? match.teamA : match.teamB?.id === criteria.winnerTeamId ? match.teamB : null;
    if (!winnerTeam) {
      throw new ApiError(400, 'Winner must be one of the competing teams in this match.');
    }

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (scoreDoc && scoreDoc.status === 'active') {
      // Keep the event history truthful: a MANUAL_DECISION is recorded too.
      const events = await matchScoreRepository.findEventsByMatchId(matchId);
      const state = this.buildEngineState(scoreDoc, events);
      const lastEvent = events.length > 0 ? events[events.length - 1].event : null;
      const manualEvent = {
        eventId: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        atMs: lastEvent ? lastEvent.atMs : 0,
        type: 'MANUAL_DECISION',
        winnerTeamId: criteria.winnerTeamId,
        reason: criteria.reason,
      } as unknown as KhoKhoScoreEvent;
      await this.appendValidatedEvent(scoreDoc, manualEvent, user, 'score_event', match);
    }

    const result = await matchService.recordResult(
      matchId,
      {
        winnerTeamId: criteria.winnerTeamId,
        score: {
          details: `WINNER OVERRIDDEN (LIVE): ${criteria.reason}`,
        },
      },
      user
    );

    const updatedScoreDoc = scoreDoc
      ? (await matchScoreRepository.update(matchId, {
          status: 'completed',
          winnerTeamIds: [criteria.winnerTeamId],
        }))!
      : null;

    await auditLogRepository.create({
      tournamentId: tournament.id,
      who: user.name,
      role: user.role,
      what: 'score_override_winner',
      before: { winner: match.winner?.name || 'Undecided' },
      after: { winner: winnerTeam.name, reason: criteria.reason },
      details: `LIVE score winner overridden for Match ${match.matchNumber} (${match.roundName}): "${winnerTeam.name}" — Reason: ${criteria.reason}`,
    });

    return {
      match: result.match,
      nextMatch: result.nextMatch,
      tournamentCompleted: result.tournamentCompleted,
      score: updatedScoreDoc
        ? await this.buildViewDto(updatedScoreDoc, await matchScoreRepository.findEventsByMatchId(matchId))
        : null,
    };
  }

  async setScorers(admin: UserSession, matchId: string, scorerIds: string[]) {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new ApiError(404, 'Match not found');

    const uniqueIds = Array.from(new Set(scorerIds));
    for (const id of uniqueIds) {
      const user = await userRepository.findById(id);
      if (!user) throw new ApiError(400, `Scorer id "${id}" does not exist.`);
      if (user.role !== 'scorer') {
        throw new ApiError(400, `User "${user.name}" (${id}) does not have the scorer role.`);
      }
    }

    await matchRepository.update(matchId, { scorerIds: uniqueIds });

    const scorerNames: string[] = [];
    for (const id of uniqueIds) {
      const user = await userRepository.findById(id);
      scorerNames.push(user?.name || id);
    }

    await auditLogRepository.create({
      tournamentId: match.tournamentId,
      who: admin.name,
      role: admin.role,
      what: 'assign_scorers',
      before: { scorerIds: match.scorerIds || [] },
      after: { scorerIds: uniqueIds },
      details: `Assigned scorers for Match ${match.matchNumber} (${match.roundName}): ${
        scorerNames.length > 0 ? scorerNames.join(', ') : '(none)'
      }`,
    });

    return { matchId, scorerIds: uniqueIds, scorerNames };
  }

  // ------------------------------------------------------------------
  // Read endpoints (participants + public, never include scorer identity)
  // ------------------------------------------------------------------

  async getScoreForReaders(
    matchId: string,
    clientVersion: number | null,
    opts: { schoolId?: string | null } = {}
  ): Promise<MatchScoreViewDto | { changed: false; version: number }> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new ApiError(404, 'Match not found');

    const tournament = await tournamentRepository.findById(match.tournamentId);
    if (
      !tournament ||
      !(READABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status)
    ) {
      throw new ApiError(404, 'No live score is available for this match.');
    }

    if (opts.schoolId) {
      const involvesSchool =
        match.teamA?.schoolId === opts.schoolId || match.teamB?.schoolId === opts.schoolId;
      if (!involvesSchool) {
        throw new ApiError(403, 'Your school is not part of this match.');
      }
    }

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (!scoreDoc) {
      throw new ApiError(404, 'No live score is available for this match yet.');
    }

    if (clientVersion !== null && clientVersion === scoreDoc.version) {
      return { changed: false, version: scoreDoc.version };
    }

    return this.buildViewDto(scoreDoc, await matchScoreRepository.findEventsByMatchId(matchId));
  }
}

export const scoringService = new ScoringService();
