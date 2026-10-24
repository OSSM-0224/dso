export type UserRole = 'admin' | 'organizer' | 'viewer' | 'participant';

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  phone?: string;
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  mustChangePassword?: boolean;
}

export interface UserDoc {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  passwordHash: string;
  salt: string;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  isTempSeed?: boolean; // TEMP-LOGIN: remove later
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'fixture_published'
  | 'match_scheduled'
  | 'schedule_changed'
  | 'venue_changed'
  | 'result_entered'
  | 'team_advanced'
  | 'team_eliminated';

export interface NotificationDoc {
  id: string;
  schoolId: string;
  userId?: string;
  type: NotificationType;
  matchId?: string;
  tournamentId?: string;
  title: string;
  message: string;
  oldValue?: {
    scheduledAt?: string | null;
    venue?: string | null;
  } | null;
  newValue?: {
    scheduledAt?: string | null;
    venue?: string | null;
  } | null;
  isRead: boolean;
  createdAt: string;
}

export interface AcknowledgementDoc {
  id: string;
  matchId: string;
  schoolId: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
}

export type TournamentStatus =
  | 'draft'
  | 'fixtures-generated'
  | 'published'
  | 'ongoing'
  | 'completed';

export type MatchStatus = 'upcoming' | 'live' | 'completed';

export interface SchoolDoc {
  id: string;
  name: string;
  mediums: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamDoc {
  id: string;
  name: string;
  schoolId: string;
  schoolName?: string;
  medium: string;
  ageGroup: string; // e.g. "U-14", "U-17", "U-19"
  gender: 'boys' | 'girls';
  isActive: boolean;
  createdAt: string;
}

export interface TournamentDoc {
  id: string;
  name: string;
  sport: string; // default "kho-kho"
  format: string; // default "single-elimination"
  ageGroup: string;
  gender: 'boys' | 'girls';
  year: number;
  status: TournamentStatus;
  teams: string[]; // Team IDs
  strongTeams: string[]; // Team IDs selected by organizer
  championLookbackYears: number; // default 3 (or 4)
  winner: string | null; // Team ID when completed
  winnerName?: string | null;
  isEnrollmentLocked: boolean;
  enrollmentLockedAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export type EnrollmentStatus = 'enrolled' | 'withdrawn';

export interface EnrollmentDoc {
  id: string;
  tournamentId: string;
  teamId: string;
  team?: TeamDoc;
  status: EnrollmentStatus;
  enrolledBy: string;
  enrolledAt: string;
  withdrawnAt?: string | null;
}

export interface MatchDoc {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  roundName: string;
  teamA: TeamDoc | null;
  teamB: TeamDoc | null;
  isBye: boolean;
  winner: TeamDoc | null;
  status: MatchStatus;
  nextMatchId: string | null;
  nextSlot: 'A' | 'B' | null;
  scheduledAt: string | null;
  venue: string | null;
  quarter: 1 | 2 | 3 | 4;
  score: {
    teamAScore?: number | string;
    teamBScore?: number | string;
    details?: string;
  } | null;
}

export interface FixtureSnapshotDoc {
  id: string;
  tournamentId: string;
  randomSeed: number;
  strongTeamsUsed: string[];
  recentChampionsDetected: Array<{
    teamId: string;
    teamName: string;
    schoolName?: string;
    year: number;
    tournamentName: string;
  }>;
  byeTeams: Array<{
    id: string;
    name: string;
    schoolName?: string;
  }>;
  appliedRules: string[];
  warnings: string[];
  generatedBy: string;
  createdAt: string;
}

export interface PastTournamentDoc {
  id: string;
  name: string;
  sport: string;
  ageGroup: string;
  gender: 'boys' | 'girls';
  year: number;
  winnerTeamId?: string;
  winnerTeamName: string;
  schoolName: string;
  createdAt: string;
}

export interface AuditLogDoc {
  id: string;
  tournamentId: string;
  who: string;
  role: string;
  what:
    | 'generate'
    | 'regenerate'
    | 'manual_swap'
    | 'publish'
    | 'result_entry'
    | 'schedule_update'
    | 'create_tournament'
    | 'update_strong_teams'
    | 'bulk_enroll_teams'
    | 'withdraw_team'
    | 'lock_enrollment'
    | 'unlock_enrollment'
    | 'create_participant'
    | 'reset_password'
    | 'toggle_participant_status'
    | 'change_password';
  before: any;
  after: any;
  details: string;
  timestamp: string;
}

export interface TestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
  durationMs: number;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResult[];
}
