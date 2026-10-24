import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { MatchDoc, UserSession } from '../../shared/types.ts';
import { notificationService } from './notificationService.ts';

export class MatchService {
  async getTournamentMatches(tournamentId: string): Promise<MatchDoc[]> {
    return matchRepository.findByTournamentId(tournamentId);
  }

  async updateSchedule(
    matchId: string,
    data: { scheduledAt?: string | null; venue?: string | null },
    user: UserSession
  ): Promise<MatchDoc> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new Error('Match not found');

    const before = { scheduledAt: match.scheduledAt, venue: match.venue };
    const updated = await matchRepository.update(matchId, {
      scheduledAt: data.scheduledAt !== undefined ? data.scheduledAt : match.scheduledAt,
      venue: data.venue !== undefined ? data.venue : match.venue,
    });

    await auditLogRepository.create({
      tournamentId: match.tournamentId,
      who: user.name,
      role: user.role,
      what: 'schedule_update',
      before,
      after: { scheduledAt: updated?.scheduledAt, venue: updated?.venue },
      details: `Updated schedule for Match ${match.matchNumber} (${match.roundName}): Date=${data.scheduledAt || 'TBD'}, Venue=${data.venue || 'TBD'}`,
    });

    // Notify schools of schedule/venue update
    if (updated) {
      const tourney = await tournamentRepository.findById(match.tournamentId);
      await notificationService.notifyScheduleUpdated(
        updated,
        before,
        tourney?.name || 'Tournament'
      );
    }

    return updated!;
  }

  async recordResult(
    matchId: string,
    data: {
      winnerTeamId: string;
      score?: {
        teamAScore?: number | string;
        teamBScore?: number | string;
        details?: string;
      };
    },
    user: UserSession
  ): Promise<{
    match: MatchDoc;
    nextMatch: MatchDoc | null;
    tournamentCompleted: boolean;
  }> {
    const match = await matchRepository.findById(matchId);
    if (!match) throw new Error('Match not found');

    const winnerTeam = await teamRepository.findById(data.winnerTeamId);
    if (!winnerTeam) throw new Error('Winner team not found');

    if (match.teamA?.id !== data.winnerTeamId && match.teamB?.id !== data.winnerTeamId) {
      throw new Error('Winner must be one of the competing teams in this match.');
    }

    const beforeWinner = match.winner?.name || 'Undecided';

    // 1. Update this match
    const updatedMatch = await matchRepository.update(matchId, {
      winner: winnerTeam,
      status: 'completed',
      score: data.score || null,
    });

    let nextMatchDoc: MatchDoc | null = null;
    let tournamentCompleted = false;

    // 2. Auto-advance winner to nextMatch if one exists
    if (match.nextMatchId && match.nextSlot) {
      const nextMatch = await matchRepository.findById(match.nextMatchId);
      if (nextMatch) {
        const updateData: Partial<MatchDoc> = {};
        if (match.nextSlot === 'A') {
          updateData.teamA = winnerTeam;
        } else {
          updateData.teamB = winnerTeam;
        }

        // If the other slot is already decided or bye, keep it, otherwise null
        nextMatchDoc = await matchRepository.update(match.nextMatchId, updateData);
      }
    } else {
      // 3. Match has no nextMatchId.
      const tournament = await tournamentRepository.findById(match.tournamentId);
      if (tournament) {
        if (tournament.format === 'round-robin') {
          // In round robin, tournament completes when all non-bye matches are completed
          const allMatches = await matchRepository.findByTournamentId(match.tournamentId);
          const pending = allMatches.filter(
            (m) => m.id !== matchId && !m.isBye && m.status !== 'completed'
          );
          if (pending.length === 0) {
            // Find team with most match wins
            const winCounts = new Map<string, { team: typeof winnerTeam; count: number }>();
            for (const m of allMatches) {
              const w = m.id === matchId ? winnerTeam : m.winner;
              if (w) {
                const cur = winCounts.get(w.id) || { team: w, count: 0 };
                cur.count++;
                winCounts.set(w.id, cur);
              }
            }
            const top = Array.from(winCounts.values()).sort((a, b) => b.count - a.count)[0];
            const champ = top ? top.team : winnerTeam;
            await tournamentRepository.update(tournament.id, {
              status: 'completed',
              winner: champ.id,
              winnerName: `${champ.name} (${champ.schoolName || ''})`,
            });
            tournamentCompleted = true;
          }
        } else {
          // Single Elimination Final match completed
          await tournamentRepository.update(tournament.id, {
            status: 'completed',
            winner: winnerTeam.id,
            winnerName: `${winnerTeam.name} (${winnerTeam.schoolName || ''})`,
          });
          tournamentCompleted = true;
        }
      }
    }

    // 4. Audit Log
    const scoreStr = data.score
      ? ` [Score: ${data.score.teamAScore ?? '-'} vs ${data.score.teamBScore ?? '-'}${data.score.details ? ` (${data.score.details})` : ''}]`
      : '';

    await auditLogRepository.create({
      tournamentId: match.tournamentId,
      who: user.name,
      role: user.role,
      what: 'result_entry',
      before: { winner: beforeWinner },
      after: {
        winner: winnerTeam.name,
        score: data.score,
        tournamentCompleted,
      },
      details: `Recorded result for Match ${match.matchNumber} (${match.roundName}): Winner "${winnerTeam.name}"${scoreStr}${tournamentCompleted ? ' — TOURNAMENT COMPLETED! Winner crowned champion.' : ' — advanced to next round.'}`,
    });

    // Notify schools of result and advancement / elimination
    const loserTeam = match.teamA?.id === winnerTeam.id ? match.teamB : match.teamA;
    const tourney = await tournamentRepository.findById(match.tournamentId);
    await notificationService.notifyResultEntered(
      updatedMatch!,
      winnerTeam,
      loserTeam,
      tourney?.name || 'Tournament'
    );

    return {
      match: updatedMatch!,
      nextMatch: nextMatchDoc,
      tournamentCompleted,
    };
  }
}

export const matchService = new MatchService();
