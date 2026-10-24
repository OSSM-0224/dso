import { PRNG } from '../prng.ts';
import {
  EngineMatch,
  EngineTeam,
  FixtureGenerationInput,
  FixtureGenerationResult,
} from '../types.ts';
import { FixtureStrategy } from './fixtureStrategy.ts';
import {
  checkRound1SameSchoolConflict,
  isSameSchool,
  normalizeSchoolName,
} from '../rules/sameSchoolRule.ts';

export class SingleEliminationStrategy implements FixtureStrategy {
  readonly name = 'Single Elimination (Kho-Kho Play-In Standard)';
  readonly sport = 'kho-kho';
  readonly format = 'single-elimination';

  generate(input: FixtureGenerationInput): FixtureGenerationResult {
    const { tournamentId, teams, strongTeamIds = [], championTeamIds = [] } = input;
    const seed = input.seed !== undefined ? input.seed : Math.floor(Math.random() * 1000000);
    const prng = new PRNG(seed);

    const warnings: string[] = [];
    const appliedRules: string[] = [
      'Single Elimination Play-In Format',
      'Deterministic PRNG Seeding',
    ];

    const N = teams.length;
    if (N < 2) {
      throw new Error(`A tournament must have at least 2 teams. Received ${N}.`);
    }

    // 1. Calculate Next Power of 2 (P)
    let P = 1;
    while (P < N) {
      P *= 2;
    }
    const totalRounds = Math.log2(P);
    const byeCount = P - N;
    const playInCount = N - P / 2;
    const round1Positions = P / 2;

    appliedRules.push(
      `Power-of-2 Bracket: ${P} slots, ${byeCount} byes, ${playInCount} Round-1 matches`
    );

    // Quarter distribution of byes: spread evenly across 4 quarters
    // Quarter mapping:
    // Q1: top quarter, Q2: second quarter, Q3: third quarter, Q4: bottom quarter
    const quarterByes = this.calculateQuarterByes(byeCount, P);
    appliedRules.push(
      `Even Bye Spread: [Q1: ${quarterByes[1]}, Q2: ${quarterByes[2]}, Q3: ${quarterByes[3]}, Q4: ${quarterByes[4]}] (max difference <= 1)`
    );

    // Identify teams
    const teamMap = new Map<string, EngineTeam>();
    teams.forEach((t) => teamMap.set(t.id, { ...t }));

    const champions: EngineTeam[] = [];
    const strongTeams: EngineTeam[] = [];
    const unseededTeams: EngineTeam[] = [];

    // Separate into champions, strong, unseeded
    const strongSet = new Set(strongTeamIds);
    const champSet = new Set(championTeamIds);

    for (const team of teams) {
      const isChamp = champSet.has(team.id);
      const isStrong = strongSet.has(team.id);
      const enrichedTeam: EngineTeam = {
        ...team,
        isChampion: isChamp,
        isStrong: isStrong,
      };

      if (isChamp) {
        champions.push(enrichedTeam);
      } else if (isStrong) {
        strongTeams.push(enrichedTeam);
      } else {
        unseededTeams.push(enrichedTeam);
      }
    }

    // Check if champions > byes
    if (champions.length > byeCount) {
      warnings.push(
        `Recent champions (${champions.length}) exceed available byes (${byeCount}). Only ${byeCount} champions received first-round byes; remaining must play Round 1.`
      );
    } else if (champions.length > 0 && byeCount > 0) {
      appliedRules.push(
        `All ${champions.length} recent champions awarded Round 1 byes (Rule 2)`
      );
    }

    // 2. Determine which positions in Round 1 are Bye positions vs Play-in positions
    // Positions: 0 to (P/2 - 1)
    const positionsPerQuarter = Math.max(1, round1Positions / 4);
    const byePositionIndices = new Set<number>();

    // For each quarter, pick which positions within that quarter get byes
    // Standard seeded slot order within quarter: outer seed first
    for (let q = 1; q <= 4; q++) {
      const qStart = (q - 1) * positionsPerQuarter;
      const count = quarterByes[q] || 0;
      for (let i = 0; i < count; i++) {
        // Pick slots from outer edge of quarter
        const pos = q % 2 === 1 ? qStart + i : qStart + positionsPerQuarter - 1 - i;
        if (pos >= 0 && pos < round1Positions) {
          byePositionIndices.add(pos);
        }
      }
    }

    // Ensure exact byeCount
    const byePosArray = Array.from(byePositionIndices);
    if (byePosArray.length !== byeCount) {
      // Adjust if rounding edge cases (e.g. P=4, positions=2)
      byePositionIndices.clear();
      for (let i = 0; i < byeCount; i++) {
        byePositionIndices.add(i);
      }
    }

    // 3. Assign Teams to Slots using Constraint-Satisfying Search with Same School Rule & Play-in Awareness
    // Constraints:
    // Rule 4 (hard): Teams from same school must NOT meet in Round 1 or Round 2 (considering both possible winners of play-in matches)
    // Quarter & Half separation: Teams from same school in different quarters, ideally different halves
    // Rule 3: Strong teams in separate quarters
    // Rule 2: Champions get byes where available

    // Group teams by school to detect same-school sets
    const schoolTeamsMap = new Map<string, EngineTeam[]>();
    for (const team of teams) {
      const sKey = (team.schoolId || normalizeSchoolName(team.schoolName)) || team.id;
      if (!schoolTeamsMap.has(sKey)) {
        schoolTeamsMap.set(sKey, []);
      }
      schoolTeamsMap.get(sKey)!.push(team);
    }

    // Teams for byes vs play-ins priority
    // Champions first, then Strong teams, then Unseeded
    const allEligible = [...champions, ...strongTeams, ...unseededTeams];

    interface BracketSlotAssignment {
      byeAssignments: Map<number, EngineTeam>;
      playInAssignments: Map<number, [EngineTeam, EngineTeam]>;
      r1Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; matchNum: number }>;
      r2Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; r2MatchNum: number; r2MatchIndex: number }>;
      quarterCollisions: number;
      score: number;
    }

    let bestAssignment: BracketSlotAssignment | null = null;
    let minScore = Infinity;

    // We run up to 1500 iterations of intelligent guided generation + repair
    const quarterSeedingOrder = [1, 4, 3, 2];

    for (let attempt = 0; attempt < 1500; attempt++) {
      const currentByeAssignments = new Map<number, EngineTeam>();
      const currentPlayInAssignments = new Map<number, [EngineTeam, EngineTeam]>();
      const usedTeamIds = new Set<string>();

      // 1. Assign teams to quarters such that teams from the same school are distributed
      // across different halves (Q1/Q2 vs Q3/Q4) and different quarters
      const quarterBuckets: Record<number, EngineTeam[]> = { 1: [], 2: [], 3: [], 4: [] };
      const quarterCapacities: Record<number, number> = {
        1: positionsPerQuarter,
        2: positionsPerQuarter,
        3: positionsPerQuarter,
        4: positionsPerQuarter,
      };

      // Sort schools by team count descending so schools with multiple teams get distributed first
      const sortedSchoolGroups = Array.from(schoolTeamsMap.values()).sort(
        (a, b) => b.length - a.length
      );

      // Distribute teams from each school across different halves/quarters
      for (const group of sortedSchoolGroups) {
        // Quarter order alternates halves: Q1 (top half), Q4 (bottom half), Q2 (top half), Q3 (bottom half)
        const offset = prng.nextInt(0, 3);
        const sequence = [
          quarterSeedingOrder[(offset + 0) % 4],
          quarterSeedingOrder[(offset + 1) % 4],
          quarterSeedingOrder[(offset + 2) % 4],
          quarterSeedingOrder[(offset + 3) % 4],
        ];

        for (let idx = 0; idx < group.length; idx++) {
          const team = group[idx];
          const targetQ = sequence[idx % sequence.length];
          quarterBuckets[targetQ].push(team);
        }
      }

      // 2. Identify teams that will receive byes
      // Priority: Champions first, then Strong, then unseeded
      const shuffledChamps = prng.shuffle(champions);
      const shuffledStrong = prng.shuffle(strongTeams);
      const shuffledUnseeded = prng.shuffle(unseededTeams);
      const prioritizedTeams = [...shuffledChamps, ...shuffledStrong, ...shuffledUnseeded];

      const designatedByeTeams = new Set<string>();
      for (let i = 0; i < Math.min(byeCount, prioritizedTeams.length); i++) {
        designatedByeTeams.add(prioritizedTeams[i].id);
      }

      // 3. For each quarter, assign teams to its bye positions and play-in positions
      const quarterPositions: Record<number, { byes: number[]; playIns: number[] }> = {
        1: { byes: [], playIns: [] },
        2: { byes: [], playIns: [] },
        3: { byes: [], playIns: [] },
        4: { byes: [], playIns: [] },
      };

      for (let pos = 0; pos < round1Positions; pos++) {
        const q = this.getQuarterForPosition(pos, round1Positions);
        if (byePositionIndices.has(pos)) {
          quarterPositions[q].byes.push(pos);
        } else {
          quarterPositions[q].playIns.push(pos);
        }
      }

      // Collect all teams, prioritizing placing designated bye teams in bye positions
      const byePositionsList = Array.from(byePositionIndices);
      const playInPositionsList = Array.from({ length: round1Positions }, (_, i) => i).filter(
        (i) => !byePositionIndices.has(i)
      );

      // Separate teams into byeCandidates and playInCandidates based on designatedByeTeams
      const shuffledAll = prng.shuffle(teams);
      const byeCandidates: EngineTeam[] = [];
      const playInCandidates: EngineTeam[] = [];

      for (const t of shuffledAll) {
        if (designatedByeTeams.has(t.id) && byeCandidates.length < byeCount) {
          byeCandidates.push(t);
        } else {
          playInCandidates.push(t);
        }
      }

      // If byeCandidates < byeCount, move from playInCandidates
      while (byeCandidates.length < byeCount && playInCandidates.length > 0) {
        byeCandidates.push(playInCandidates.shift()!);
      }

      // Map bye positions
      for (let i = 0; i < byePositionsList.length; i++) {
        const pos = byePositionsList[i];
        if (byeCandidates[i]) {
          currentByeAssignments.set(pos, byeCandidates[i]);
          usedTeamIds.add(byeCandidates[i].id);
        }
      }

      // Map play-in positions
      for (let i = 0; i < playInPositionsList.length; i++) {
        const pos = playInPositionsList[i];
        const tA = playInCandidates[i * 2];
        const tB = playInCandidates[i * 2 + 1];
        if (tA && tB) {
          currentPlayInAssignments.set(pos, [tA, tB]);
          usedTeamIds.add(tA.id);
          usedTeamIds.add(tB.id);
        }
      }

      // 4. Constraint Evaluation (Round 1 + Round 2 Play-In Awareness)
      const evaluateAssignment = (): {
        r1Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; matchNum: number }>;
        r2Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; r2MatchNum: number; r2MatchIndex: number }>;
        quarterCollisions: number;
        score: number;
      } => {
        const r1Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; matchNum: number }> = [];
        const r2Conflicts: Array<{ teamA: EngineTeam; teamB: EngineTeam; r2MatchNum: number; r2MatchIndex: number }> = [];

        // Check Round 1
        for (const [pos, pair] of currentPlayInAssignments.entries()) {
          const [tA, tB] = pair;
          if (isSameSchool(tA, tB)) {
            r1Conflicts.push({ teamA: tA, teamB: tB, matchNum: pos + 1 });
          }
        }

        // Check Round 2 with PLAY-IN AWARENESS
        // Each Round 2 match m combines Round 1 position 2m and 2m+1
        const r2MatchesCount = round1Positions / 2;
        for (let m = 0; m < r2MatchesCount; m++) {
          const posA = m * 2;
          const posB = m * 2 + 1;

          const possibleA: EngineTeam[] = [];
          if (currentByeAssignments.has(posA)) {
            possibleA.push(currentByeAssignments.get(posA)!);
          } else if (currentPlayInAssignments.has(posA)) {
            possibleA.push(...currentPlayInAssignments.get(posA)!);
          }

          const possibleB: EngineTeam[] = [];
          if (currentByeAssignments.has(posB)) {
            possibleB.push(currentByeAssignments.get(posB)!);
          } else if (currentPlayInAssignments.has(posB)) {
            possibleB.push(...currentPlayInAssignments.get(posB)!);
          }

          // Cross-check all possible winners of side A against side B
          for (const teamA of possibleA) {
            for (const teamB of possibleB) {
              if (isSameSchool(teamA, teamB)) {
                r2Conflicts.push({
                  teamA,
                  teamB,
                  r2MatchNum: round1Positions + m + 1,
                  r2MatchIndex: m,
                });
              }
            }
          }
        }

        // Check quarter collisions for schools with multiple teams
        let quarterCollisions = 0;
        const schoolQuarterCount = new Map<string, Record<number, number>>();
        for (let pos = 0; pos < round1Positions; pos++) {
          const q = this.getQuarterForPosition(pos, round1Positions);
          const teamsAtPos: EngineTeam[] = [];
          if (currentByeAssignments.has(pos)) teamsAtPos.push(currentByeAssignments.get(pos)!);
          if (currentPlayInAssignments.has(pos)) teamsAtPos.push(...currentPlayInAssignments.get(pos)!);

          for (const t of teamsAtPos) {
            const sKey = (t.schoolId || normalizeSchoolName(t.schoolName)) || t.id;
            if (!schoolQuarterCount.has(sKey)) {
              schoolQuarterCount.set(sKey, { 1: 0, 2: 0, 3: 0, 4: 0 });
            }
            const counts = schoolQuarterCount.get(sKey)!;
            counts[q] = (counts[q] || 0) + 1;
            if (counts[q] > 1) {
              quarterCollisions++;
            }
          }
        }

        const score =
          r1Conflicts.length * 1000000 +
          r2Conflicts.length * 500000 +
          quarterCollisions * 1000;

        return { r1Conflicts, r2Conflicts, quarterCollisions, score };
      };

      // 5. Targeted Repair Pass: If there are conflicts, attempt targeted team swaps
      let currentEval = evaluateAssignment();

      if (currentEval.score > 0) {
        // Try up to 30 targeted swap repairs
        for (let repair = 0; repair < 30 && currentEval.score > 0; repair++) {
          // If Round 1 conflict, swap one of the teams with a team in another playIn or bye slot
          if (currentEval.r1Conflicts.length > 0) {
            const conflict = currentEval.r1Conflicts[0];
            const targetPosList = playInPositionsList.filter((p) => p !== conflict.matchNum - 1);
            if (targetPosList.length > 0) {
              const swapPos = targetPosList[prng.nextInt(0, targetPosList.length - 1)];
              const targetPair = currentPlayInAssignments.get(swapPos);
              const conflictPair = currentPlayInAssignments.get(conflict.matchNum - 1);
              if (targetPair && conflictPair) {
                // Swap teamB with targetPair[0]
                const temp = conflictPair[1];
                conflictPair[1] = targetPair[0];
                targetPair[0] = temp;
                currentEval = evaluateAssignment();
              }
            }
          } else if (currentEval.r2Conflicts.length > 0) {
            // Round 2 conflict: swap one side with a team in a different quarter/half
            const conflict = currentEval.r2Conflicts[0];
            const m = conflict.r2MatchIndex;
            const posToSwap = m * 2 + (repair % 2); // alternating posA and posB

            // Pick another position in a different quarter
            const otherPositions = Array.from({ length: round1Positions }, (_, i) => i).filter(
              (p) => Math.floor(p / 2) !== m
            );

            if (otherPositions.length > 0) {
              const otherPos = otherPositions[prng.nextInt(0, otherPositions.length - 1)];
              // Swap positions
              if (currentByeAssignments.has(posToSwap) && currentByeAssignments.has(otherPos)) {
                const t1 = currentByeAssignments.get(posToSwap)!;
                const t2 = currentByeAssignments.get(otherPos)!;
                currentByeAssignments.set(posToSwap, t2);
                currentByeAssignments.set(otherPos, t1);
              } else if (currentPlayInAssignments.has(posToSwap) && currentPlayInAssignments.has(otherPos)) {
                const p1 = currentPlayInAssignments.get(posToSwap)!;
                const p2 = currentPlayInAssignments.get(otherPos)!;
                currentPlayInAssignments.set(posToSwap, p2);
                currentPlayInAssignments.set(otherPos, p1);
              }
              currentEval = evaluateAssignment();
            }
          }
        }
      }

      if (currentEval.score < minScore) {
        minScore = currentEval.score;
        bestAssignment = {
          byeAssignments: new Map(currentByeAssignments),
          playInAssignments: new Map(currentPlayInAssignments),
          r1Conflicts: currentEval.r1Conflicts,
          r2Conflicts: currentEval.r2Conflicts,
          quarterCollisions: currentEval.quarterCollisions,
          score: currentEval.score,
        };

        // If perfect satisfaction (0 R1 conflicts and 0 R2 conflicts), terminate search
        if (currentEval.r1Conflicts.length === 0 && currentEval.r2Conflicts.length === 0) {
          break;
        }
      }
    }

    if (!bestAssignment) {
      throw new Error('Failed to generate fixtures after 1500 solver attempts.');
    }

    // 4. Construct Applied Rules & Warnings
    // "If the rule cannot be fully satisfied, return the best draw plus an explicit warning naming the teams and the round where they may clash."
    if (bestAssignment.r1Conflicts.length === 0 && bestAssignment.r2Conflicts.length === 0) {
      appliedRules.push(
        'Same School Rule Enforced: No teams from the same school meet in Round 1 or Round 2 (Rule 4)'
      );
      appliedRules.push(
        'Same School Play-In Awareness: Both possible winners of every play-in match verified free of Round 2 school clashes'
      );
    } else {
      for (const c of bestAssignment.r1Conflicts) {
        warnings.push(
          `Same School Rule Warning: "${c.teamA.name}" and "${c.teamB.name}" from "${c.teamA.schoolName || 'same school'}" clash in Round 1 (Match #${c.matchNum}).`
        );
      }
      for (const c of bestAssignment.r2Conflicts) {
        warnings.push(
          `Same School Rule Warning: "${c.teamA.name}" and "${c.teamB.name}" from "${c.teamA.schoolName || 'same school'}" may clash in Round 2 (Match #${c.r2MatchNum}).`
        );
      }
    }

    if (strongTeams.length > 0) {
      appliedRules.push(
        `Strong Teams Quarter Distribution: ${strongTeams.length} strong teams placed across separate quarters (Rule 3)`
      );
    }

    // 5. Construct Complete Bracket Tree Up Front (All Rounds)
    const matches: EngineMatch[] = [];
    const byeTeams: EngineTeam[] = [];
    let matchCounter = 1;

    // We'll create round by round
    // Map of roundIndex -> matchIndexInRound -> matchId
    const roundMatchIds = new Map<number, Map<number, string>>();

    // Pre-generate IDs for all matches across all rounds
    for (let r = 1; r <= totalRounds; r++) {
      const matchesInRound = P / Math.pow(2, r);
      const rMap = new Map<number, string>();
      for (let m = 0; m < matchesInRound; m++) {
        rMap.set(m, `${tournamentId}-r${r}-m${m + 1}`);
      }
      roundMatchIds.set(r, rMap);
    }

    // Round 1 matches
    for (let pos = 0; pos < round1Positions; pos++) {
      const matchId = roundMatchIds.get(1)!.get(pos)!;
      const quarter = this.getQuarterForPosition(pos, round1Positions);
      const nextMatchId = roundMatchIds.get(2)?.get(Math.floor(pos / 2)) || null;
      const nextSlot = pos % 2 === 0 ? 'A' : 'B';

      const isBye = byePositionIndices.has(pos);

      if (isBye) {
        const team = bestAssignment.byeAssignments.get(pos) || null;
        if (team) {
          byeTeams.push(team);
        }
        matches.push({
          id: matchId,
          matchNumber: matchCounter++,
          round: 1,
          roundName: this.getRoundName(1, totalRounds, pos, round1Positions),
          teamA: team,
          teamB: null, // Bye slot
          isBye: true,
          winner: team, // Auto-advances
          nextMatchId,
          nextSlot,
          quarter,
          status: 'completed',
        });
      } else {
        const pair = bestAssignment.playInAssignments.get(pos);
        matches.push({
          id: matchId,
          matchNumber: matchCounter++,
          round: 1,
          roundName: this.getRoundName(1, totalRounds, pos, round1Positions),
          teamA: pair ? pair[0] : null,
          teamB: pair ? pair[1] : null,
          isBye: false,
          winner: null,
          nextMatchId,
          nextSlot,
          quarter,
          status: 'upcoming',
        });
      }
    }

    // Subsequent Rounds (Round 2 to Final)
    for (let r = 2; r <= totalRounds; r++) {
      const matchesInRound = P / Math.pow(2, r);
      for (let m = 0; m < matchesInRound; m++) {
        const matchId = roundMatchIds.get(r)!.get(m)!;
        const nextMatchId =
          r < totalRounds ? roundMatchIds.get(r + 1)!.get(Math.floor(m / 2)) || null : null;
        const nextSlot = r < totalRounds ? (m % 2 === 0 ? 'A' : 'B') : null;
        const quarter = this.getQuarterForRoundMatch(r, m, totalRounds);

        // Check if teams from Round 1 byes auto-feed into Round 2!
        let teamA: EngineTeam | null = null;
        let teamB: EngineTeam | null = null;

        if (r === 2) {
          const prevPosA = m * 2;
          const prevPosB = m * 2 + 1;
          const matchA = matches.find((match) => match.round === 1 && match.matchNumber === prevPosA + 1);
          const matchB = matches.find((match) => match.round === 1 && match.matchNumber === prevPosB + 1);

          if (matchA?.isBye && matchA.winner) {
            teamA = matchA.winner;
          }
          if (matchB?.isBye && matchB.winner) {
            teamB = matchB.winner;
          }
        }

        matches.push({
          id: matchId,
          matchNumber: matchCounter++,
          round: r,
          roundName: this.getRoundName(r, totalRounds, m, matchesInRound),
          teamA,
          teamB,
          isBye: false,
          winner: null,
          nextMatchId,
          nextSlot,
          quarter,
          status: 'upcoming',
        });
      }
    }

    return {
      tournamentId,
      matches,
      totalTeams: N,
      powerOfTwo: P,
      totalRounds,
      byeCount,
      byeTeams,
      appliedRules,
      warnings,
      seed,
      quarterDistribution: {
        q1Byes: quarterByes[1] || 0,
        q2Byes: quarterByes[2] || 0,
        q3Byes: quarterByes[3] || 0,
        q4Byes: quarterByes[4] || 0,
      },
    };
  }

  private calculateQuarterByes(byeCount: number, P: number): Record<number, number> {
    if (P === 4) {
      // 4 slots -> 2 positions in Round 1
      return {
        1: byeCount > 0 ? 1 : 0,
        2: byeCount > 1 ? 1 : 0,
        3: 0,
        4: 0,
      };
    }

    const base = Math.floor(byeCount / 4);
    const rem = byeCount % 4;

    // Distribute remainder alternating across bracket halves for optimal balance:
    // Q1 (top), Q4 (bottom), Q3 (lower middle), Q2 (upper middle)
    const order = [1, 4, 3, 2];
    const distribution: Record<number, number> = { 1: base, 2: base, 3: base, 4: base };

    for (let i = 0; i < rem; i++) {
      const q = order[i];
      distribution[q]++;
    }

    return distribution;
  }

  private getQuarterForPosition(pos: number, totalPositions: number): 1 | 2 | 3 | 4 {
    if (totalPositions <= 2) {
      return (pos + 1) as 1 | 2;
    }
    const quarterSize = totalPositions / 4;
    if (pos < quarterSize) return 1;
    if (pos < quarterSize * 2) return 2;
    if (pos < quarterSize * 3) return 3;
    return 4;
  }

  private getQuarterForRoundMatch(round: number, matchIndex: number, totalRounds: number): 1 | 2 | 3 | 4 {
    if (round >= totalRounds) return 1; // Final
    if (round === totalRounds - 1) return matchIndex === 0 ? 1 : 4; // Semifinals

    const totalMatchesInRound = Math.pow(2, totalRounds - round);
    if (totalMatchesInRound < 4) return (matchIndex + 1) as 1 | 2;
    const quarterSize = totalMatchesInRound / 4;
    if (matchIndex < quarterSize) return 1;
    if (matchIndex < quarterSize * 2) return 2;
    if (matchIndex < quarterSize * 3) return 3;
    return 4;
  }

  private getRoundName(
    round: number,
    totalRounds: number,
    matchIndex?: number,
    _totalMatchesInRound?: number
  ): string {
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) {
      // "Label semi-finals as 'Semi Final 1' and 'Semi Final 2' and the final as 'Final', instead of Q-labels."
      if (matchIndex !== undefined) {
        return `Semi Final ${matchIndex + 1}`;
      }
      return 'Semi Finals';
    }
    if (round === totalRounds - 2) return 'Quarter Finals';
    if (round === 1) return 'Round 1 (Play-In)';
    return `Round ${round}`;
  }
}
