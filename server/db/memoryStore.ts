import {
  AcknowledgementDoc,
  AuditLogDoc,
  EnrollmentDoc,
  FixtureSnapshotDoc,
  MatchDoc,
  NotificationDoc,
  PastTournamentDoc,
  SchoolDoc,
  TeamDoc,
  TournamentDoc,
  UserDoc,
} from '../../shared/types.ts';

/**
 * Thread-safe In-Memory Store.
 * Starts with NO seeded/dummy data per requirement.
 */
class MemoryStore {
  schools = new Map<string, SchoolDoc>();
  teams = new Map<string, TeamDoc>();
  tournaments = new Map<string, TournamentDoc>();
  matches = new Map<string, MatchDoc>();
  fixtureSnapshots = new Map<string, FixtureSnapshotDoc>();
  pastTournaments = new Map<string, PastTournamentDoc>();
  enrollments = new Map<string, EnrollmentDoc>();
  auditLogs: AuditLogDoc[] = [];
  users = new Map<string, UserDoc>();
  notifications = new Map<string, NotificationDoc>();
  acknowledgements = new Map<string, AcknowledgementDoc>();

  // Reset helper
  clearAll() {
    this.schools.clear();
    this.teams.clear();
    this.tournaments.clear();
    this.matches.clear();
    this.fixtureSnapshots.clear();
    this.pastTournaments.clear();
    this.enrollments.clear();
    this.auditLogs = [];
    this.users.clear();
    this.notifications.clear();
    this.acknowledgements.clear();
  }
}

export const dbStore = new MemoryStore();
