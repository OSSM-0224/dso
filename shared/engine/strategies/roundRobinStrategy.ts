import { PRNG } from '../prng.ts';
import {
  EngineMatch,
  EngineTeam,
  FixtureGenerationInput,
  FixtureGenerationResult,
} from '../types.ts';
import { FixtureStrategy } from './fixtureStrategy.ts';
import { checkRound1SameSchoolConflict } from '../rules/sameSchoolRule.ts';

export class RoundRobinStrategy implements FixtureStrategy {
  readonly name = 'Round Robin (League Format)';
  readonly sport = '*';
  readonly format = 'round-robin';

  generate(input: FixtureGenerationInput): FixtureGenerationResult {
    const { tournamentId, teams, strongTeamIds = [], championTeamIds = [] } = input;
    const seed = input.seed !== undefined ? input.seed : Math.floor(Math.random() * 1000000);
    const prng = new PRNG(seed);

    const warnings: string[] = [];
    const appliedRules: string[] = [
      'Round Robin League Format (Berger Circle Method)',
      'Deterministic PRNG Seeding',
    ];

    const N = teams.length;
    if (N < 2) {
      throw new Error(`A tournament must have at least 2 teams. Received ${N}.`);
    }

    // Separate champions, strong, unseeded
    const strongSet = new Set(strongTeamIds);
    const champSet = new Set(championTeamIds);

    const enrichedTeams: EngineTeam[] = teams.map((t) => ({
      ...t,
      isChampion: champSet.has(t.id),
      isStrong: strongSet.has(t.id),
    }));

    // If N is odd, we need a dummy team for BYE
    const isOdd = N % 2 === 1;
    const totalSlots = isOdd ? N + 1 : N;
    const totalRounds = totalSlots - 1;
    const matchesPerRound = totalSlots / 2;
    const byeCount = isOdd ? 1 : 0;

    appliedRules.push(
      `Round Robin Schedule: ${N} teams, ${totalRounds} rounds, ${matchesPerRound} matches per round`
    );

    // Try up to 500 shuffles to avoid same-school conflict in Round 1
    let bestOrder: (EngineTeam | null)[] = [];
    let minConflicts = 999;
    const byeTeamsList: EngineTeam[] = [];

    for (let attempt = 0; attempt < 500; attempt++) {
      const shuffled = prng.shuffle(enrichedTeams);
      const circle: (EngineTeam | null)[] = [...shuffled];
      if (isOdd) {
        // Place dummy bye at the end
        circle.push(null);
      }

      // Check Round 1 pairings for same-school conflict
      let r1Conflicts = 0;
      for (let i = 0; i < matchesPerRound; i++) {
        const teamA = circle[i];
        const teamB = circle[totalSlots - 1 - i];
        if (teamA && teamB && checkRound1SameSchoolConflict(teamA, teamB)) {
          r1Conflicts++;
        }
      }

      if (r1Conflicts === 0) {
        bestOrder = circle;
        break;
      }
      if (r1Conflicts < minConflicts) {
        minConflicts = r1Conflicts;
        bestOrder = circle;
      }
    }

    if (minConflicts === 0) {
      appliedRules.push('Same School Round 1 Separation Enforced in League Draw (Rule 4)');
    } else if (bestOrder.length > 0 && minConflicts < 999) {
      warnings.push(
        `Round 1 has ${minConflicts} unavoidable same-school matchup due to school concentration.`
      );
    }

    // Generate rounds using standard Circle method
    const matches: EngineMatch[] = [];
    let matchCounter = 1;

    // We keep bestOrder[0] fixed, and rotate bestOrder[1 ... totalSlots - 1]
    const rotating = [...bestOrder];

    for (let r = 1; r <= totalRounds; r++) {
      for (let i = 0; i < matchesPerRound; i++) {
        const teamA = rotating[i];
        const teamB = rotating[totalSlots - 1 - i];

        // If one of them is null, it's a BYE
        const isByeMatch = teamA === null || teamB === null;
        const realTeam = teamA || teamB;

        if (isByeMatch && realTeam) {
          if (!byeTeamsList.some((b) => b.id === realTeam.id)) {
            byeTeamsList.push(realTeam);
          }
        }

        const quarter: 1 | 2 | 3 | 4 = (Math.min(4, Math.ceil((r / totalRounds) * 4)) as any) || 1;

        matches.push({
          id: `${tournamentId}-r${r}-m${i + 1}`,
          matchNumber: matchCounter++,
          round: r,
          roundName: `Round ${r}`,
          teamA: realTeam && isByeMatch ? realTeam : teamA,
          teamB: isByeMatch ? null : teamB,
          isBye: isByeMatch,
          winner: isByeMatch ? realTeam : null,
          nextMatchId: null, // Round robin points table, no single bracket progression
          nextSlot: null,
          quarter,
          status: isByeMatch ? 'completed' : 'upcoming',
        });
      }

      // Rotate array for next round: keep rotating[0] fixed, shift the rest
      const fixed = rotating[0];
      const rest = rotating.slice(1);
      const last = rest.pop()!;
      rest.unshift(last);
      rotating.splice(0, rotating.length, fixed, ...rest);
    }

    return {
      tournamentId,
      matches,
      totalTeams: N,
      powerOfTwo: totalSlots,
      totalRounds,
      byeCount,
      byeTeams: byeTeamsList,
      appliedRules,
      warnings,
      seed,
      quarterDistribution: {
        q1Byes: byeCount,
        q2Byes: 0,
        q3Byes: 0,
        q4Byes: 0,
      },
    };
  }
}
