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
import { MatchDoc, MatchScoreDoc, MatchScoreViewDto, OrganizerOverviewGroup, ScoreEventDoc, ScorerCandidate, ScoringMatchListItem, ScoringTournamentSummary, TeamDoc, TournamentDoc, TournamentScorerRoster, TournamentStatus, UserSession } from '../../shared/types.ts';
import {
  getScoringEngine,
  ScoringEngine,
} from '../../shared/scoring/engine.ts';
import {
  KhoKhoScoreEvent,
  ScoringAgeGroup,
  ScoringSport,
  defaultKhoKhoConfigForAgeGroup,
} from '../../shared/scoring/types.ts';

const SCOREABLE_TOURNAMENT_STATUSES = ['published', 'ongoing'] as const;
const READABLE_TOURNAMENT_STATUSES = ['published', 'ongoing', 'completed'] as const;

/** Shared wording so the UI can detect an assignment failure without parsing prose. */
const SCORER_NOT_ASSIGNED_MESSAGE =
  'You are not assigned to this match/tournament. Ask the organizer to assign you as a scorer.';

/**
 * Engine registry resolved PER TOURNAMENT (`tournament.sport`), never a
 * hard-coded 'kho-kho' singleton. An unknown sport surfaces as 400 so both
 * the API and the console screens degrade gracefully.
 */
class ScoringEngineResolver {
  private readonly cache = new Map<string, ScoringEngine>();

  resolve(sport: string): ScoringEngine {
    const cached = this.cache.get(sport);
    if (cached) return cached;
    try {
      const engine = getScoringEngine(sport as ScoringSport);
      this.cache.set(sport, engine);
      return engine;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        400,
        `Scoring is not available for the sport "${sport}" yet.`
      );
    }
  }
}

/**
 * One default scoring config per sport. New sports plug in here when their
 * engine lands (see README "How to add a new sport"); existing tournaments
 * with a registered sport always get a deterministic config.
 */
