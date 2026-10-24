import { EngineMatch } from '../types.ts';

/**
 * Rule 3: STRONG TEAMS QUARTER SEPARATION
 * Strong teams must NOT meet each other in early rounds.
 * They must fall in different quarters of the bracket.
 * With 3 strong teams, they must land in 3 different quarters.
 */
export function validateStrongTeamsQuarterSeparation(
  matches: EngineMatch[],
  strongTeamIds: string[]
): {
  isValid: boolean;
  warnings: string[];
  quarterCounts: Record<number, number>;
} {
  const warnings: string[] = [];
  const quarterCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const teamQuarterMap = new Map<string, number>();

  // Determine which quarter each team starts in
  // All Round 1 matches and Byes have a quarter (1, 2, 3, or 4)
  const startingMatches = matches.filter((m) => m.round === 1);

  for (const match of startingMatches) {
    if (match.teamA && strongTeamIds.includes(match.teamA.id)) {
      quarterCounts[match.quarter] = (quarterCounts[match.quarter] || 0) + 1;
      teamQuarterMap.set(match.teamA.id, match.quarter);
    }
    if (match.teamB && strongTeamIds.includes(match.teamB.id)) {
      quarterCounts[match.quarter] = (quarterCounts[match.quarter] || 0) + 1;
      teamQuarterMap.set(match.teamB.id, match.quarter);
    }
  }

  const strongCount = strongTeamIds.length;
  if (strongCount <= 4) {
    // Each strong team must be in a distinct quarter!
    for (let q = 1; q <= 4; q++) {
      if (quarterCounts[q] > 1) {
        warnings.push(`Quarter ${q} contains ${quarterCounts[q]} strong teams (maximum allowed is 1)`);
      }
    }
  } else {
    // If > 4 strong teams, difference between any two quarters should be <= 1
    const counts = [quarterCounts[1], quarterCounts[2], quarterCounts[3], quarterCounts[4]];
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max - min > 1) {
      warnings.push(`Strong teams are unevenly distributed across quarters: [Q1: ${counts[0]}, Q2: ${counts[1]}, Q3: ${counts[2]}, Q4: ${counts[3]}]`);
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    quarterCounts,
  };
}
