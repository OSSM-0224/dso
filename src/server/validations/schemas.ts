import 'server-only';
import { z } from 'zod';

export const createTournamentSchema = z.object({
  name: z.string().min(2, 'Tournament name must have at least 2 characters'),
  sport: z.string().default('kho-kho'),
  format: z.string().default('single-elimination'),
  ageGroup: z.enum(['U-14', 'U-17', 'U-19', 'Open']),
  gender: z.enum(['boys', 'girls']),
  year: z.number().int().min(2000).max(2100),
  championLookbackYears: z.number().int().min(3).max(4).default(3),
  teams: z.array(z.string()).optional().default([]),
});

export const updateTournamentTeamsSchema = z.object({
  teams: z.array(z.string()).min(2, 'A tournament must have at least 2 teams'),
});

export const updateStrongTeamsSchema = z.object({
  strongTeams: z.array(z.string()),
});

export const generateFixturesSchema = z.object({
  seed: z.number().optional(),
});

export const swapFixturesSchema = z.object({
  teamAId: z.string().min(1, 'teamAId is required'),
  teamBId: z.string().min(1, 'teamBId is required'),
  force: z.boolean().optional().default(false),
});

export const createSchoolSchema = z.object({
  name: z.string().min(2, 'School name must have at least 2 characters'),
  mediums: z.array(z.string()).min(1, 'At least one medium is required'),
});

export const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must have at least 2 characters'),
  schoolId: z.string().min(1, 'School ID is required'),
  medium: z.string().min(1, 'Medium is required'),
  ageGroup: z.enum(['U-14', 'U-17', 'U-19', 'Open']),
  gender: z.enum(['boys', 'girls']),
  isActive: z.boolean().optional().default(true),
});

export const createPastTournamentSchema = z.object({
  name: z.string().min(2, 'Tournament name is required'),
  sport: z.string().min(1, 'Sport is required'),
  ageGroup: z.string().min(1, 'Age group is required'),
  gender: z.enum(['boys', 'girls']),
  year: z.number().int().min(2000).max(2100),
  winnerTeamId: z.string().optional(),
  winnerTeamName: z.string().min(1, 'Winner team name is required'),
  schoolName: z.string().min(1, 'School name is required'),
});

export const recordResultSchema = z.object({
  winnerTeamId: z.string().min(1, 'winnerTeamId is required'),
  score: z
    .object({
      teamAScore: z.union([z.number(), z.string()]).optional(),
      teamBScore: z.union([z.number(), z.string()]).optional(),
      details: z.string().optional(),
    })
    .optional(),
});

export const updateScheduleSchema = z.object({
  scheduledAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
});

export const bulkEnrollSchema = z.object({
  teamIds: z.array(z.string()).min(1, 'At least one team ID is required to enroll'),
});

export const bulkImportTeamsSchema = z.object({
  rows: z.array(
    z.object({
      schoolName: z.string().min(1, 'School name is required'),
      teamName: z.string().min(1, 'Team name is required'),
      medium: z.string().min(1, 'Medium is required'),
      ageGroup: z.enum(['U-14', 'U-17', 'U-19', 'Open']),
      gender: z.enum(['boys', 'girls']),
    })
  ),
  commit: z.boolean().optional().default(false),
});

export const createParticipantSchema = z.object({
  schoolId: z.string().min(1, 'School ID is required'),
  name: z.string().min(2, 'Contact / Representative name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  schoolCode: z.string().optional().or(z.literal('')),
  temporaryPassword: z.string().min(6, 'Temporary password must be at least 6 characters long'),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'School Code, Email, or Phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'New password must be at least 6 characters long'),
});

export const resetPasswordSchema = z.object({
  newTemporaryPassword: z.string().min(6, 'Temporary password must be at least 6 characters long'),
});

export const SCORE_EVENT_TYPES = [
  'TOSS',
  'TURN_START',
  'TURN_PAUSE',
  'TURN_RESUME',
  'TURN_END',
  'DISMISSAL',
  'FOUL_LOG',
  'FOLLOW_ON_DECISION',
  'MIN_TIME_RESULT',
  'MANUAL_DECISION',
  'VOID',
] as const;

/** Incoming scoring event. Payload semantics are validated by the scoring
 * engine (`ScoringRuleError` → 409); the schema enforces the envelope.
 * `atMs` is assigned by the server (wall clock) — clients may omit it. */
export const scoreEventSchema = z
  .object({
    eventId: z.string().min(1, 'eventId is required'),
    atMs: z.number().int().min(0).optional().default(0),
    type: z.enum(SCORE_EVENT_TYPES),
  })
  .passthrough();

export const overrideWinnerSchema = z.object({
  winnerTeamId: z.string().min(1, 'winnerTeamId is required'),
  reason: z.string().min(5, 'A reason (at least 5 characters) is required for the override'),
});

export const setScorersSchema = z.object({
  scorerIds: z.array(z.string().min(1)).max(10, 'At most 10 scorers can be assigned per match'),
});
