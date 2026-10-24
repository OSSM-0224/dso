import { fixtureEngine } from '../../shared/engine/engineRegistry.ts';
import { EngineMatch, EngineTeam } from '../../shared/engine/types.ts';
import {
  checkRound1SameSchoolConflict,
  validateRound2SchoolSeparationWithPlayIn,
} from '../../shared/engine/rules/sameSchoolRule.ts';
import { validateStrongTeamsQuarterSeparation } from '../../shared/engine/rules/quarterSeparationRule.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { fixtureSnapshotRepository } from '../repositories/fixtureSnapshotRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { FixtureSnapshotDoc, MatchDoc, TournamentDoc, UserSession } from '../../shared/types.ts';
import { tournamentService } from './tournamentService.ts';
import { notificationService } from './notificationService.ts';

export class FixtureService {
  async generateFixtures(
    tournamentId: string,
    options: { seed?: number; user: UserSession }
  ): Promise<{
    matches: MatchDoc[];
    snapshot: FixtureSnapshotDoc;
    tournamentStatus: string;
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    if (!tournament.isEnrollmentLocked) {
      throw new Error(
        'Fixture generation is blocked. You must lock team enrollment before generating fixtures.'
      );
    }

    if (tournament.teams.length < 4) {
      throw new Error(
        `At least 4 teams are required to generate fixtures. Currently enrolled: ${tournament.teams.length}`
      );
    }

    const enrolledTeams = await teamRepository.findByIds(tournament.teams);
    if (enrolledTeams.length !== tournament.teams.length) {
      throw new Error('Some enrolled team IDs could not be found.');
    }

    // Auto-detect recent champions
    const recentChampions = await tournamentService.getRecentChampions(tournamentId);
    const championTeamIds = recentChampions
      .map((c) => c.teamId)
      .filter((id) => tournament.teams.includes(id));

    // Convert to EngineTeam[]
    const engineTeams: EngineTeam[] = enrolledTeams.map((t) => ({
      id: t.id,
      name: t.name,
      schoolId: t.schoolId,
      schoolName: t.schoolName || '',
      medium: t.medium,
      isStrong: tournament.strongTeams.includes(t.id),
      isChampion: championTeamIds.includes(t.id),
    }));

    const seed = options.seed !== undefined ? options.seed : Math.floor(Math.random() * 1000000);

    // Call pure fixture engine
    const engineResult = fixtureEngine.generate({
      tournamentId,
      teams: engineTeams,
      strongTeamIds: tournament.strongTeams,
      championTeamIds,
      seed,
      sport: tournament.sport,
      format: tournament.format,
    });

    // Delete existing matches for this tournament if regenerating
    await matchRepository.deleteByTournamentId(tournamentId);

    // Convert EngineMatch[] to MatchDoc[]
    const matchDocs: MatchDoc[] = engineResult.matches.map((m) => ({
      id: m.id,
      tournamentId,
      round: m.round,
      matchNumber: m.matchNumber,
      roundName: m.roundName,
      teamA: m.teamA ? enrolledTeams.find((t) => t.id === m.teamA!.id) || null : null,
      teamB: m.teamB ? enrolledTeams.find((t) => t.id === m.teamB!.id) || null : null,
      isBye: m.isBye,
      winner: m.winner ? enrolledTeams.find((t) => t.id === m.winner!.id) || null : null,
      status: m.status,
      nextMatchId: m.nextMatchId,
      nextSlot: m.nextSlot,
      scheduledAt: null,
      venue: null,
      quarter: m.quarter,
      score: null,
    }));

    await matchRepository.saveBatch(matchDocs);

    // Save FixtureSnapshot
    const snapshotDoc: FixtureSnapshotDoc = {
      id: `snap-${tournamentId}-${Date.now()}`,
      tournamentId,
      randomSeed: seed,
      strongTeamsUsed: tournament.strongTeams,
      recentChampionsDetected: recentChampions,
      byeTeams: engineResult.byeTeams.map((b) => ({
        id: b.id,
        name: b.name,
        schoolName: b.schoolName,
      })),
      appliedRules: engineResult.appliedRules,
      warnings: engineResult.warnings,
      generatedBy: options.user.name,
      createdAt: new Date().toISOString(),
    };

    await fixtureSnapshotRepository.save(snapshotDoc);

    const isRegenerate = tournament.status !== 'draft';
    await tournamentRepository.update(tournamentId, {
      status: 'fixtures-generated',
    });

    // Audit log
    await auditLogRepository.create({
      tournamentId,
      who: options.user.name,
      role: options.user.role,
      what: isRegenerate ? 'regenerate' : 'generate',
      before: { previousStatus: tournament.status },
      after: {
        newStatus: 'fixtures-generated',
        seed,
        totalMatches: matchDocs.length,
        byes: engineResult.byeCount,
      },
      details: `${isRegenerate ? 'Regenerated' : 'Generated'} fixtures with seed ${seed} (${enrolledTeams.length} teams, ${engineResult.byeCount} byes, ${matchDocs.length} total matches)`,
    });

    return {
      matches: matchDocs,
      snapshot: snapshotDoc,
      tournamentStatus: 'fixtures-generated',
    };
  }

