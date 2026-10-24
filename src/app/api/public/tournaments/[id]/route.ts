import { NextResponse } from 'next/server';

import { ApiError } from '@/server/apiError';
import { matchRepository } from '@/server/repositories/matchRepository';
import { teamRepository } from '@/server/repositories/teamRepository';
import { tournamentRepository } from '@/server/repositories/tournamentRepository';
import {
  sanitizeMatchDto,
  sanitizeTeamDto,
  sanitizeTournamentDto,
} from '@/server/serializers/dtoSerializers';
import { handler } from '@/server/validations/helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/public/tournaments/:id (public bracket, read-only, strict whitelist DTO)
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    try {
      const tournament = await tournamentRepository.findById(id);
      if (!tournament) {
        return NextResponse.json({ success: false, error: 'Tournament not found' }, { status: 404 });
      }

      if (tournament.status === 'draft' || tournament.status === 'fixtures-generated') {
        return NextResponse.json(
          {
            success: false,
            error: 'Tournament fixtures have not been published yet.',
          },
          { status: 403 }
        );
      }

      const matches = await matchRepository.findByTournamentId(id);
      const teams = await teamRepository.findByIds(tournament.teams);

      const sanitizedTournament = sanitizeTournamentDto(tournament);
      const sanitizedTeams = teams.map(sanitizeTeamDto);
      const sanitizedMatches = matches.map(sanitizeMatchDto);

      return NextResponse.json({
        success: true,
        data: {
          tournament: sanitizedTournament,
          teams: sanitizedTeams,
          matches: sanitizedMatches,
          isPublic: true,
        },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ success: false, error: err.message }, { status: err.status });
      }
      console.error('[API Error]:', err);
      return NextResponse.json(
        { success: false, error: 'An internal server error occurred' },
        { status: 500 }
      );
    }
  });
}
