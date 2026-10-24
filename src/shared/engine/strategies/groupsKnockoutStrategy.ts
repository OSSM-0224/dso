import { PRNG } from '../prng.ts';
import {
  EngineMatch,
  EngineTeam,
  FixtureGenerationInput,
  FixtureGenerationResult,
} from '../types.ts';
import { FixtureStrategy } from './fixtureStrategy.ts';
import { checkRound1SameSchoolConflict } from '../rules/sameSchoolRule.ts';

export class GroupsKnockoutStrategy implements FixtureStrategy {
  readonly name = 'Groups + Knockout Format';
  readonly sport = '*';
  readonly format = 'groups-knockout';

  generate(input: FixtureGenerationInput): FixtureGenerationResult {
    const { tournamentId, teams, strongTeamIds = [], championTeamIds = [] } = input;
    const seed = input.seed !== undefined ? input.seed : Math.floor(Math.random() * 1000000);
    const prng = new PRNG(seed);

    const warnings: string[] = [];
    const appliedRules: string[] = [
      'Groups + Knockout Hybrid Format',
      'Balanced Group Seeding for Strong Teams',
      'Deterministic PRNG Seeding',
    ];

    const N = teams.length;
    if (N < 4) {
      throw new Error(`Groups + Knockout requires at least 4 teams. Received ${N}.`);
    }

    const strongSet = new Set(strongTeamIds);
    const champSet = new Set(championTeamIds);

    const enrichedTeams: EngineTeam[] = teams.map((t) => ({
      ...t,
      isChampion: champSet.has(t.id),
      isStrong: strongSet.has(t.id),
    }));

    // Distribute into 2 groups: Group A and Group B
    const groupA: EngineTeam[] = [];
    const groupB: EngineTeam[] = [];

    // Separate priority teams
    const priorityTeams = enrichedTeams.filter((t) => t.isChampion || t.isStrong);
    const regularTeams = enrichedTeams.filter((t) => !t.isChampion && !t.isStrong);

    const shuffledPriority = prng.shuffle(priorityTeams);
    const shuffledRegular = prng.shuffle(regularTeams);

    // Alternate priority teams between Group A and Group B
    shuffledPriority.forEach((t, i) => {
      if (i % 2 === 0) groupA.push(t);
      else groupB.push(t);
    });

    // Fill remaining teams
    shuffledRegular.forEach((t) => {
      if (groupA.length <= groupB.length) groupA.push(t);
      else groupB.push(t);
    });

    appliedRules.push(
      `Group Stage: Group A (${groupA.length} teams), Group B (${groupB.length} teams)`
    );

    const matches: EngineMatch[] = [];
    let matchCounter = 1;

    // 1. Group Stage matches (Round 1)
    // Group A round-robin matches
    for (let i = 0; i < groupA.length; i++) {
      for (let j = i + 1; j < groupA.length; j++) {
        const teamA = groupA[i];
        const teamB = groupA[j];
        if (checkRound1SameSchoolConflict(teamA, teamB)) {
          warnings.push(`Group A match: Same school matchup between ${teamA.name} and ${teamB.name}`);
        }
        matches.push({
          id: `${tournamentId}-ga-m${matchCounter}`,
          matchNumber: matchCounter++,
          round: 1,
          roundName: 'Group Stage (Group A)',
          teamA,
          teamB,
          isBye: false,
          winner: null,
          nextMatchId: null,
          nextSlot: null,
          quarter: 1,
          status: 'upcoming',
        });
      }
    }

    // Group B round-robin matches
    for (let i = 0; i < groupB.length; i++) {
      for (let j = i + 1; j < groupB.length; j++) {
        const teamA = groupB[i];
        const teamB = groupB[j];
        if (checkRound1SameSchoolConflict(teamA, teamB)) {
          warnings.push(`Group B match: Same school matchup between ${teamA.name} and ${teamB.name}`);
        }
        matches.push({
          id: `${tournamentId}-gb-m${matchCounter}`,
          matchNumber: matchCounter++,
          round: 1,
          roundName: 'Group Stage (Group B)',
          teamA,
          teamB,
          isBye: false,
          winner: null,
          nextMatchId: null,
          nextSlot: null,
          quarter: 2,
          status: 'upcoming',
        });
      }
    }

    // 2. Knockout Semifinals (Round 2)
    const semi1Id = `${tournamentId}-sf-1`;
    const semi2Id = `${tournamentId}-sf-2`;
    const finalId = `${tournamentId}-final`;

    matches.push({
      id: semi1Id,
      matchNumber: matchCounter++,
      round: 2,
      roundName: 'Semi Final 1 (Winner A vs Runner-up B)',
      teamA: null, // To be decided from Group Stage
      teamB: null,
      isBye: false,
      winner: null,
      nextMatchId: finalId,
      nextSlot: 'A',
      quarter: 1,
      status: 'upcoming',
    });

    matches.push({
      id: semi2Id,
      matchNumber: matchCounter++,
      round: 2,
      roundName: 'Semi Final 2 (Winner B vs Runner-up A)',
      teamA: null,
      teamB: null,
      isBye: false,
      winner: null,
      nextMatchId: finalId,
      nextSlot: 'B',
      quarter: 4,
      status: 'upcoming',
    });

    // 3. Championship Final (Round 3)
    matches.push({
      id: finalId,
      matchNumber: matchCounter++,
      round: 3,
      roundName: 'Championship Final',
      teamA: null,
      teamB: null,
      isBye: false,
      winner: null,
      nextMatchId: null,
      nextSlot: null,
      quarter: 1,
      status: 'upcoming',
    });

    return {
      tournamentId,
      matches,
      totalTeams: N,
      powerOfTwo: 8,
      totalRounds: 3,
      byeCount: 0,
      byeTeams: [],
      appliedRules,
      warnings,
      seed,
      quarterDistribution: {
        q1Byes: 0,
        q2Byes: 0,
        q3Byes: 0,
        q4Byes: 0,
      },
    };
  }
}