  async validateSwap(
    tournamentId: string,
    teamAId: string,
    teamBId: string
  ): Promise<{
    isValid: boolean;
    breaksHardConstraint: boolean;
    warnings: string[];
  }> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const matches = await matchRepository.findByTournamentId(tournamentId);
    const r1Matches = matches.filter((m) => m.round === 1);

    const warnings: string[] = [];
    let breaksHardConstraint = false;

    // Simulate swap on Round 1 matches
    const simulatedMatches = r1Matches.map((m) => {
      const matchCopy = { ...m };
      if (matchCopy.teamA?.id === teamAId) {
        matchCopy.teamA = r1Matches.find((x) => x.teamA?.id === teamBId)?.teamA ||
          r1Matches.find((x) => x.teamB?.id === teamBId)?.teamB || null;
      } else if (matchCopy.teamA?.id === teamBId) {
        matchCopy.teamA = r1Matches.find((x) => x.teamA?.id === teamAId)?.teamA ||
          r1Matches.find((x) => x.teamB?.id === teamAId)?.teamB || null;
      }

      if (matchCopy.teamB?.id === teamAId) {
        matchCopy.teamB = r1Matches.find((x) => x.teamA?.id === teamBId)?.teamA ||
          r1Matches.find((x) => x.teamB?.id === teamBId)?.teamB || null;
      } else if (matchCopy.teamB?.id === teamBId) {
        matchCopy.teamB = r1Matches.find((x) => x.teamA?.id === teamAId)?.teamA ||
          r1Matches.find((x) => x.teamB?.id === teamAId)?.teamB || null;
      }

      return matchCopy;
    });

    // Check same school conflict in Round 1
    for (const sm of simulatedMatches) {
      if (!sm.isBye && sm.teamA && sm.teamB) {
        if (checkRound1SameSchoolConflict(sm.teamA as any, sm.teamB as any)) {
          breaksHardConstraint = true;
          warnings.push(
            `Rule 4 Violation: Match ${sm.matchNumber} would pit "${sm.teamA.name}" against "${sm.teamB.name}" from the same school (${sm.teamA.schoolName || sm.teamB.schoolName}).`
          );
        }
      }
    }

    // Check same school conflict in Round 2 with PLAY-IN AWARENESS
    let P = 1;
    while (P < tournament.teams.length) P *= 2;
    const r2Val = validateRound2SchoolSeparationWithPlayIn(simulatedMatches as any, P);
    if (!r2Val.isValid) {
      breaksHardConstraint = true;
      for (const w of r2Val.warnings) {
        warnings.push(`Rule 4 Violation: ${w}`);
      }
    }

