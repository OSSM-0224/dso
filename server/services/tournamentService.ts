import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { pastTournamentRepository } from '../repositories/pastTournamentRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { TournamentDoc, UserSession } from '../../shared/types.ts';

export class TournamentService {
  async getAll(): Promise<TournamentDoc[]> {
    return tournamentRepository.findAll();
  }

  async getById(id: string): Promise<TournamentDoc | null> {
    return tournamentRepository.findById(id);
  }

  async create(
    data: {
      name: string;
      sport?: string;
      format?: string;
      ageGroup: string;
      gender: 'boys' | 'girls';
      year: number;
      championLookbackYears?: number;
      teams?: string[];
    },
    user: UserSession
  ): Promise<TournamentDoc> {
    const tournament = await tournamentRepository.create({
      ...data,
      createdBy: user.name,
    });

    await auditLogRepository.create({
      tournamentId: tournament.id,
      who: user.name,
      role: user.role,
      what: 'create_tournament',
      before: null,
      after: { id: tournament.id, name: tournament.name, year: tournament.year },
      details: `Created tournament "${tournament.name}" (${tournament.ageGroup} ${tournament.gender}, ${tournament.year})`,
    });

    return tournament;
  }

  async updateTeams(
    tournamentId: string,
    teamIds: string[],
    user: UserSession
  ): Promise<TournamentDoc> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const beforeTeams = tournament.teams;
    // Filter strong teams to only keep teams that are still in the tournament
    const updatedStrong = tournament.strongTeams.filter((id) => teamIds.includes(id));

    const updated = await tournamentRepository.update(tournamentId, {
      teams: teamIds,
      strongTeams: updatedStrong,
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'create_tournament',
      before: { teamsCount: beforeTeams.length },
      after: { teamsCount: teamIds.length },
      details: `Updated enrolled teams list (${teamIds.length} teams enrolled)`,
    });

    return updated!;
  }

  async updateStrongTeams(
    tournamentId: string,
    strongTeamIds: string[],
    user: UserSession
  ): Promise<TournamentDoc> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    // Ensure all strong teams are actually enrolled in the tournament
    const validStrongIds = strongTeamIds.filter((id) => tournament.teams.includes(id));
    const beforeStrong = tournament.strongTeams;

    const updated = await tournamentRepository.update(tournamentId, {
      strongTeams: validStrongIds,
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'update_strong_teams',
      before: { strongTeams: beforeStrong },
      after: { strongTeams: validStrongIds },
      details: `Updated strong teams selection (${validStrongIds.length} strong teams selected)`,
    });

    return updated!;
  }

  /**
   * Rule 1: RECENT CHAMPIONS
   * The system automatically finds winners of the last N completed tournaments
   * (N = championLookbackYears, default 3, configurable to 4) of the same
   * sport + ageGroup + gender from the database.
   */
  async getRecentChampions(tournamentId: string): Promise<
    Array<{
      teamId: string;
      teamName: string;
      schoolName?: string;
      year: number;
      tournamentName: string;
    }>
  > {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const lookback = tournament.championLookbackYears || 3;
    const minYear = tournament.year - lookback;

    const championsMap = new Map<string, {
      teamId: string;
      teamName: string;
      schoolName?: string;
      year: number;
      tournamentName: string;
    }>();

    // 1. Check completed tournaments in database
    const completedTournaments = await tournamentRepository.findCompletedBySportCategory(
      tournament.sport,
      tournament.ageGroup,
      tournament.gender,
      minYear
    );

    for (const t of completedTournaments) {
      if (t.year < tournament.year && t.winner) {
        const team = await teamRepository.findById(t.winner);
        if (team) {
          championsMap.set(`${team.id}-${t.year}`, {
            teamId: team.id,
            teamName: team.name,
            schoolName: team.schoolName,
            year: t.year,
            tournamentName: t.name,
          });
        }
      }
    }

    // 2. Also check past tournament records (e.g. historical records entered for season 1)
    const pastRecords = await pastTournamentRepository.findByFilter(
      tournament.sport,
      tournament.ageGroup,
      tournament.gender,
      minYear
    );

    for (const p of pastRecords) {
      if (p.year < tournament.year) {
        // Try to match with an enrolled or existing team if possible
        let matchedTeamId = p.winnerTeamId || '';
        if (!matchedTeamId) {
          // Check if there is an enrolled team from the same school
          const allTeams = await teamRepository.findAll();
          const match = allTeams.find(
            (t) =>
              t.schoolName?.toLowerCase() === p.schoolName.toLowerCase() ||
              t.name.toLowerCase().includes(p.schoolName.toLowerCase())
          );
          if (match) {
            matchedTeamId = match.id;
          }
        }

        championsMap.set(`past-${p.id}`, {
          teamId: matchedTeamId || `past-team-${p.id}`,
          teamName: p.winnerTeamName,
          schoolName: p.schoolName,
          year: p.year,
          tournamentName: p.name,
        });
      }
    }

    // Sort descending by year
    return Array.from(championsMap.values()).sort((a, b) => b.year - a.year);
  }
}

export const tournamentService = new TournamentService();
