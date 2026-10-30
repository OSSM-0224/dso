import {
  AuditLogDoc,
  EnrollmentDoc,
  FixtureSnapshotDoc,
  MatchDoc,
  MatchScorePollDto,
  MatchScoreViewDto,
  OrganizerOverviewGroup,
  PastTournamentDoc,
  SchoolDoc,
  ScorerCandidate,
  ScoringMatchDetail,
  ScoringMatchListItem,
  ScoringTournamentSummary,
  TeamDoc,
  TournamentDoc,
  TournamentScorerRoster,
  UserRole,
  UserSession,
  PlayerDoc,
} from "@/shared/types.ts";
import { TestSuiteSummary } from "@/shared/types.ts";
import { CsvImportReport, CsvImportRow } from "@/shared/types.ts";

const ROLE_KEY = "dso_auth_role";
const VALID_ROLES: UserRole[] = [
  "admin",
  "organizer",
  "scorer",
  "viewer",
  "participant",
];

// Sessions are now httpOnly cookies issued by the API routes
// (see src/server/auth/session.ts). The client only mirrors the role so the
// UI state survives a reload.
export function setStoredSession(role: UserRole) {
  localStorage.setItem(ROLE_KEY, role);
}

export function getStoredRole(): UserRole {
  if (typeof window === "undefined") return "organizer";
  const stored = localStorage.getItem(ROLE_KEY) as UserRole | null;
  if (stored && VALID_ROLES.includes(stored)) return stored;
  if (stored) {
    // Only call this inside effects (never during render/hydration).
    localStorage.removeItem(ROLE_KEY);
  }
  return "organizer";
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ROLE_KEY);
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    // Attach the HTTP status so transport-level classifiers
    // (ScoreEventQueue bug fix #3) can distinguish 4xx rejections (drop +
    // reconcile) from retryable network/5xx failures (retry with backoff).
    const err = new Error(
      json.error || `Request failed with status ${res.status}`,
    ) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return json.data as T;
}

