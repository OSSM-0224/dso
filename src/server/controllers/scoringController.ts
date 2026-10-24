import 'server-only';
/**
 * Request-level orchestration for the LIVE SCORER module. Each function
 * assumes its route already resolved the session (`user`) — authorization
 * refinement (per-match scorer assignment) happens inside the service.
 */
import {
  ScoringMatchListItem,
  MatchScorePollDto,
  MatchScoreViewDto,
  UserSession,
} from '../../shared/types.ts';

import { scoringService } from '../services/scoringService.ts';
import { parseBody } from '../validations/helpers.ts';
import { scoreEventSchema, overrideWinnerSchema, setScorersSchema } from '../validations/schemas.ts';

export const scoringController = {
  /** GET /api/scoring/my-matches — console list for admins/organizers/scorers. */
  async myMatches(user: UserSession): Promise<ScoringMatchListItem[]> {
    return scoringService.listScoreableMatches(user);
  },

  /** GET /api/scoring/matches/:id — console detail (match + score session). */
  async getMatch(user: UserSession, matchId: string) {
    return scoringService.getMatchForScoring(user, matchId);
  },

  /** POST /api/scoring/matches/:id — create (or resume) the scoring session. */
  async ensureScore(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    return scoringService.ensureMatchScore(user, matchId);
  },

  /** POST /api/scoring/matches/:id/events — append one engine event. */
  async appendEvent(
    user: UserSession,
    matchId: string,
    body: unknown
  ): Promise<MatchScoreViewDto> {
    const parsed = parseBody(scoreEventSchema, body);
    return scoringService.appendEvent(user, matchId, parsed as Record<string, unknown>);
  },

  /** POST /api/scoring/matches/:id/undo — VOID the last actionable event. */
  async undo(user: UserSession, matchId: string): Promise<MatchScoreViewDto> {
    return scoringService.undoLastEvent(user, matchId);
  },

  /** POST /api/scoring/matches/:id/complete — finalize through recordResult. */
  async complete(user: UserSession, matchId: string) {
    return scoringService.completeMatch(user, matchId);
  },

  /** POST /api/scoring/matches/:id/override-winner — MANUAL_DECISION path. */
  async overrideWinner(
    user: UserSession,
    matchId: string,
    body: unknown
  ) {
    const parsed = parseBody(overrideWinnerSchema, body);
    return scoringService.overrideWinner(user, matchId, parsed);
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
