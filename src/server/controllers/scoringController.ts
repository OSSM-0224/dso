import 'server-only';
/**
 * Request-level orchestration for the LIVE SCORER module. Each function
 * assumes its route already resolved the session (`user`) — authorization
 * refinement (tournament + per-match scorer assignment) happens inside the
 * service. Every scoring operation is TOURNAMENT-SCOPED: the route handlers
 * under /api/scoring/tournaments/:tournamentId/... pass the tournament id
 * through; the deprecated /api/scoring/matches/:id aliases resolve the
 * tournament from the match and delegate.
 */
import {
  ScorerCandidate,
  ScoringMatchListItem,
  ScoringTournamentSummary,
  MatchScorePollDto,
  MatchScoreViewDto,
  OrganizerOverviewGroup,
  TournamentScorerRoster,
  UserSession,
} from '../../shared/types.ts';

import { scoringService } from '../services/scoringService.ts';
import { parseBody } from '../validations/helpers.ts';
import { scoreEventSchema, overrideWinnerSchema, setScorersSchema } from '../validations/schemas.ts';
import { ApiError } from '../apiError.ts';

/** Resolves the tournament a match belongs to (legacy alias helpers). */
async function resolveMatchTournament(matchId: string): Promise<string> {
  const tournamentId = await scoringService.resolveMatchTournamentId(matchId);
  if (!tournamentId) throw new ApiError(404, 'Match not found');
  return tournamentId;
}

