import 'server-only';
import mongoose, { Schema } from 'mongoose';

export const SchoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    mediums: { type: [String], default: ['Marathi', 'English'] },
  },
  { timestamps: true }
);

export const TeamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    medium: { type: String, required: true },
    ageGroup: { type: String, required: true },
    gender: { type: String, enum: ['boys', 'girls'], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const TournamentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sport: { type: String, default: 'kho-kho' },
    format: { type: String, default: 'single-elimination' },
    ageGroup: { type: String, required: true },
    gender: { type: String, enum: ['boys', 'girls'], required: true },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft', 'fixtures-generated', 'published', 'ongoing', 'completed'],
      default: 'draft',
    },
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    strongTeams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    championLookbackYears: { type: Number, default: 3, enum: [3, 4] },
    winner: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    isEnrollmentLocked: { type: Boolean, default: false },
    enrollmentLockedAt: { type: Date, default: null },
    createdBy: { type: String, default: 'organizer' },
  },
  { timestamps: true }
);

export const EnrollmentSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    status: { type: String, enum: ['enrolled', 'withdrawn'], default: 'enrolled' },
    enrolledBy: { type: String, default: 'organizer' },
    enrolledAt: { type: Date, default: Date.now },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const MatchSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    matchNumber: { type: Number, required: true },
    teamA: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamB: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    isBye: { type: Boolean, default: false },
    winner: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed'],
      default: 'upcoming',
    },
    nextMatch: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    nextSlot: { type: String, enum: ['A', 'B', null], default: null },
    scheduledAt: { type: Date, default: null },
    venue: { type: String, default: null },
    scorers: [{ type: String }], // UserDoc ids with role="scorer"
    score: {
      teamAScore: { type: Schema.Types.Mixed, default: null },
      teamBScore: { type: Schema.Types.Mixed, default: null },
      details: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// Indexes on Match for fast queries by team, tournament, and schedule
MatchSchema.index({ teamA: 1, tournament: 1 });
MatchSchema.index({ teamB: 1, tournament: 1 });
MatchSchema.index({ tournament: 1, scheduledAt: 1 });

export const FixtureSnapshotSchema = new Schema(
  {
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    randomSeed: { type: Number, required: true },
    strongTeamsUsed: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    recentChampionsDetected: [
      {
        teamId: String,
        teamName: String,
        year: Number,
        tournamentName: String,
      },
    ],
    byeTeams: [
      {
        id: String,
        name: String,
        schoolName: String,
      },
    ],
    appliedRules: [String],
    warnings: [String],
    generatedBy: { type: String, default: 'organizer' },
  },
  { timestamps: true }
);

export const PastTournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    sport: { type: String, required: true },
    ageGroup: { type: String, required: true },
    gender: { type: String, enum: ['boys', 'girls'], required: true },
    year: { type: Number, required: true },
    winnerTeamId: { type: String, default: null },
    winnerTeamName: { type: String, required: true },
    schoolName: { type: String, required: true },
  },
  { timestamps: true }
);

export const AuditLogSchema = new Schema(
  {
    tournamentId: { type: String, required: true },
    who: { type: String, required: true },
    role: { type: String, default: 'organizer' },
    what: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    details: { type: String, required: true },
  },
  { timestamps: true }
);

export const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    role: {
      type: String,
      enum: ['admin', 'organizer', 'scorer', 'viewer', 'participant'],
      default: 'participant',
    },
    school: { type: Schema.Types.ObjectId, ref: 'School', default: null },
    schoolCode: { type: String, trim: true, default: null },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    isTempSeed: { type: Boolean, default: false }, // TEMP-LOGIN: remove later
  },
  { timestamps: true }
);
UserSchema.index({ email: 1 });
UserSchema.index({ schoolCode: 1 });
UserSchema.index({ school: 1 });

export const NotificationSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: [
        'fixture_published',
        'match_scheduled',
        'schedule_changed',
        'venue_changed',
        'result_entered',
        'team_advanced',
        'team_eliminated',
      ],
      required: true,
    },
    match: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    title: { type: String, required: true },
    message: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);
NotificationSchema.index({ school: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export const AcknowledgementSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    acknowledgedBy: { type: String, required: true },
    acknowledgedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
AcknowledgementSchema.index({ match: 1, school: 1 }, { unique: true });

export const MatchScoreSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true, unique: true },
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament', required: true },
    sport: { type: String, default: 'kho-kho' },
    config: {
      turnDurationSec: { type: Number },
      activeSquadCount: { type: Number },
      defendersPerBatch: { type: Number },
      pointsPerOut: { type: Number },
      followOnEnabled: { type: Boolean },
      followOnThreshold: { type: Number },
      extraInningsEnabled: { type: Boolean },
      extraInningsRounds: { type: Number },
      suddenDeathEnabled: { type: Boolean },
      suddenDeathTurnDurationSec: { type: Number },
      turnEndGraceMs: { type: Number },
    },
    teams: [
      {
        id: String,
        name: String,
        schoolName: { type: String, default: null },
      },
    ],
    version: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    winnerTeamIds: [{ type: String }],
  },
  { timestamps: true }
);
MatchScoreSchema.index({ match: 1 }, { unique: true });
MatchScoreSchema.index({ tournament: 1 });

export const MatchScoreEventSchema = new Schema(
  {
    match: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    event: { type: Schema.Types.Mixed, required: true },
    recordedBy: { type: String, required: true },
    recordedByRole: { type: String, required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
MatchScoreEventSchema.index({ match: 1, recordedAt: 1 });