function defaultConfigForTournament(tournament: TournamentDoc): MatchScoreDoc['config'] {
  switch (tournament.sport) {
    case 'kho-kho':
      return defaultKhoKhoConfigForAgeGroup(tournament.ageGroup as ScoringAgeGroup);
    default:
      throw new ApiError(
        400,
        `Scoring is not available for the sport "${tournament.sport}" yet.`
      );
  }
}

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
  /** Per-tournament engine resolution (see class doc above). */
  private readonly engines = new ScoringEngineResolver();

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private engineFor(sport: string): ScoringEngine {
    return this.engines.resolve(sport);
  }

  private async assertScoreableMatch(
    matchId: string,
    expectedTournamentId?: string | null
  ): Promise<ScoringContext> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new ApiError(404, 'Match not found');

    // Match/tournament mismatch is a 404, never a leak of another tournament.
    if (expectedTournamentId && match.tournamentId !== expectedTournamentId) {
      throw new ApiError(404, 'Match not found in this tournament.');
    }

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

  /**
   * Admins/organizers may score every match. A scorer must be assigned to the
   * TOURNAMENT (`TournamentDoc.scorerIds`); an existing match-level
   * `MatchDoc.scorerIds` additionally narrows within that tournament.
   *
   * Legacy fallback: a tournament without `TournamentDoc.scorerIds` (not yet
   * migrated) keeps the old per-match behaviour so pre-migration data keeps
   * scoring while the migration runs.
   */
  private assertWriterAuthorized(user: UserSession, match: MatchDoc, tournament: TournamentDoc): void {
    if (user.role === 'admin' || user.role === 'organizer') return;
    if (user.role === 'scorer') {
      const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];

      if (tournamentScorers.length > 0) {
        if (!tournamentScorers.includes(user.id)) {
          throw new ApiError(403, SCORER_NOT_ASSIGNED_MESSAGE);
        }
        // Tournament-level assignment allows any match in THIS tournament,
        // narrowed by an optional per-match roster when it exists.
        if (Array.isArray(match.scorerIds) && match.scorerIds.length > 0) {
          if (!match.scorerIds.includes(user.id)) {
            throw new ApiError(403, SCORER_NOT_ASSIGNED_MESSAGE);
          }
        }
        return;
      }

      // Legacy (not yet migrated): match-level assignment only.
      if (match.scorerIds?.includes(user.id)) return;
      throw new ApiError(403, SCORER_NOT_ASSIGNED_MESSAGE);
    }
    throw new ApiError(403, `Access denied. Role "${user.role}" cannot score matches.`);
  }

  /**
   * READ authorization for the tournament-scoped hub/console. Scorers may
   * only read matches of tournaments they are assigned to (with the same
   * legacy fallback as {@link assertWriterAuthorized}). Staff read everything.
   */
  private assertReaderAuthorized(user: UserSession, tournament: TournamentDoc): void {
    if (user.role === 'admin' || user.role === 'organizer') return;
    if (user.role === 'scorer') {
      const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
      if (tournamentScorers.includes(user.id)) return;
      throw new ApiError(403, SCORER_NOT_ASSIGNED_MESSAGE);
    }
    throw new ApiError(403, `Access denied. Role "${user.role}" cannot access the scoring console.`);
  }

  /** True when a scorer may score matches of this tournament (list helpers). */
  private async scorerAssignedToTournament(user: UserSession, tournament: TournamentDoc): Promise<boolean> {
    const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
    if (tournamentScorers.includes(user.id)) return true;
    // Legacy fallback: any match-level assignment inside this tournament.
    const matches = await matchRepository.findByTournamentId(tournament.id);
    return matches.some((m) => Array.isArray(m.scorerIds) && m.scorerIds.includes(user.id));
  }

  private tournamentSummary(tournament: TournamentDoc, matches: MatchDoc[]): ScoringTournamentSummary {
    const now = new Date();
    const isSameDay = (iso: string | null) => {
      if (!iso) return false;
      try {
        const d = new Date(iso);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      } catch {
        return false;
      }
    };

    const nonBye = matches.filter((m) => !m.isBye && m.teamA && m.teamB);
    const isReadOnly = !((SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status));
    const scoreable = nonBye.filter(
      (m) =>
        m.status === 'upcoming' || m.status === 'live'
    );

    return {
      id: tournament.id,
      name: tournament.name,
      sport: tournament.sport,
      status: tournament.status as TournamentStatus,
      ageGroup: tournament.ageGroup,
      gender: tournament.gender,
      publishedAt: tournament.publishedAt || null,
      liveMatchCount: nonBye.filter((m) => m.status === 'live').length,
      todayMatchCount: nonBye.filter((m) => isSameDay(m.scheduledAt)).length,
      scoreableMatchCount: scoreable.length,
      isReadOnly,
      scorerCount: Array.isArray(tournament.scorerIds) ? tournament.scorerIds.length : 0,
    };
  }

  private buildEngineState(scoreDoc: MatchScoreDoc, events: ScoreEventDoc[]) {
    const engine = this.engineFor(scoreDoc.sport);
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
      sport: tournament.sport,
      config: defaultConfigForTournament(tournament),
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

  private sanitizeIncomingEvent(
    raw: Record<string, unknown>
  ): { event: KhoKhoScoreEvent; clientAtMs: number | null } {
    const clone = { ...raw } as Record<string, unknown>;
    // recordedBy is always the authenticated session - never client input.
    delete clone['recordedBy'];
    delete clone['atMs'];
    const rawClientAt = clone['clientAtMs'];
    delete clone['clientAtMs'];
    const clientAtMs =
      typeof rawClientAt === 'number' && Number.isFinite(rawClientAt) && rawClientAt >= 0
        ? Math.round(rawClientAt)
        : null;
    return { event: clone as unknown as KhoKhoScoreEvent, clientAtMs };
  }

  private async appendValidatedEvent(
    scoreDoc: MatchScoreDoc,
    event: KhoKhoScoreEvent,
    user: UserSession,
    auditWhat: 'score_event' | 'score_undo',
    match: MatchDoc,
    clientAtMs: number | null = null
  ): Promise<{ scoreDoc: MatchScoreDoc; events: ScoreEventDoc[]; inserted: boolean }> {
    const events = await matchScoreRepository.findEventsByMatchId(scoreDoc.matchId);
    const state = this.buildEngineState(scoreDoc, events);

    // Server-authoritative clock: the timeline is anchored to the score doc
    // creation epoch. A client may request its action time, but the server
    // clamps it between the previous accepted event and server-now so a slow
    // network or skewed client clock can never reorder or backdate the match.
    const epoch = Date.parse(scoreDoc.createdAt) || 0;
    const serverNowMs = Math.max(0, Date.now() - epoch);
    const last = events.length > 0 ? events[events.length - 1].event : null;
    const requestedAtMs = clientAtMs ?? serverNowMs;
    event.atMs = Math.max(last?.atMs ?? 0, Math.min(requestedAtMs, serverNowMs));

    const engine = this.engineFor(scoreDoc.sport);
    try {
      engine.validateEvent(state, event);
    } catch (err) {
      throw toApiError(err);
    }

    const appended = await matchScoreRepository.appendEvent({
      matchId: scoreDoc.matchId,
      event,
      recordedBy: user.name,
      recordedByRole: user.role,
    });

    if (!appended.inserted) {
      // Idempotent re-delivery: return the current truth without counting the
      // same action twice or writing another audit entry.
      return {
        scoreDoc: (await matchScoreRepository.findByMatchId(scoreDoc.matchId)) ?? scoreDoc,
        events: await matchScoreRepository.findEventsByMatchId(scoreDoc.matchId),
        inserted: false,
      };
    }

    const updatedScoreDoc =
      (await matchScoreRepository.update(scoreDoc.matchId, {})) ?? scoreDoc;

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

    return {
      scoreDoc: updatedScoreDoc,
      events: [...events, appended.doc],
      inserted: true,
    };
  }

  private async buildViewDto(
    scoreDoc: MatchScoreDoc,
    events: ScoreEventDoc[]
  ): Promise<MatchScoreViewDto> {
    const state = this.buildEngineState(scoreDoc, events);
    // `nowMs` must live on the same timeline axis as the (server-stamped,
    // creation-epoch-anchored) events — see appendValidatedEvent.
    const epoch = Date.parse(scoreDoc.createdAt) || 0;
    const serverNowMs = Math.max(0, Date.now() - epoch);
    const scoreboard = this.engineFor(scoreDoc.sport).getScoreboard(state, serverNowMs);
    return sanitizeMatchScoreDto(scoreDoc, scoreboard, events, serverNowMs);
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
      const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
      // Tournament-level scoring assignment: a scorer sees (and may score) any
      // scoreable match. Legacy tournaments (no tournament-level roster) keep
      // the per-match narrowing below.
      const tournamentAssigned = tournamentScorers.includes(user.id);
      const legacyMode = user.role === 'scorer' && !tournamentAssigned && tournamentScorers.length === 0;
      if (legacyMode) {
        const tournamentMatches = await matchRepository.findByTournamentId(tournament.id);
        if (!tournamentMatches.some((m) => Array.isArray(m.scorerIds) && m.scorerIds.includes(user.id))) {
          continue;
        }
      }

      const [matches, tournamentScores] = await Promise.all([
        matchRepository.findByTournamentId(tournament.id),
        matchScoreRepository.findByTournamentId(tournament.id),
      ]);
      const scoreByMatchId = new Map(
        tournamentScores.map((scoreDoc) => [scoreDoc.matchId, scoreDoc])
      );
      for (const match of matches) {
        if (match.isBye) continue;
        if (!match.teamA || !match.teamB) continue;
        if (match.status !== 'upcoming' && match.status !== 'live') continue;

        if (legacyMode && !match.scorerIds?.includes(user.id)) continue;
        if (user.role === 'scorer' && tournamentAssigned) {
          // Optional per-match narrowing within the tournament.
          if (Array.isArray(match.scorerIds) && match.scorerIds.length > 0 && !match.scorerIds.includes(user.id)) {
            continue;
          }
        }

        const scoreDoc = scoreByMatchId.get(match.id);
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

  async getMatchForScoring(user: UserSession, tournamentId: string, matchId: string) {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

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

  async ensureMatchScore(user: UserSession, tournamentId: string, matchId: string): Promise<MatchScoreViewDto> {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed and cannot be scored.');
    }

    const scoreDoc = await this.ensureScoreDoc(match, tournament);
    return this.buildViewDto(scoreDoc, await matchScoreRepository.findEventsByMatchId(matchId));
  }

  async appendEvent(
    user: UserSession,
    tournamentId: string,
    matchId: string,
    rawEvent: Record<string, unknown>
  ): Promise<MatchScoreViewDto> {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

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

    const eventId = typeof rawEvent.eventId === 'string' ? rawEvent.eventId : '';
    if (eventId) {
      const duplicate = await matchScoreRepository.findEventByEventId(matchId, eventId);
      if (duplicate) {
        return this.buildViewDto(
          scoreDoc,
          await matchScoreRepository.findEventsByMatchId(matchId)
        );
      }
    }

    const { event, clientAtMs } = this.sanitizeIncomingEvent(rawEvent);
    const appended = await this.appendValidatedEvent(
      scoreDoc,
      event,
      user,
      'score_event',
      match,
      clientAtMs
    );

    return this.buildViewDto(appended.scoreDoc, appended.events);
  }

  async undoLastEvent(user: UserSession, tournamentId: string, matchId: string): Promise<MatchScoreViewDto> {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

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
    const target = this.engineFor(scoreDoc.sport).getUndoTarget(state);
    if (!target) {
      throw new ApiError(409, 'NOTHING_TO_UNDO: There is no active scoring event left to undo.');
    }

    const lastEvent = events.length > 0 ? events[events.length - 1].event : null;
    const voidAtMs = lastEvent ? Math.max(target.atMs, lastEvent.atMs) : target.atMs;
    const voidEvent = {
      eventId: `void-${matchId}-${target.eventId}`,
      atMs: voidAtMs,
      type: 'VOID',
      targetEventId: target.eventId,
    } as unknown as KhoKhoScoreEvent;

    const appended = await this.appendValidatedEvent(
      scoreDoc,
      voidEvent,
      user,
      'score_undo',
      match,
      voidAtMs
    );

    return this.buildViewDto(appended.scoreDoc, appended.events);
  }

  async completeMatch(user: UserSession, tournamentId: string, matchId: string) {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

    if (match.status === 'completed') {
      throw new ApiError(409, 'This match is already completed.');
    }

    const scoreDoc = await matchScoreRepository.findByMatchId(matchId);
    if (!scoreDoc) {
      throw new ApiError(409, 'Scoring has not started for this match yet.');
    }

    const events = await matchScoreRepository.findEventsByMatchId(matchId);
    const state = this.buildEngineState(scoreDoc, events);
    const engine = this.engineFor(scoreDoc.sport);
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
    tournamentId: string,
    matchId: string,
    criteria: { winnerTeamId: string; reason: string }
  ) {
    const { match, tournament } = await this.assertScoreableMatch(matchId, tournamentId);
    this.assertWriterAuthorized(user, match, tournament);

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
      const manualAtMs = lastEvent ? lastEvent.atMs : 0;
      const manualEvent = {
        eventId: `manual-${matchId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        atMs: manualAtMs,
        type: 'MANUAL_DECISION',
        winnerTeamId: criteria.winnerTeamId,
        reason: criteria.reason,
      } as unknown as KhoKhoScoreEvent;
      await this.appendValidatedEvent(
        scoreDoc,
        manualEvent,
        user,
        'score_event',
        match,
        manualAtMs
      );
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

  /** Admin/organizer: scorer accounts available for match assignment. */
  async listScorerCandidates(user: UserSession): Promise<ScorerCandidate[]> {
    if (user.role !== 'admin' && user.role !== 'organizer') {
      throw new ApiError(
        403,
        `Access denied. Role "${user.role}" cannot manage scorer assignments.`
      );
    }

    const users = await userRepository.findAll();
    return users
      .filter((u) => u.role === 'scorer' && u.isActive)
      .map((u) => ({
        id: u.id,
        name: u.name,
        identifier: u.schoolCode || u.email || null,
      }));
  }

  /** Admin/organizer: assign or replace the scorer roster of a match. */
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
  // TOURNAMENT-SCOPED scoring hub (picker / hub / organizer overview)
  // ------------------------------------------------------------------

  /**
   * GET /api/scoring/tournaments — picker payload. Scorers get ONLY the
   * tournaments they are assigned to (tournament-level roster, with the
   * legacy per-match fallback); admins/organizers get every scoreable one.
   */
  async listScoringTournaments(user: UserSession): Promise<ScoringTournamentSummary[]> {
    const isStaff = user.role === 'admin' || user.role === 'organizer';
    const summaries: ScoringTournamentSummary[] = [];

    for (const tournament of await tournamentRepository.findAll()) {
      if (isStaff) {
        if (!(SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status)) continue;
        const matches = await matchRepository.findByTournamentId(tournament.id);
        summaries.push(this.tournamentSummary(tournament, matches));
        continue;
      }

      if (user.role !== 'scorer') {
        throw new ApiError(403, `Access denied. Role "${user.role}" has no scoring console.`);
      }
      if (!await this.scorerAssignedToTournament(user, tournament)) continue;
      if (!(SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status)) continue;
      const matches = await matchRepository.findByTournamentId(tournament.id);
      summaries.push(this.tournamentSummary(tournament, matches));
    }

    return summaries;
  }

  /** True when a scorer may READ the hub of this tournament. */
  private assertTournamentReadable(user: UserSession, tournament: TournamentDoc, matches: MatchDoc[]): void {
    if (user.role === 'admin' || user.role === 'organizer') return;
    if (user.role === 'scorer') {
      const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
      if (tournamentScorers.includes(user.id)) return;
      // Legacy fallback before migration: per-match assignment.
      if (matches.some((m) => Array.isArray(m.scorerIds) && m.scorerIds.includes(user.id))) return;
      throw new ApiError(403, SCORER_NOT_ASSIGNED_MESSAGE);
    }
    throw new ApiError(403, `Access denied. Role "${user.role}" has no scoring console.`);
  }

  /**
   * GET /api/scoring/tournaments/:tournamentId/matches — hub list. Returns
   * ONLY this tournament's matches (all statuses; the hub groups them into
   * Live / Today / Upcoming / Completed). Writes are separately rejected for
   * completed tournaments inside assertScoreableMatch.
   */
  async listTournamentMatches(user: UserSession, tournamentId: string): Promise<{
    tournament: ScoringTournamentSummary;
    matches: ScoringMatchListItem[];
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new ApiError(404, 'Tournament not found');

    const matches = await matchRepository.findByTournamentId(tournamentId);
    this.assertTournamentReadable(user, tournament, matches);

    const allUsers = await userRepository.findAll();
    const scoreByMatchId = new Map(
      (await matchScoreRepository.findByTournamentId(tournamentId)).map((d) => [d.matchId, d])
    );
    const tournamentScorers = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
    const scorerTournamentAssigned = tournamentScorers.includes(user.id);

    const items: ScoringMatchListItem[] = [];
    for (const match of matches) {
      if (match.isBye) continue;
      if (!match.teamA || !match.teamB) continue;

      if (user.role === 'scorer') {
        if (scorerTournamentAssigned) {
          // Optional per-match narrowing within the tournament.
          if (Array.isArray(match.scorerIds) && match.scorerIds.length > 0 && !match.scorerIds.includes(user.id)) {
            continue;
          }
        } else if (!match.scorerIds?.includes(user.id)) {
          continue;
        }
      }

      const scoreDoc = scoreByMatchId.get(match.id);
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
        scorerNames: (match.scorerIds || [])
          .map((id) => allUsers.find((u) => u.id === id)?.name || 'Unknown scorer')
          .filter(Boolean),
      });
    }

    items.sort((a, b) => a.matchNumber - b.matchNumber);
    return { tournament: this.tournamentSummary(tournament, matches), matches: items };
  }

  /** Staff-only: live/scoreable matches of EVERY tournament, grouped. */
  async getOrganizerOverview(user: UserSession): Promise<OrganizerOverviewGroup[]> {
    if (user.role !== 'admin' && user.role !== 'organizer') {
      throw new ApiError(403, `Access denied. Role "${user.role}" has no organizer overview.`);
    }

    const allUsers = await userRepository.findAll();
    const groups: OrganizerOverviewGroup[] = [];

    for (const tournament of await tournamentRepository.findAll()) {
      const isScoreable = (SCOREABLE_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status);
      const matches = await matchRepository.findByTournamentId(tournament.id);
      const scoreByMatchId = new Map(
        (await matchScoreRepository.findByTournamentId(tournament.id)).map((d) => [d.matchId, d])
      );

      const items: ScoringMatchListItem[] = [];
      for (const match of matches) {
        if (match.isBye) continue;
        if (!match.teamA || !match.teamB) continue;
        if (match.status !== 'upcoming' && match.status !== 'live') continue;

        const scoreDoc = scoreByMatchId.get(match.id);
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
          scorerNames: (match.scorerIds || [])
            .map((id) => allUsers.find((u) => u.id === id)?.name || 'Unknown scorer')
            .filter(Boolean),
        });
      }

      if (!isScoreable && items.length === 0) continue;
      groups.push({ tournament: this.tournamentSummary(tournament, matches), matches: items });
    }

    return groups;
  }

  /** Server component helper for the legacy /score/:matchId redirect. */
  async resolveMatchTournamentId(matchId: string): Promise<string | null> {
    const match = await matchRepository.findById(matchId);
    return match ? match.tournamentId : null;
  }

  /** Admin/organizer: view a tournament's scorer roster + candidate pool. */
  async getTournamentScorers(admin: UserSession, tournamentId: string): Promise<TournamentScorerRoster> {
    if (admin.role !== 'admin' && admin.role !== 'organizer') {
      throw new ApiError(403, `Access denied. Role "${admin.role}" cannot manage scorer assignments.`);
    }

    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new ApiError(404, 'Tournament not found');

    const scorerIds = Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [];
    const allUsers = await userRepository.findAll();
    const scorerNames = scorerIds.map((id) => allUsers.find((u) => u.id === id)?.name || 'Unknown scorer');
    const candidates = await this.listScorerCandidates(admin);

    return { tournamentId, scorerIds, scorerNames, candidates };
  }

  /** Admin/organizer: assign or replace the tournament scorer roster. */
  async setTournamentScorers(admin: UserSession, tournamentId: string, scorerIds: string[]) {
    if (admin.role !== 'admin' && admin.role !== 'organizer') {
      throw new ApiError(403, `Access denied. Role "${admin.role}" cannot manage scorer assignments.`);
    }

    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new ApiError(404, 'Tournament not found');

    const uniqueIds = Array.from(new Set(scorerIds));
    for (const id of uniqueIds) {
      const user = await userRepository.findById(id);
      if (!user) throw new ApiError(400, `Scorer id "${id}" does not exist.`);
      if (user.role !== 'scorer') {
        throw new ApiError(400, `User "${user.name}" (${id}) does not have the scorer role.`);
      }
    }

    await tournamentRepository.update(tournamentId, { scorerIds: uniqueIds });

    const scorerNames: string[] = [];
    for (const id of uniqueIds) {
      const user = await userRepository.findById(id);
      scorerNames.push(user?.name || id);
    }

    await auditLogRepository.create({
      tournamentId,
      who: admin.name,
      role: admin.role,
      what: 'assign_scorers',
      before: { scorerIds: Array.isArray(tournament.scorerIds) ? tournament.scorerIds : [] },
      after: { scorerIds: uniqueIds },
      details: `Assigned tournament scorers for "${tournament.name}": ${
        scorerNames.length > 0 ? scorerNames.join(', ') : '(none)'
      }`,
    });

    return { tournamentId, scorerIds: uniqueIds, scorerNames };
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