export const scoringController = {
  // ------------------------------------------------------------------
  // Tournament-scoped endpoints (current)
  // ------------------------------------------------------------------

  /** GET /api/scoring/tournaments — picker list (assigned only for scorers). */
  async listTournaments(user: UserSession): Promise<ScoringTournamentSummary[]> {
    return scoringService.listScoringTournaments(user);
  },

  /** GET /api/scoring/tournaments/:tournamentId/matches — hub list. */
  async listTournamentMatches(user: UserSession, tournamentId: string) {
    return scoringService.listTournamentMatches(user, tournamentId);
  },

  /** GET /api/scoring/tournaments/:tournamentId/matches/:matchId — console detail. */
  async getMatch(user: UserSession, tournamentId: string, matchId: string) {
    return scoringService.getMatchForScoring(user, tournamentId, matchId);
  },

  /** POST .../matches/:matchId — create (or resume) the scoring session. */
  async ensureScore(user: UserSession, tournamentId: string, matchId: string): Promise<MatchScoreViewDto> {
    return scoringService.ensureMatchScore(user, tournamentId, matchId);
  },

  /** POST .../matches/:matchId/events — append one engine event. */
  async appendEvent(
    user: UserSession,
    tournamentId: string,
    matchId: string,
    body: unknown
  ): Promise<MatchScoreViewDto> {
    const parsed = parseBody(scoreEventSchema, body);
    return scoringService.appendEvent(user, tournamentId, matchId, parsed as Record<string, unknown>);
  },

  /** POST .../matches/:matchId/undo — VOID the last actionable event. */
  async undo(user: UserSession, tournamentId: string, matchId: string): Promise<MatchScoreViewDto> {
    return scoringService.undoLastEvent(user, tournamentId, matchId);
  },

  /** POST .../matches/:matchId/complete — finalize through recordResult. */
  async complete(user: UserSession, tournamentId: string, matchId: string) {
    return scoringService.completeMatch(user, tournamentId, matchId);
  },

  /** POST .../matches/:matchId/override-winner — MANUAL_DECISION path. */
  async overrideWinner(
    user: UserSession,
    tournamentId: string,
    matchId: string,
    body: unknown
  ) {
    const parsed = parseBody(overrideWinnerSchema, body);
    return scoringService.overrideWinner(user, tournamentId, matchId, parsed);
  },

  /** GET /api/scoring/overview — staff-only cross-tournament overview. */
  async organizerOverview(user: UserSession): Promise<OrganizerOverviewGroup[]> {
    return scoringService.getOrganizerOverview(user);
  },

  /** PUT /api/admin/tournaments/:tournamentId/scorers — tournament roster. */
  async setTournamentScorers(
    admin: UserSession,
    tournamentId: string,
    body: unknown
  ): Promise<{ tournamentId: string; scorerIds: string[]; scorerNames: string[] }> {
    const parsed = parseBody(setScorersSchema, body);
    return scoringService.setTournamentScorers(admin, tournamentId, parsed.scorerIds);
  },

  /** GET /api/admin/tournaments/:tournamentId/scorers — roster + candidates. */
  async getTournamentScorers(admin: UserSession, tournamentId: string): Promise<TournamentScorerRoster> {
    return scoringService.getTournamentScorers(admin, tournamentId);
  },

  // ------------------------------------------------------------------
  // Deprecated aliases (kept for the TEMP-LOGIN scaffolding and old links)
  // ------------------------------------------------------------------

  /** @deprecated GET /api/scoring/my-matches — global match list. */
  async myMatches(user: UserSession): Promise<ScoringMatchListItem[]> {
    return scoringService.listScoreableMatches(user);
  },

  /** @deprecated GET /api/scoring/matches/:id — resolves the tournament, then delegates. */
  async legacyGetMatch(user: UserSession, matchId: string) {
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.getMatchForScoring(user, tournamentId, matchId);
  },

  /** @deprecated POST /api/scoring/matches/:id */
  async legacyEnsureScore(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.ensureMatchScore(user, tournamentId, matchId);
  },

  /** @deprecated POST /api/scoring/matches/:id/events */
  async legacyAppendEvent(
    user: UserSession,
    matchId: string,
    body: unknown
  ): Promise<MatchScoreViewDto> {
    const parsed = parseBody(scoreEventSchema, body);
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.appendEvent(user, tournamentId, matchId, parsed as Record<string, unknown>);
  },

  /** @deprecated POST /api/scoring/matches/:id/undo */
  async legacyUndo(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.undoLastEvent(user, tournamentId, matchId);
  },

  /** @deprecated POST /api/scoring/matches/:id/complete */
  async legacyComplete(user: UserSession, matchId: string) {
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.completeMatch(user, tournamentId, matchId);
  },

  /** @deprecated POST /api/scoring/matches/:id/override-winner */
  async legacyOverrideWinner(user: UserSession, matchId: string, body: unknown) {
    const parsed = parseBody(overrideWinnerSchema, body);
    const tournamentId = await resolveMatchTournament(matchId);
    return scoringService.overrideWinner(user, tournamentId, matchId, parsed);
  },

  /** GET /api/admin/scorers — scorer accounts available for assignment. */
  async listScorerCandidates(admin: UserSession): Promise<ScorerCandidate[]> {
    return scoringService.listScorerCandidates(admin);
  },

  /** PUT /api/admin/matches/:id/scorers — assign/remove scorers for a match. */
  async setScorers(
    admin: UserSession,
    matchId: string,
    body: unknown
  ): Promise<{ matchId: string; scorerIds: string[]; scorerNames: string[] }> {
    const parsed = parseBody(setScorersSchema, body);
    return scoringService.setScorers(admin, matchId, parsed.scorerIds);
  },

  /** GET /api/my|school/matches/:id/score — school-scoped polling view. */
  async participantScore(
    schoolId: string,
    matchId: string,
    clientVersion: number | null
  ): Promise<MatchScorePollDto> {
    return scoringService.getScoreForReaders(matchId, clientVersion, { schoolId });
  },

  /** GET /api/public/matches/:id/score — anonymous polling view. */
  async publicScore(matchId: string, clientVersion: number | null): Promise<MatchScorePollDto> {
    return scoringService.getScoreForReaders(matchId, clientVersion);
  },
};
