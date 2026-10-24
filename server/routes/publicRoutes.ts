import { Router, Request, Response, NextFunction } from 'express';
import { matchRepository } from '../repositories/matchRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import {
  sanitizeMatchDto,
  sanitizeTeamDto,
  sanitizeTournamentDto,
} from '../serializers/dtoSerializers.ts';

const router = Router();

// GET /public/tournaments/:id (public bracket, read-only, strict whitelist DTO)
router.get('/tournaments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournament = await tournamentRepository.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found' });
    }

    // Only allow public viewing if published, ongoing, or completed
    if (tournament.status === 'draft' || tournament.status === 'fixtures-generated') {
      return res.status(403).json({
        success: false,
        error: 'Tournament fixtures have not been published yet.',
      });
    }

    const matches = await matchRepository.findByTournamentId(req.params.id);
    const teams = await teamRepository.findByIds(tournament.teams);

    // Whitelist sanitize everything: strip strongTeams, seeds, snapshots, engine rules
    const sanitizedTournament = sanitizeTournamentDto(tournament);
    const sanitizedTeams = teams.map(sanitizeTeamDto);
    const sanitizedMatches = matches.map(sanitizeMatchDto);

    res.json({
      success: true,
      data: {
        tournament: sanitizedTournament,
        teams: sanitizedTeams,
        matches: sanitizedMatches,
        isPublic: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