export const api = {
  // Auth
  auth: {
    switchRole: (role: UserRole) =>
      request<{ user: UserSession; token: string }>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ role }),
      }),
    login: (identifier: string, password: string) =>
      request<{
        user: UserSession;
        token: string;
        mustChangePassword: boolean;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      }),
    changePassword: (newPassword: string, currentPassword?: string) =>
      request<{ user: UserSession; token: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword, currentPassword }),
      }),
    logout: () =>
      request<{ signedOut: boolean }>("/auth/logout", {
        method: "POST",
      }),
    getMe: () => request<UserSession>("/auth/me"),
  },

  // Tournaments
  tournaments: {
    list: () => request<TournamentDoc[]>("/tournaments"),
    get: (id: string) =>
      request<TournamentDoc & { snapshot?: FixtureSnapshotDoc }>(
        "/tournaments/" + id,
      ),
    create: (data: {
      name: string;
      sport?: string;
      format?: string;
      ageGroup: string;
      gender: "boys" | "girls";
      year: number;
      championLookbackYears?: number;
      teams?: string[];
    }) =>
      request<TournamentDoc>("/tournaments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/tournaments/${id}`, {
        method: "DELETE",
      }),
    updateTeams: (id: string, teams: string[]) =>
      request<TournamentDoc>(`/tournaments/${id}/teams`, {
        method: "POST",
        body: JSON.stringify({ teams }),
      }),
    updateStrongTeams: (id: string, strongTeams: string[]) =>
      request<TournamentDoc>(`/tournaments/${id}/strong-teams`, {
        method: "PUT",
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
        method: "POST",
        body: JSON.stringify({ seed }),
      }),
    swapFixtures: (
      id: string,
      teamAId: string,
      teamBId: string,
      force: boolean = false,
    ) =>
      request<{
        matches: MatchDoc[];
        warnings: string[];
      }>(`/tournaments/${id}/fixtures/swap`, {
        method: "POST",
        body: JSON.stringify({ teamAId, teamBId, force }),
      }),
    publish: (id: string) =>
      request<TournamentDoc>(`/tournaments/${id}/fixtures/publish`, {
        method: "POST",
      }),
    getMatches: (id: string) =>
      request<MatchDoc[]>(`/tournaments/${id}/matches`),
    getAuditLog: (id: string) =>
      request<AuditLogDoc[]>(`/tournaments/${id}/audit-log`),
    getEnrollments: (id: string) =>
      request<EnrollmentDoc[]>(`/tournaments/${id}/enrollments`),
    enrollTeams: (id: string, teamIds: string[]) =>
      request<{ enrollments: EnrollmentDoc[]; tournament: TournamentDoc }>(
        `/tournaments/${id}/enrollments`,
        {
          method: "POST",
          body: JSON.stringify({ teamIds }),
        },
      ),
    withdrawTeam: (id: string, teamId: string) =>
      request<{ enrollments: EnrollmentDoc[]; tournament: TournamentDoc }>(
        `/tournaments/${id}/enrollments/${teamId}`,
        {
          method: "DELETE",
        },
      ),
    lockEnrollment: (id: string) =>
      request<TournamentDoc>(`/tournaments/${id}/enrollments/lock`, {
        method: "POST",
      }),
    unlockEnrollment: (id: string) =>
      request<{ tournament: TournamentDoc; warning?: string }>(
        `/tournaments/${id}/enrollments/unlock`,
        {
          method: "POST",
        },
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
      },
    ) =>
      request<{
        match: MatchDoc;
        nextMatch: MatchDoc | null;
        tournamentCompleted: boolean;
      }>(`/matches/${matchId}/result`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    updateSchedule: (
      matchId: string,
      data: { scheduledAt?: string | null; venue?: string | null },
    ) =>
      request<MatchDoc>(`/matches/${matchId}/schedule`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  // Schools
  schools: {
    list: () => request<SchoolDoc[]>("/schools"),
    create: (data: { name: string; mediums: string[] }) =>
      request<SchoolDoc>("/schools", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{ name: string; mediums: string[] }>) =>
      request<SchoolDoc>(`/schools/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/schools/${id}`, {
        method: "DELETE",
      }),
  },

  // Teams
  teams: {
    list: (filter: {
      tournamentId: string;
      ageGroup?: string;
      gender?: string;
      schoolId?: string;
    }) => {
      const params = new URLSearchParams({ tournamentId: filter.tournamentId });
      if (filter.ageGroup) params.append("ageGroup", filter.ageGroup);
      if (filter.gender) params.append("gender", filter.gender);
      if (filter.schoolId) params.append("schoolId", filter.schoolId);
      return request<TeamDoc[]>(`/teams?${params.toString()}`);
    },
    create: (data: {
      tournamentId: string;
      name: string;
      schoolId: string;
      medium: string;
      ageGroup: string;
      gender: "boys" | "girls";
      isActive?: boolean;
    }) =>
      request<TeamDoc>("/teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<TeamDoc>) =>
      request<TeamDoc>(`/teams/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/teams/${id}`, {
        method: "DELETE",
      }),
    importCsv: (
      tournamentId: string,
      rows: CsvImportRow[],
      commit: boolean = false,
    ) =>
      request<CsvImportReport>("/teams/import", {
        method: "POST",
        body: JSON.stringify({ tournamentId, rows, commit }),
      }),
  },

  // Players
  players: {
    list: (filter?: {
      teamId?: string;
      schoolId?: string;
      search?: string;
    }) => {
      const params = new URLSearchParams();

      if (filter?.teamId) params.append("teamId", filter.teamId);
      if (filter?.schoolId) params.append("schoolId", filter.schoolId);
      if (filter?.search) params.append("search", filter.search);

      const query = params.toString();
      return request<PlayerDoc[]>(`/players${query ? `?${query}` : ""}`);
    },

    get: (id: string) => request<PlayerDoc>(`/players/${id}`),

    create: (data: {
      teamId: string;
      name: string;
      jerseyNumber?: number;
      ageGroup?: string;
      gender?: "boys" | "girls";
      dateOfBirth?: string;
      isActive?: boolean;
    }) =>
      request<PlayerDoc>("/players", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: Partial<{
        teamId: string;
        name: string;
        jerseyNumber: number;
        ageGroup: string;
        gender: "boys" | "girls";
        dateOfBirth: string;
        isActive: boolean;
      }>,
    ) =>
      request<PlayerDoc>(`/players/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<{ message: string }>(`/players/${id}`, {
        method: "DELETE",
      }),
  },

  // Past Tournaments (History for Season 1)
  pastTournaments: {
    list: () => request<PastTournamentDoc[]>("/past-tournaments"),
    create: (data: {
      name: string;
      sport: string;
      ageGroup: string;
      gender: "boys" | "girls";
      year: number;
      winnerTeamId?: string;
      winnerTeamName: string;
      schoolName: string;
    }) =>
      request<PastTournamentDoc>("/past-tournaments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/past-tournaments/${id}`, {
        method: "DELETE",
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

    getMatchScore: (matchId: string, version?: number) => {
      const q = version !== undefined ? `?version=${version}` : "";
      return request<MatchScorePollDto>(`/public/matches/${matchId}/score${q}`);
    },
  },

  // Tests
  tests: {
    run: () => request<TestSuiteSummary>("/tests/run"),
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
        >("/admin/participants"),
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
        }>("/admin/participants", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      resetPassword: (id: string, newTemporaryPassword: string) =>
        request<{
          success: boolean;
          message: string;
          data: {
            id: string;
            schoolCode: string;
            newTemporaryPassword: string;
          };
        }>(`/admin/participants/${id}/reset-password`, {
          method: "PUT",
          body: JSON.stringify({ newTemporaryPassword }),
        }),
      toggleStatus: (id: string, isActive: boolean) =>
        request<{ id: string; isActive: boolean }>(
          `/admin/participants/${id}/status`,
          {
            method: "PUT",
            body: JSON.stringify({ isActive }),
          },
        ),
    },

    // LIVE SCORER admin (assignment of scorers to matches)
    scorers: {
      list: () => request<ScorerCandidate[]>("/admin/scorers"),
      // Tournament-level roster ("Scorers" tab in the tournament detail screen).
      getTournamentScorers: (tournamentId: string) =>
        request<TournamentScorerRoster>(
          `/admin/tournaments/${tournamentId}/scorers`,
        ),
      setTournamentScorers: (tournamentId: string, scorerIds: string[]) =>
        request<{
          tournamentId: string;
          scorerIds: string[];
          scorerNames: string[];
        }>(`/admin/tournaments/${tournamentId}/scorers`, {
          method: "PUT",
          body: JSON.stringify({ scorerIds }),
        }),
    },
    matches: {
      setScorers: (matchId: string, scorerIds: string[]) =>
        request<{
          matchId: string;
          scorerIds: string[];
          scorerNames: string[];
        }>(`/admin/matches/${matchId}/scorers`, {
          method: "PUT",
          body: JSON.stringify({ scorerIds }),
        }),
    },
  },

  // LIVE SCORER Console (staff + assigned scorers)
  // Tournament-scoped API (picker / hub / console). Every scoring query is
  // bound to a tournamentId so matches never mix across tournaments.
  scoring: {
    /** GET /api/scoring/tournaments — picker (assigned tournaments only for scorers). */
    scoringTournaments: () =>
      request<ScoringTournamentSummary[]>("/scoring/tournaments"),

    /** GET /api/scoring/tournaments/:tournamentId/matches — hub list. */
    tournamentMatches: (tournamentId: string) =>
      request<{
        tournament: ScoringTournamentSummary;
        matches: ScoringMatchListItem[];
      }>(`/scoring/tournaments/${tournamentId}/matches`),

    /** GET .../matches/:matchId — console detail. */
    getMatch: (tournamentId: string, matchId: string) =>
      request<ScoringMatchDetail>(
        `/scoring/tournaments/${tournamentId}/matches/${matchId}`,
      ),

    /** POST .../matches/:matchId — create (or resume) the scoring session. */
    ensureScore: (tournamentId: string, matchId: string) =>
      request<MatchScoreViewDto>(
        `/scoring/tournaments/${tournamentId}/matches/${matchId}`,
        {
          method: "POST",
        },
      ),

    /** POST .../matches/:matchId/events — append one validated event. */
    appendEvent: (
      tournamentId: string,
      matchId: string,
      event: Record<string, unknown>,
    ) =>
      request<MatchScoreViewDto>(
        `/scoring/tournaments/${tournamentId}/matches/${matchId}/events`,
        {
          method: "POST",
          body: JSON.stringify(event),
        },
      ),

    /** POST .../matches/:matchId/undo — VOID the last actionable event. */
    undo: (tournamentId: string, matchId: string) =>
      request<MatchScoreViewDto>(
        `/scoring/tournaments/${tournamentId}/matches/${matchId}/undo`,
        {
          method: "POST",
        },
      ),

    /** POST .../matches/:matchId/complete — finalize through recordResult. */
    complete: (tournamentId: string, matchId: string) =>
      request<{
        match: MatchDoc;
        nextMatch: MatchDoc | null;
        tournamentCompleted: boolean;
        score: MatchScoreViewDto;
      }>(`/scoring/tournaments/${tournamentId}/matches/${matchId}/complete`, {
        method: "POST",
      }),

    /** POST .../matches/:matchId/override-winner — MANUAL_DECISION path. */
    overrideWinner: (
      tournamentId: string,
      matchId: string,
      data: { winnerTeamId: string; reason: string },
    ) =>
      request<{
        match: MatchDoc;
        nextMatch: MatchDoc | null;
        tournamentCompleted: boolean;
        score: MatchScoreViewDto | null;
      }>(
        `/scoring/tournaments/${tournamentId}/matches/${matchId}/override-winner`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),

    /** STAFF-ONLY organizer overview — matches grouped by tournament. */
    organizerOverview: () =>
      request<OrganizerOverviewGroup[]>("/scoring/overview"),

    /**
     * @deprecated Legacy aliases kept for the TEMP-LOGIN scaffolding and old
     * links. The deprecated server routes resolve the tournament and delegate.
     */
    myMatches: () => request<ScoringMatchListItem[]>("/scoring/my-matches"),
    legacy: {
      getMatch: (id: string) =>
        request<ScoringMatchDetail>(`/scoring/matches/${id}`),
      ensureScore: (id: string) =>
        request<MatchScoreViewDto>(`/scoring/matches/${id}`, {
          method: "POST",
        }),
      appendEvent: (id: string, event: Record<string, unknown>) =>
        request<MatchScoreViewDto>(`/scoring/matches/${id}/events`, {
          method: "POST",
          body: JSON.stringify(event),
        }),
      undo: (id: string) =>
        request<MatchScoreViewDto>(`/scoring/matches/${id}/undo`, {
          method: "POST",
        }),
      complete: (id: string) =>
        request<{
          match: MatchDoc;
          nextMatch: MatchDoc | null;
          tournamentCompleted: boolean;
          score: MatchScoreViewDto;
        }>(`/scoring/matches/${id}/complete`, { method: "POST" }),
      overrideWinner: (
        id: string,
        data: { winnerTeamId: string; reason: string },
      ) =>
        request<{
          match: MatchDoc;
          nextMatch: MatchDoc | null;
          tournamentCompleted: boolean;
          score: MatchScoreViewDto | null;
        }>(`/scoring/matches/${id}/override-winner`, {
          method: "POST",
          body: JSON.stringify(data),
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
      }>("/my/dashboard"),

    getMatches: (params?: {
      tournamentId?: string;
      teamId?: string;
      status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.tournamentId) q.append("tournamentId", params.tournamentId);
      if (params?.teamId) q.append("teamId", params.teamId);
      if (params?.status) q.append("status", params.status);
      const queryStr = q.toString() ? `?${q.toString()}` : "";
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
          overallStatus: "active" | "eliminated" | "champion" | "winner";
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
      }>("/my/notifications"),

    markNotificationRead: (id: string) =>
      request<any>(`/my/notifications/${id}/read`, {
        method: "PUT",
      }),

    markAllNotificationsRead: () =>
      request<{ success: boolean; count: number }>(
        "/my/notifications/read-all",
        {
          method: "PUT",
        },
      ),

    acknowledgeMatch: (id: string) =>
      request<{
        success: boolean;
        message: string;
        data: any;
      }>(`/my/matches/${id}/acknowledge`, {
        method: "POST",
      }),

    getCalendarDownloadUrl: (matchId: string) => {
      return `/api/my/matches/${matchId}/calendar`;
    },

    // Live score polling for the signed-in school (version short-circuit)
    getMatchScore: (matchId: string, version?: number) => {
      const q = version !== undefined ? `?version=${version}` : "";
      return request<MatchScorePollDto>(`/my/matches/${matchId}/score${q}`);
    },
  },
};
