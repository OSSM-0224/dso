import { EngineMatch } from '../types.ts';

/**
 * Rule 5: ODD / NON-POWER-OF-2 TEAM COUNTS & BYE DISTRIBUTION
 * - Spread byes evenly across all 4 quarters (no two quarters differ by more than 1 bye)
 * - A team gets at most one bye and only in Round 1
 * - Bye priority: recent champions, then strong teams, then random
 * - Never create a Round-1 match with an empty slot or two bye slots against each other
 * - Bye teams auto-advance to Round 2
 */
export function validateByeDistribution(
  matches: EngineMatch[],
  byeCount: number
): {
  isValid: boolean;
  warnings: string[];
  quarterByes: Record<number, number>;
} {
  const warnings: string[] = [];
  const quarterByes: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const byeMatches = matches.filter((m) => m.round === 1 && m.isBye);

  for (const m of byeMatches) {
    quarterByes[m.quarter] = (quarterByes[m.quarter] || 0) + 1;
  }

  const counts = [quarterByes[1], quarterByes[2], quarterByes[3], quarterByes[4]];
  const max = Math.max(...counts);
  const min = Math.min(...counts);

  if (max - min > 1) {
    warnings.push(
      `Byes are unevenly distributed across quarters: [Q1: ${counts[0]}, Q2: ${counts[1]}, Q3: ${counts[2]}, Q4: ${counts[3]}]. Max difference is ${max - min} (must be <= 1).`
    );
  }

  if (byeMatches.length !== byeCount) {
    warnings.push(`Expected ${byeCount} byes, but found ${byeMatches.length}.`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    quarterByes,
  };
}

export function validateChampionsReceivedByes(
  matches: EngineMatch[],
  championTeamIds: string[],
  availableByes: number
): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const byeMatches = matches.filter((m) => m.round === 1 && m.isBye);
  const byeTeamIds = new Set(byeMatches.map((m) => m.teamA?.id).filter(Boolean) as string[]);

  const expectedChampionsWithByes = Math.min(championTeamIds.length, availableByes);
  let championsWithByes = 0;

  for (const champId of championTeamIds) {
    if (byeTeamIds.has(champId)) {
      championsWithByes++;
    }
  }

  if (championsWithByes < expectedChampionsWithByes) {
    warnings.push(
      `Only ${championsWithByes} of ${expectedChampionsWithByes} expected champions received a Round 1 bye.`
    );
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}
