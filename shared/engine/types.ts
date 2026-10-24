/**
 * Pure framework-free fixture engine types.
 * No database, framework, or UI dependencies.
 */

export interface EngineTeam {
  id: string;
  name: string;
  schoolId: string;
  schoolName: string;
  medium: string;
  isStrong?: boolean;
  isChampion?: boolean;
  championYear?: number;
}

export interface EngineMatch {
  id: string;
  matchNumber: number;
  round: number;
  roundName: string;
  teamA: EngineTeam | null;
  teamB: EngineTeam | null;
  isBye: boolean;
  winner: EngineTeam | null;
  nextMatchId: string | null;
  nextSlot: 'A' | 'B' | null;
  quarter: 1 | 2 | 3 | 4;
  scheduledAt?: string | null;
  venue?: string | null;
  score?: {
    teamAScore?: number | string;
    teamBScore?: number | string;
    details?: string;
  } | null;
  status: 'upcoming' | 'live' | 'completed';
}

export interface FixtureGenerationInput {
  tournamentId: string;
  teams: EngineTeam[];
  strongTeamIds: string[];
  championTeamIds: string[];
  seed?: number;
  sport: string;
  format: string;
}

export interface FixtureGenerationResult {
  tournamentId: string;
  matches: EngineMatch[];
  totalTeams: number;
  powerOfTwo: number;
  totalRounds: number;
  byeCount: number;
  byeTeams: EngineTeam[];
  appliedRules: string[];
  warnings: string[];
  seed: number;
  quarterDistribution: {
    q1Byes: number;
    q2Byes: number;
    q3Byes: number;
    q4Byes: number;
  };
}

export interface SwapValidationResult {
  isValid: boolean;
  breaksHardConstraint: boolean;
  warnings: string[];
}