    // Check quarter separation for strong teams
    const quarterVal = validateStrongTeamsQuarterSeparation(
      simulatedMatches as any,
      tournament.strongTeams
    );
    if (!quarterVal.isValid) {
      warnings.push(`Rule 3 Warning: ${quarterVal.warnings.join('; ')}`);
    }

    return {
      isValid: warnings.length === 0,
      breaksHardConstraint,
      warnings,
    };
  }

  async executeSwap(
    tournamentId: string,
    teamAId: string,
    teamBId: string,
    force: boolean,
    user: UserSession
  ): Promise<{
    matches: MatchDoc[];
    warnings: string[];
  }> {
    const validation = await this.validateSwap(tournamentId, teamAId, teamBId);

    if (validation.warnings.length > 0 && !force) {
      return {
        matches: await matchRepository.findByTournamentId(tournamentId),
        warnings: validation.warnings,
      };
    }

    const matches = await matchRepository.findByTournamentId(tournamentId);
    const teamA = await teamRepository.findById(teamAId);
    const teamB = await teamRepository.findById(teamBId);

    if (!teamA || !teamB) throw new Error('Teams to swap not found');

    // Perform swap in Round 1 matches and re-propagate byes into Round 2
    for (const m of matches) {
      if (m.round === 1) {
        let changed = false;
        if (m.teamA?.id === teamAId) {
          m.teamA = teamB;
          changed = true;
        } else if (m.teamA?.id === teamBId) {
          m.teamA = teamA;
          changed = true;
        }

        if (m.teamB?.id === teamAId) {
          m.teamB = teamB;
          changed = true;
        } else if (m.teamB?.id === teamBId) {
          m.teamB = teamA;
          changed = true;
        }

        if (m.isBye) {
          m.winner = m.teamA;
        }

        if (changed) {
          await matchRepository.update(m.id, m);
        }
      }
    }

    // Update Round 2 slots that were pre-populated by byes
    const r1Matches = matches.filter((m) => m.round === 1);
    for (const m of matches) {
      if (m.round === 2) {
        const mIdx = m.matchNumber - 1 - r1Matches.length;
        const prevPosA = mIdx * 2;
        const prevPosB = mIdx * 2 + 1;
        const r1A = r1Matches[prevPosA];
        const r1B = r1Matches[prevPosB];

        let r2Changed = false;
        if (r1A?.isBye) {
          m.teamA = r1A.winner;
          r2Changed = true;
        }
        if (r1B?.isBye) {
          m.teamB = r1B.winner;
          r2Changed = true;
        }

        if (r2Changed) {
          await matchRepository.update(m.id, m);
        }
      }
    }

    // Audit log
    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'manual_swap',
      before: { swappedOut: teamA.name, swappedWith: teamB.name },
      after: { confirmedWarnings: validation.warnings },
      details: `Swapped "${teamA.name}" and "${teamB.name}" in fixtures${validation.warnings.length > 0 ? ` (with override confirmation: ${validation.warnings.join('; ')})` : ''}`,
    });

    const updatedMatches = await matchRepository.findByTournamentId(tournamentId);

    return {
      matches: updatedMatches,
      warnings: validation.warnings,
    };
  }

  async publish(tournamentId: string, user: UserSession): Promise<TournamentDoc> {
    const tournament = await tournamentRepository.findById(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    if (tournament.status !== 'fixtures-generated') {
      throw new Error(
        `Cannot publish tournament in "${tournament.status}" status. Fixtures must be generated first.`
      );
    }

    const updated = await tournamentRepository.update(tournamentId, {
      status: 'published',
      publishedAt: new Date().toISOString(),
    });

    await auditLogRepository.create({
      tournamentId,
      who: user.name,
      role: user.role,
      what: 'publish',
      before: { status: 'fixtures-generated' },
      after: { status: 'published' },
      details: `Locked and published tournament fixtures. Public bracket view is now active.`,
    });

    // Notify all enrolled schools that fixtures are now published
    await notificationService.notifyFixturePublished(tournamentId);

    return updated!;
  }
}

export const fixtureService = new FixtureService();
