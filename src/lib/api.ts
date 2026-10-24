import {
  AuditLogDoc,
  EnrollmentDoc,
  FixtureSnapshotDoc,
  MatchDoc,
  PastTournamentDoc,
  SchoolDoc,
  TeamDoc,
  TournamentDoc,
  UserRole,
  UserSession,
} from '@/shared/types.ts';
import { TestSuiteSummary } from '@/shared/types.ts';
import { CsvImportReport, CsvImportRow } from '@/shared/types.ts';

const ROLE_KEY = 'dso_auth_role';

// Sessions are now httpOnly cookies issued by the API routes
// (see src/server/auth/session.ts). The client only mirrors the role so the
// UI state survives a reload.
export function getStoredToken(): string | null {
  return null;
}

export function setStoredSession(token: string, role: UserRole) {
  localStorage.setItem(ROLE_KEY, role);
}

export function getStoredRole(): UserRole {
  return (localStorage.getItem(ROLE_KEY) as UserRole) || 'organizer';
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }

  return json.data as T;
}

export const api = {
  // Auth
  auth: {
    switchRole: (role: UserRole) =>
      request<{ user: UserSession; token: string }>('/auth/session', {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    login: (identifier: string, password: string) =>
      request<{ user: UserSession; token: string; mustChangePassword: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }),
    changePassword: (newPassword: string, currentPassword?: string) =>
      request<{ user: UserSession; token: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, currentPassword }),
      }),
    getMe: () => request<UserSession>('/auth/me'),
  },

  // Tournaments
  tournaments: {
    list: () => request<TournamentDoc[]>('/tournaments'),
    get: (id: string) =>
      request<TournamentDoc & { snapshot?: FixtureSnapshotDoc }>('/tournaments/' + id),
    create: (data: {
      name: string;
      sport?: string;
      format?: string;
      ageGroup: string;
      gender: 'boys' | 'girls';
      year: number;
      championLookbackYears?: number;
      teams?: string[];
    }) =>
      request<TournamentDoc>('/tournaments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTeams: (id: string, teams: string[]) =>
      request<TournamentDoc>(`/tournaments/${id}/teams`, {
        method: 'POST',
        body: JSON.stringify({ teams }),
      }),
    updateStrongTeams: (id: string, strongTeams: string[]) =>
      request<TournamentDoc>(`/tournaments/${id}/strong-teams`, {
        method: 'PUT',
        body: JSON.stringify({ strongTeams }),
      }),
    getRecentChampions: (id: string) =>
      request<
        Array<{
          teamId: string;
          teamName: string;
          schoolName?: string;
          year: number;
          tournamentName: string;
        }>
      >(`/tournaments/${id}/recent-champions`),
    generateFixtures: (id: string, seed?: number) =>
      request<{
        matches: MatchDoc[];
        snapshot: FixtureSnapshotDoc;
        tournamentStatus: string;
      }>(`/tournaments/${id}/fixtures/generate`, {
        method: 'POST',
        body: JSON.stringify({ seed }),
      }),
    swapFixtures: (id: string, teamAId: string, teamBId: string, force: boolean = false) =>
      request<{
        matches: MatchDoc[];
        warnings: string[];
      }>(`/tournaments/${id}/fixtures/swap`, {
        method: 'POST',
        body: JSON.stringify({ teamAId, teamBId, force }),
      }),
    publish: (id: string) =>
      request<TournamentDoc>(`/tournaments/${id}/fixtures/publish`, {
        method: 'POST',
      }),
    getMatches: (id: string) => request<MatchDoc[]>(`/tournaments/${id}/matches`),
    getAuditLog: (id: string) => request<AuditLogDoc[]>(`/tournaments/${id}/audit-log`),
    getEnrollments: (id: string) => request<EnrollmentDoc[]>(`/tournaments/${id}/enrollments`),
    enrollTeams: (id: string, teamIds: string[]) =>
      request<{ enrollments: EnrollmentDoc[]; tournament: TournamentDoc }>(
        `/tournaments/${id}/enrollments`,
        {
          method: 'POST',
          body: JSON.stringify({ teamIds }),
        }
      ),
    withdrawTeam: (id: string, teamId: string) =>
      request<{ enrollments: EnrollmentDoc[]; tournament: TournamentDoc }>(
        `/tournaments/${id}/enrollments/${teamId}`,
        {
          method: 'DELETE',
        }
      ),
    lockEnrollment: (id: string) =>
      request<TournamentDoc>(`/tournaments/${id}/enrollments/lock`, {
        method: 'POST',
      }),
    unlockEnrollment: (id: string) =>
      request<{ tournament: TournamentDoc; warning?: string }>(
        `/tournaments/${id}/enrollments/unlock`,
        {
          method: 'POST',
        }
      ),
  },

  // Matches
  matches: {
    recordResult: (
      matchId: string,
      data: {
        winnerTeamId: string;
        score?: {
          teamAScore?: number | string;
          teamBScore?: number | string;
          details?: string;
        };
      }
    ) =>
      request<{
        match: MatchDoc;
        nextMatch: MatchDoc | null;
        tournamentCompleted: boolean;
      }>(`/matches/${matchId}/result`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    updateSchedule: (
      matchId: string,
      data: { scheduledAt?: string | null; venue?: string | null }
    ) =>
      request<MatchDoc>(`/matches/${matchId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  // Schools
  schools: {
    list: () => request<SchoolDoc[]>('/schools'),
    create: (data: { name: string; mediums: string[] }) =>
      request<SchoolDoc>('/schools', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{ name: string; mediums: string[] }>) =>
      request<SchoolDoc>(`/schools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/schools/${id}`, {
        method: 'DELETE',
      }),
  },

  // Teams
  teams: {
    list: (filter?: { ageGroup?: string; gender?: string; schoolId?: string }) => {
      const params = new URLSearchParams();
      if (filter?.ageGroup) params.append('ageGroup', filter.ageGroup);
      if (filter?.gender) params.append('gender', filter.gender);
      if (filter?.schoolId) params.append('schoolId', filter.schoolId);
      const q = params.toString();
      return request<TeamDoc[]>(`/teams${q ? `?${q}` : ''}`);
    },
    create: (data: {
      name: string;
      schoolId: string;
      medium: string;
      ageGroup: string;
      gender: 'boys' | 'girls';
      isActive?: boolean;
    }) =>
      request<TeamDoc>('/teams', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<TeamDoc>) =>
      request<TeamDoc>(`/teams/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/teams/${id}`, {
        method: 'DELETE',
      }),
    importCsv: (rows: CsvImportRow[], commit: boolean = false) =>
      request<CsvImportReport>('/teams/import', {
        method: 'POST',
        body: JSON.stringify({ rows, commit }),
      }),
  },

  // Past Tournaments (History for Season 1)
  pastTournaments: {
    list: () => request<PastTournamentDoc[]>('/past-tournaments'),
    create: (data: {
      name: string;
      sport: string;
      ageGroup: string;
      gender: 'boys' | 'girls';
      year: number;
      winnerTeamId?: string;
      winnerTeamName: string;
      schoolName: string;
    }) =>
      request<PastTournamentDoc>('/past-tournaments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/past-tournaments/${id}`, {
        method: 'DELETE',
      }),
  },

  // Public
  public: {
    getTournament: (id: string) =>
      request<{
        tournament: TournamentDoc;
        teams: TeamDoc[];
        matches: MatchDoc[];
        snapshot?: FixtureSnapshotDoc;
      }>(`/public/tournaments/${id}`),
  },

  // Tests
  tests: {
    run: () => request<TestSuiteSummary>('/tests/run'),
  },

  // Admin Participant Accounts
  admin: {
    participants: {
      list: () =>
        request<
          Array<{
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
            schoolId: string;
            schoolName: string;
            schoolCode: string | null;
            mustChangePassword: boolean;
            isActive: boolean;
            lastLoginAt: string | null;
            createdAt: string;
            acknowledgementCount: number;
          }>
        >('/admin/participants'),
      create: (data: {
        schoolId: string;
        name: string;
        email?: string;
        phone?: string;
        schoolCode?: string;
        temporaryPassword: string;
      }) =>
        request<{
          id: string;
          name: string;
          email?: string;
          phone?: string;
          schoolId: string;
          schoolName: string;
          schoolCode: string;
          mustChangePassword: boolean;
          isActive: boolean;
          temporaryPassword?: string;
        }>('/admin/participants', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      resetPassword: (id: string, newTemporaryPassword: string) =>
        request<{
          success: boolean;
          message: string;
          data: { id: string; schoolCode: string; newTemporaryPassword: string };
        }>(`/admin/participants/${id}/reset-password`, {
          method: 'PUT',
          body: JSON.stringify({ newTemporaryPassword }),
        }),
      toggleStatus: (id: string, isActive: boolean) =>
        request<{ id: string; isActive: boolean }>(`/admin/participants/${id}/status`, {
          method: 'PUT',
          body: JSON.stringify({ isActive }),
        }),
    },
  },

  // Participant "My Matches" Portal (Server derives schoolId strictly from session)
  my: {
    getDashboard: () =>
      request<{
        school: {
          id: string;
          name: string;
          mediums: string[];
          schoolCode: string | null;
        };
        stats: {
          totalTeams: number;
          matchesPlayed: number;
          matchesWon: number;
          matchesLost: number;
          matchesUpcoming: number;
          unreadNotifications: number;
          activeTournamentsCount: number;
        };
        nextMatch: any | null;
        tournaments: Array<{
          id: string;
          name: string;
          sport: string;
          ageGroup: string;
          gender: string;
          status: string;
        }>;
        teams: Array<{
          id: string;
          name: string;
          medium: string;
          ageGroup: string;
          gender: string;
        }>;
      }>('/my/dashboard'),

    getMatches: (params?: { tournamentId?: string; teamId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.tournamentId) q.append('tournamentId', params.tournamentId);
      if (params?.teamId) q.append('teamId', params.teamId);
      if (params?.status) q.append('status', params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return request<any[]>(`/my/matches${queryStr}`);
    },

    getMatch: (id: string) =>
      request<{
        match: MatchDoc;
        tournament: {
          id: string;
          name: string;
          sport: string;
          ageGroup: string;
          gender: string;
        };
        myTeam: TeamDoc | null;
        opponentDisplay: {
          isDecided: boolean;
          team: TeamDoc | null;
          label: string;
          schoolName: string;
          dependencyText: string;
        };
        byeAdvancementNote: string | null;
        isAcknowledged: boolean;
        acknowledgedAt: string | null;
        acknowledgedBy: string | null;
      }>(`/my/matches/${id}`),

    getBracketPath: (tournamentId: string) =>
      request<{
        tournament: {
          id: string;
          name: string;
          sport: string;
          status: string;
        };
        teamPaths: Array<{
          team: {
            id: string;
            name: string;
            medium: string;
            ageGroup: string;
            gender: string;
          };
          overallStatus: 'active' | 'eliminated' | 'champion' | 'winner';
          rounds: Array<{
            round: number;
            roundName: string;
            matchId: string;
            matchNumber: number;
            opponent: any;
            status: string;
            isWinner: boolean;
            isEliminated: boolean;
            score: any;
            scheduledAt: string | null;
            venue: string | null;
          }>;
        }>;
      }>(`/my/bracket-path?tournamentId=${tournamentId}`),

    getNotifications: () =>
      request<{
        notifications: any[];
        unreadCount: number;
      }>('/my/notifications'),

    markNotificationRead: (id: string) =>
      request<any>(`/my/notifications/${id}/read`, {
        method: 'PUT',
      }),

    markAllNotificationsRead: () =>
      request<{ success: boolean; count: number }>('/my/notifications/read-all', {
        method: 'PUT',
      }),

    acknowledgeMatch: (id: string) =>
      request<{
        success: boolean;
        message: string;
        data: any;
      }>(`/my/matches/${id}/acknowledge`, {
        method: 'POST',
      }),

    getCalendarDownloadUrl: (matchId: string) => {
      return `/api/my/matches/${matchId}/calendar`;
    },
  },
};
