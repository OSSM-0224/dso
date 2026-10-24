import { EngineMatch, EngineTeam } from '../types.ts';

/**
 * Normalizes school name for comparison (trims whitespace, lowercases, removes common noise).
 */
export function normalizeSchoolName(name?: string | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/[\s\-_]+/g, ' ');
}

/**
 * Rule 4: SAME SCHOOL RULE
 * Any two teams from the same school (different medium OR same medium,
 * e.g. "Father Agnel Boys" and "FAV Boys 1") must NOT meet in Round 1 or Round 2 (hard constraint)
 * and should be placed in different quarters, ideally different halves.
 * They may meet only in the semi-final or final if unavoidable.
 */
export function isSameSchool(
  teamA: EngineTeam | null | undefined,
  teamB: EngineTeam | null | undefined
): boolean {
  if (!teamA || !teamB) return false;
  if (teamA.id === teamB.id) return false;

  // 1. Same explicit school ID
  if (teamA.schoolId && teamB.schoolId && teamA.schoolId === teamB.schoolId) {
    return true;
  }

  // 2. Same normalized school name
  const nameA = normalizeSchoolName(teamA.schoolName);
  const nameB = normalizeSchoolName(teamB.schoolName);
  if (nameA && nameB && nameA === nameB) {
    return true;
  }

  // 3. Fallback: check if one school name is a prefix of the other (e.g. "Father Agnel" and "Father Agnel School")
  if (nameA && nameB) {
    if (nameA.length >= 5 && nameB.length >= 5) {
      if (nameA.startsWith(nameB) || nameB.startsWith(nameA)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if two teams clash under the same school rule in Round 1.
 */
export function checkRound1SameSchoolConflict(
  teamA: EngineTeam | null | undefined,
  teamB: EngineTeam | null | undefined
): boolean {
  return isSameSchool(teamA, teamB);
}

/**
 * Validates that no teams from the same school face each other in Round 1.
 */
export function validateRound1SchoolSeparation(matches: EngineMatch[]): {
  isValid: boolean;
  conflicts: string[];
} {
  const conflicts: string[] = [];
  const r1Matches = matches.filter((m) => m.round === 1 && !m.isBye);

  for (const match of r1Matches) {
    if (isSameSchool(match.teamA, match.teamB)) {
      conflicts.push(
        `Round 1 Match ${match.matchNumber} pits "${match.teamA?.name}" against "${match.teamB?.name}" from the same school (${match.teamA?.schoolName || match.teamB?.schoolName})`
      );
    }
  }

  return {
    isValid: conflicts.length === 0,
    conflicts,
  };
}

export interface Round2ClashConflict {
  r2MatchNumber: number;
  teamA: EngineTeam;
  teamB: EngineTeam;
  description: string;
}

/**
 * Validates Round 2 with PLAY-IN AWARENESS:
 * For every Round 2 match, considers BOTH possible winners of every play-in (Round 1) match.
 * If either possible winner shares a school with its Round 2 opponent, treats it as a violation.
 */
export function validateRound2SchoolSeparationWithPlayIn(
  r1Matches: EngineMatch[],
  powerOfTwo: number
): {
  isValid: boolean;
  conflicts: Round2ClashConflict[];
  warnings: string[];
} {
  const conflicts: Round2ClashConflict[] = [];
  const warnings: string[] = [];

  // Round 1 positions = powerOfTwo / 2
  const r1Positions = powerOfTwo / 2;
  const r2MatchesCount = r1Positions / 2;

  // Map each Round 1 position (0 to r1Positions - 1) to its possible participants
  const positionPossibleTeams = new Map<number, EngineTeam[]>();

  for (let pos = 0; pos < r1Positions; pos++) {
    // Find matching Round 1 match by index
    const m = r1Matches[pos];
    if (!m) continue;

    if (m.isBye) {
      if (m.teamA) {
        positionPossibleTeams.set(pos, [m.teamA]);
      } else if (m.winner) {
        positionPossibleTeams.set(pos, [m.winner]);
      } else {
        positionPossibleTeams.set(pos, []);
      }
    } else {
      // Play-in match: BOTH possible winners must be considered!
      const possible: EngineTeam[] = [];
      if (m.teamA) possible.push(m.teamA);
      if (m.teamB) possible.push(m.teamB);
      positionPossibleTeams.set(pos, possible);
    }
  }

  // Validate each Round 2 match m (0 to r2MatchesCount - 1)
  for (let m = 0; m < r2MatchesCount; m++) {
    const posA = m * 2;
    const posB = m * 2 + 1;

    const possibleA = positionPossibleTeams.get(posA) || [];
    const possibleB = positionPossibleTeams.get(posB) || [];

    // Cross-check all possible teams from side A against all possible teams from side B
    for (const teamA of possibleA) {
      for (const teamB of possibleB) {
        if (isSameSchool(teamA, teamB)) {
          const r2MatchNum = r1Positions + m + 1;
          const desc = `Round 2 Match ${r2MatchNum} may pit "${teamA.name}" against "${teamB.name}" from the same school (${teamA.schoolName || teamB.schoolName})`;
          conflicts.push({
            r2MatchNumber: r2MatchNum,
            teamA,
            teamB,
            description: desc,
          });
          warnings.push(desc);
        }
      }
    }
  }

  return {
    isValid: conflicts.length === 0,
    conflicts,
    warnings,
  };
}

/**
 * Validates both Round 1 and Round 2 school separation rules across all matches.
 */
export function validateAllSchoolSeparation(
  matches: EngineMatch[],
  powerOfTwo: number
): {
  isValid: boolean;
  r1Conflicts: string[];
  r2Conflicts: string[];
  allWarnings: string[];
} {
  const r1Matches = matches
    .filter((m) => m.round === 1)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const r1Val = validateRound1SchoolSeparation(r1Matches);
  const r2Val = validateRound2SchoolSeparationWithPlayIn(r1Matches, powerOfTwo);

  return {
    isValid: r1Val.isValid && r2Val.isValid,
    r1Conflicts: r1Val.conflicts,
    r2Conflicts: r2Val.warnings,
    allWarnings: [...r1Val.conflicts, ...r2Val.warnings],
  };
}
