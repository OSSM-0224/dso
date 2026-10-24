import 'server-only';
/**
 * Public tournament payload builder â€” used by the public Route Handler
 * (/api/public/tournaments/:id) AND the server-rendered public bracket page
 * (/public/tournaments/:id). Strict whitelist DTOs, no strong/seed/champion/
 * snapshot/warning/audit information ever leaves this function.
 */
import { ApiError } from '../apiError.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import {
  sanitizeMatchDto,
  sanitizeTeamDto,
  sanitizeTournamentDto,
} from '../serializers/dtoSerializers.ts';

export interface SanitizedPublicTournamentPayload {
  tournament: ReturnType<typeof sanitizeTournamentDto>;
  teams: ReturnType<typeof sanitizeTeamDto>[];
  matches: ReturnType<typeof sanitizeMatchDto>[];
  isPublic: true;
}

export class PublicTournamentNotPublishedError extends Error {
  constructor() {
    super('Tournament fixtures have not been published yet.');
    this.name = 'PublicTournamentNotPublishedError';
  }
}

export async function getSanitizedPublicTournamentPayload(
  id: string
): Promise<SanitizedPublicTournamentPayload> {
  const tournament = await tournamentRepository.findById(id);
  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }

  // Only allow public viewing if published, ongoing, or completed
  if (tournament.status === 'draft' || tournament.status === 'fixtures-generated') {
    throw new PublicTournamentNotPublishedError();
  }

  const matches = await matchRepository.findByTournamentId(id);
  const teams = await teamRepository.findByIds(tournament.teams);

  // Whitelist sanitize everything: strip strongTeams, seeds, snapshots, engine rules
  return {
    tournament: sanitizeTournamentDto(tournament),
    teams: teams.map(sanitizeTeamDto),
    matches: matches.map(sanitizeMatchDto),
    isPublic: true,
  };
}
