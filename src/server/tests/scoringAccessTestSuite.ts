import 'server-only';
import { TestResult, TestSuiteSummary } from '../../shared/tests/testSuite.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { matchScoreRepository } from '../repositories/matchScoreRepository.ts';
import { notificationRepository } from '../repositories/notificationRepository.ts';
import { auditLogRepository } from '../repositories/auditLogRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import { scoringService } from '../services/scoringService.ts';
import { scoreEventSchema } from '../validations/schemas.ts';
import { MatchDoc, UserSession } from '../../shared/types.ts';
import { sanitizeMatchScoreDto } from '../serializers/dtoSerializers.ts';

function makeMatch(
  id: string,
  tournamentId: string,
  teamA: any,
  teamB: any,
  scorerIds: string[] = []
): MatchDoc {
  return {
    id,
    tournamentId,
    round: 1,
    matchNumber: 1,
    roundName: 'Round 1',
    teamA,
    teamB,
    isBye: false,
    winner: null,
    status: 'upcoming',
    nextMatchId: null,
    nextSlot: null,
    scheduledAt: new Date().toISOString(),
    venue: 'Scoring Ground',
    quarter: 1,
    scorerIds,
    score: null,
  };
}

async function seedScoreableMatch(
  suffix: string,
  scorerIds: string[] = [],
  sport = 'kho-kho'
) {
  const schoolA = await schoolRepository.create({ name: `Scorer School A (${suffix})` });
  const schoolB = await schoolRepository.create({ name: `Scorer School B (${suffix})` });

  const tournament = await tournamentRepository.create({
    name: `Scoring Access Test Cup ${suffix}`,
    sport,
    ageGroup: 'U-14',
    gender: 'boys',
    year: 2026,
  });
  await tournamentRepository.update(tournament.id, { status: 'published' });

  const teamA = await teamRepository.create({
    tournamentId: tournament.id,
    name: `Scorer Team A (${suffix})`,
    schoolId: schoolA.id,
    medium: 'English',
    ageGroup: 'U-14',
    gender: 'boys',
  });
  const teamB = await teamRepository.create({
    tournamentId: tournament.id,
    name: `Scorer Team B (${suffix})`,
    schoolId: schoolB.id,
    medium: 'Marathi',
    ageGroup: 'U-14',
    gender: 'boys',
  });

  const match = makeMatch(`match-score-${suffix}`, tournament.id, teamA, teamB, scorerIds);
  await matchRepository.saveBatch([match]);

  return { schoolA, schoolB, teamA, teamB, tournament, match };
}

async function cleanupScoreableMatch(seed: Awaited<ReturnType<typeof seedScoreableMatch>>) {
  await matchScoreRepository.deleteByTournamentId(seed.tournament.id);
  await matchRepository.deleteByTournamentId(seed.tournament.id);
  await tournamentRepository.delete(seed.tournament.id);
  await teamRepository.delete(seed.teamA.id);
  await teamRepository.delete(seed.teamB.id);
  await schoolRepository.delete(seed.schoolA.id);
  await schoolRepository.delete(seed.schoolB.id);
}

function tossEvent(teamAId: string, suffix: string) {
  return {
    eventId: `toss-1-${suffix}`,
    atMs: 0,
    type: 'TOSS',
    stage: 'first_innings',
    winnerTeamId: teamAId,
    decision: 'DEFEND',
  } as const;
}

export async function runScoringAccessTestSuite(): Promise<TestSuiteSummary> {
  const results: TestResult[] = [];
  const startAll = Date.now();

  // Test 1: Scorer role authorization (assigned scorer writes, others blocked)
  const t1Start = Date.now();
  try {
    const scorerUser = await userRepository.create({
      name: 'Scorer One',
      role: 'scorer',
      email: `scorer1-${Date.now()}@dso.test`,
      passwordHash: 'x',
      salt: 'x',
      mustChangePassword: false,
      isActive: true,
    });

    const seed = await seedScoreableMatch('auth1', [scorerUser.id]);

    const scorer: UserSession = { id: scorerUser.id, name: scorerUser.name, role: 'scorer' };
    const otherScorer: UserSession = { id: 'scorer-unassigned', name: 'Unassigned Scorer', role: 'scorer' };
    const organizer: UserSession = { id: 'org-1', name: 'Organizer', role: 'organizer' };
    const viewer: UserSession = { id: 'view-1', name: 'Viewer', role: 'viewer' };

    const dto = await scoringService.ensureMatchScore(scorer, seed.tournament.id, seed.match.id);
    const tossed = await scoringService.appendEvent(scorer, seed.tournament.id, seed.match.id,
      tossEvent(seed.teamA.id, 'auth1')
    );

    // Viewer must be refused on the writer path
    let viewerBlocked = false;
    try {
      await scoringService.ensureMatchScore(viewer, seed.tournament.id, seed.match.id);
    } catch (err: any) {
      viewerBlocked = err?.status === 403;
    }

    // Unassigned scorer must be refused
    let unassignedBlocked = false;
    try {
      await scoringService.appendEvent(otherScorer, seed.tournament.id, seed.match.id,
        tossEvent(seed.teamA.id, 'auth1b')
      );
    } catch (err: any) {
      unassignedBlocked = err?.status === 403;
    }

    // Organizer needs no assignment, and see-attribution stays server-side
    const orgDto = await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const attributionLeaked = 'recordedBy' in (tossed.events[0] as Record<string, unknown>);

    const liveStatus = (await matchRepository.findById(seed.match.id))?.status === 'live';
    const passed =
      dto.status === 'active' &&
      tossed.version === 1 &&
      !attributionLeaked &&
      viewerBlocked &&
      unassignedBlocked &&
      orgDto.version === 1 &&
      liveStatus;

    await cleanupScoreableMatch(seed);
    await userRepository.delete(scorerUser.id);

    results.push({
      id: 'TEST_SCORER_ROLE_AUTHORIZATION',
      name: 'Scoring Authorization: assigned scorers write, unassigned scorers and non-staff are refused',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Assigned scorer scored the toss (version 1); viewer 403, unassigned scorer 403, organizer fallback OK; recordedBy stripped.'
        : 'Authorization matrix failure for the scoring endpoints.',
      durationMs: Date.now() - t1Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORER_ROLE_AUTHORIZATION',
      name: 'Scoring Authorization: assigned scorers write, unassigned scorers and non-staff are refused',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t1Start,
    });
  }

  // Test 2: Undo produces a VOID event and bumps the version
  const t2Start = Date.now();
  try {
    const seed = await seedScoreableMatch('undo');
    const organizer: UserSession = { id: 'org-undo', name: 'Organizer', role: 'organizer' };

    await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, tossEvent(seed.teamA.id, 'undo'));
    const undone = await scoringService.undoLastEvent(organizer, seed.tournament.id, seed.match.id);

    const passed =
      undone.version === 2 &&
      undone.scoreboard.voidedEventCount === 1 &&
      undone.events.some((ev: any) => ev.type === 'VOID' && ev.targetEventId === `toss-1-undo`);

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_UNDO_VOID',
      name: 'Scoring Undo: voiding the last event keeps an audit-trail VOID entry and bumps version',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Undo appended VOID(toss-1-undo), scoreboard shows 1 voided event, version 2.'
        : 'Undo did not void the expected target or bump the version.',
      durationMs: Date.now() - t2Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_UNDO_VOID',
      name: 'Scoring Undo: voiding the last event keeps an audit-trail VOID entry and bumps version',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t2Start,
    });
  }

  // Test 3: Override winner completes through matchService.recordResult
  const t3Start = Date.now();
  try {
    const seed = await seedScoreableMatch('override');
    const organizer: UserSession = { id: 'org-override', name: 'Organizer', role: 'organizer' };

    await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const result = await scoringService.overrideWinner(organizer, seed.tournament.id, seed.match.id, {
      winnerTeamId: seed.teamA.id,
      reason: 'Opponent team failed to report to the venue.',
    });

    const refreshed = await matchRepository.findById(seed.match.id);
    const scoreDoc = await matchScoreRepository.findByMatchId(seed.match.id);
    const audit = await auditLogRepository.findByTournamentId(seed.tournament.id);
    const notifsA = await notificationRepository.findBySchoolId(seed.schoolA.id);
    const notifsB = await notificationRepository.findBySchoolId(seed.schoolB.id);

    const passed =
      result.match.winner?.id === seed.teamA.id &&
      refreshed?.status === 'completed' &&
      scoreDoc?.status === 'completed' &&
      scoreDoc?.winnerTeamIds?.[0] === seed.teamA.id &&
      audit.some((a) => a.what === 'result_entry') &&
      audit.some((a) => a.what === 'score_override_winner') &&
      notifsA.some((n) => n.type === 'team_advanced') &&
      notifsB.some((n) => n.type === 'team_eliminated');

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_COMPRESSION_OVERRIDE_WIRING',
      name: 'Scoring Completion: override winner reuses matchService.recordResult (advance, audit, notify)',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Override winner set the match, recorded MANUAL_DECISION, completed the score doc, and fired notifications.'
        : 'Completion pipeline wiring failed (match/audit/notification mismatch).',
      durationMs: Date.now() - t3Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_COMPRESSION_OVERRIDE_WIRING',
      name: 'Scoring Completion: override winner reuses matchService.recordResult (advance, audit, notify)',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t3Start,
    });
  }

  // Test 4: Secrecy — public score DTO whitelist never leaks attribution or secrets
  const t4Start = Date.now();
  try {
    const staffMatch = sanitizeMatchScoreDto(
      {
        id: 'score-leak',
        matchId: 'match-leak',
        tournamentId: 't-leak',
        sport: 'kho-kho',
        config: {
          turnDurationSec: 420,
          activeSquadCount: 9,
          defendersPerBatch: 3,
          pointsPerOut: 1,
          followOnEnabled: true,
          followOnThreshold: 9,
          extraInningsEnabled: true,
          extraInningsRounds: 1,
          suddenDeathEnabled: true,
          suddenDeathTurnDurationSec: 300,
          turnEndGraceMs: 2000,
        },
        teams: [{ id: 't1', name: 'Strong Team', schoolName: 'Champion Academy' }],
        version: 3,
        status: 'active',
        winnerTeamIds: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
      {
        sport: 'kho-kho',
        teams: [
          { id: 't1', name: 'Strong Team', totalPoints: 4 },
          { id: 't2', name: 'Seed Team', totalPoints: 2 },
        ],
        phase: 'turn_live',
        currentTurn: null,
        completedTurns: [],
        nextAction: { action: 'turn_running', remainingMs: 100 },
        followOn: null,
        extraInnings: { enabled: true, roundsAllowed: 1, roundsUsed: 0, tied: false, available: false },
        suddenDeath: { enabled: true, active: false, results: [], pendingTeamIds: [] },
        winner: { resolved: false, winnerTeamId: null, kind: null, label: '', marginPoints: null, scores: {} },
        activeEventCount: 1,
        voidedEventCount: 0,
      } as any,
      [
        {
          id: 'ev-1',
          matchId: 'match-leak',
          event: {
            eventId: 'ev-1',
            atMs: 0,
            type: 'DISMISSAL',
            dismissalType: 'TAG',
            recordedBy: 'Secret Scorer Champion',
          } as any,
          recordedBy: 'Secret Scorer Champion',
          recordedByRole: 'scorer',
          recordedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        } as any,
      ]
    );

    const serialized = JSON.stringify(staffMatch);
    const leakedRecordedBy = serialized.includes('Secret Scorer') || /recordedBy/i.test(serialized);
    const leakingKeys = ['scorerIds', 'auditLog', 'strongTeams', 'randomSeed'].filter(
      (k) => k in (staffMatch as unknown as Record<string, unknown>)
    );
    // Team names coming from team data are allowed; only *field/attribution* leakage is forbidden.
    const passed = !leakedRecordedBy && leakingKeys.length === 0;

    results.push({
      id: 'TEST_SCORING_DTO_SECRECY',
      name: 'Data Secrecy: MatchScore DTOs never include scorer identity or internal keys',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'sanitizeMatchScoreDto strips recordedBy and never copies scorerIds/audit/internal keys.'
        : `Scoring DTO leakage: recordedBy present = ${leakedRecordedBy}, keys = [${leakingKeys.join(', ')}]`,
      durationMs: Date.now() - t4Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_DTO_SECRECY',
      name: 'Data Secrecy: MatchScore DTOs never include scorer identity or internal keys',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t4Start,
    });
  }

  // Test 5: Version short-circuit polling
  const t5Start = Date.now();
  try {
    const seed = await seedScoreableMatch('poll');
    const scorerUser = await userRepository.create({
      name: 'Scorer Poll',
      role: 'scorer',
      email: `scorer-poll-${Date.now()}@dso.test`,
      passwordHash: 'x',
      salt: 'x',
      mustChangePassword: false,
      isActive: true,
    });
    await matchRepository.update(seed.match.id, { scorerIds: [scorerUser.id] });
    const scorer: UserSession = { id: scorerUser.id, name: 'Scorer Poll', role: 'scorer' };

    await scoringService.ensureMatchScore(scorer, seed.tournament.id, seed.match.id);
    const school = seed.schoolA;
    const schoolIdOfParticipant = school.id;

    const dto = await scoringService.appendEvent(scorer, seed.tournament.id, seed.match.id, tossEvent(seed.teamA.id, 'poll'));
    const unchanged = await scoringService.getScoreForReaders(seed.match.id, dto.version, {
      schoolId: schoolIdOfParticipant,
    });

    const passed =
      'changed' in unchanged &&
      unchanged.changed === false &&
      (unchanged as any).version === dto.version;

    await cleanupScoreableMatch(seed);
    await userRepository.delete(scorerUser.id);

    results.push({
      id: 'TEST_SCORING_VERSION_POLLING',
      name: 'Polling: reader APIs short-circuit to {changed:false} when the version is unchanged',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Version short-circuit returned {changed:false, version} for the unchanged score.'
        : 'Version short-circuit failed to suppress unchanged payloads.',
      durationMs: Date.now() - t5Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_VERSION_POLLING',
      name: 'Polling: reader APIs short-circuit to {changed:false} when the version is unchanged',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t5Start,
    });
  }

  // Test 6: Idempotent re-delivery + server-clamped client timestamps
  const t6Start = Date.now();
  try {
    const seed = await seedScoreableMatch('idempotent');
    const organizer: UserSession = { id: 'org-idempotent', name: 'Organizer', role: 'organizer' };

    await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const afterToss = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      ...tossEvent(seed.teamA.id, 'idem'),
      clientAtMs: 0,
    });

    const turnStart = {
      eventId: 'turn-start-idem',
      atMs: 0,
      type: 'TURN_START',
    };
    const afterTurnStart = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id,
      { ...turnStart, clientAtMs: 0 }
    );
    const duplicateTurnStart = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id,
      { ...turnStart, clientAtMs: 0 }
    );

    const dismissal = {
      eventId: 'dismissal-idem',
      atMs: 0,
      type: 'DISMISSAL',
      dismissalType: 'TAG',
    };
    const afterDismissal = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id,
      { ...dismissal, clientAtMs: Number.MAX_SAFE_INTEGER }
    );
    const duplicateDismissal = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id,
      { ...dismissal, clientAtMs: Number.MAX_SAFE_INTEGER }
    );

    const eventCount = (dto: typeof afterDismissal, eventId: string) =>
      dto.events.filter((event) => event.eventId === eventId).length;
    const khoKhoTeams = (dto: typeof afterDismissal) => {
      if (dto.scoreboard.sport !== 'kho-kho') {
        throw new Error(`expected a kho-kho scoreboard, got "${dto.scoreboard.sport}"`);
      }
      return dto.scoreboard.teams;
    };
    const totalAfterOne = khoKhoTeams(afterDismissal).reduce(
      (sum, team) => sum + team.totalPoints,
      0
    );
    const totalAfterDuplicate = khoKhoTeams(duplicateDismissal).reduce(
      (sum, team) => sum + team.totalPoints,
      0
    );
    const lastEvent = afterDismissal.events[afterDismissal.events.length - 1];

    const passed =
      afterToss.version === 1 &&
      afterTurnStart.version === 2 &&
      afterTurnStart.events[1].atMs === afterToss.events[0].atMs &&
      duplicateTurnStart.version === 2 &&
      eventCount(duplicateTurnStart, turnStart.eventId) === 1 &&
      afterDismissal.version === 3 &&
      duplicateDismissal.version === 3 &&
      eventCount(duplicateDismissal, dismissal.eventId) === 1 &&
      totalAfterDuplicate === totalAfterOne &&
      totalAfterOne === 1 &&
      typeof afterDismissal.serverNowMs === 'number' &&
      lastEvent.atMs <= afterDismissal.serverNowMs;

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_IDEMPOTENT_CLOCK',
      name: 'Scoring Idempotency: duplicate events do not double count; client timestamps are clamped to server time',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Duplicate events kept version 3 and one point; out-of-order time clamped to the last event and future time to server-now.'
        : `Idempotency/clock clamp failed (versions ${afterToss.version}/${afterTurnStart.version}/${duplicateTurnStart.version}/${afterDismissal.version}/${duplicateDismissal.version}, totals ${totalAfterOne}/${totalAfterDuplicate}).`,
      durationMs: Date.now() - t6Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_IDEMPOTENT_CLOCK',
      name: 'Scoring Idempotency: duplicate events do not double count; client timestamps are clamped to server time',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t6Start,
    });
  }

  // Test 7: Sepak takraw uses its own engine + default config through the service.
  const t7Start = Date.now();
  try {
    const seed = await seedScoreableMatch('sepak', [], 'sepak-takraw');
    const organizer: UserSession = { id: 'org-sepak', name: 'Organizer', role: 'organizer' };

    const created = await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const config = created.config;
    const sepakConfig = 'setPoints' in config
      ? { setPoints: config.setPoints, bestOf: config.bestOf, serveRotation: config.serveRotation }
      : null;

    // Regression: the API envelope schema must accept every Sepak Takraw
    // event type. It previously hard-coded only Kho-Kho types, so the
    // controller rejected LINEUP_SET/SET_START/POINT/etc. with a 400 before
    // the sport engine could validate them.
    const sepakEventTypes = [
      'TOSS',
      'LINEUP_SET',
      'ROLE_SWAP',
      'SUBSTITUTION',
      'SET_START',
      'POINT',
      'FAULT',
      'PLAYER_ATTRIBUTION',
      'TIMEOUT',
      'SIDE_CHANGE_CONFIRMED',
      'MANUAL_DECISION',
      'VOID',
    ] as const;
    const schemaAcceptsSepakEvents = sepakEventTypes.every(
      (type) => scoreEventSchema.safeParse({ eventId: `schema-${type}`, type }).success
    );

    const lineup = (teamId: string, prefix: string) => ({
      eventId: `lineup-${prefix}`,
      atMs: 0,
      type: 'LINEUP_SET',
      teamId,
      onCourt: [
        { playerId: `${prefix}-tekong`, role: 'TEKONG' },
        { playerId: `${prefix}-feeder`, role: 'FEEDER' },
        { playerId: `${prefix}-striker`, role: 'STRIKER' },
      ],
      subs: [],
    });

    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      eventId: 'sepak-toss',
      atMs: 0,
      type: 'TOSS',
      winnerTeamId: seed.teamA.id,
      choice: 'SERVE',
    });
    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, lineup(seed.teamA.id, 'a'));
    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, lineup(seed.teamB.id, 'b'));
    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      eventId: 'sepak-set-start',
      atMs: 0,
      type: 'SET_START',
      setNo: 1,
    });
    const scored = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      eventId: 'sepak-ace',
      atMs: 0,
      type: 'POINT',
      pointType: 'ACE',
      scoringTeamId: seed.teamA.id,
    });
    const undone = await scoringService.undoLastEvent(organizer, seed.tournament.id, seed.match.id);

    const board = scored.scoreboard;
    const undoneBoard = undone.scoreboard;
    const passed =
      schemaAcceptsSepakEvents &&
      sepakConfig !== null &&
      sepakConfig.setPoints === 21 &&
      sepakConfig.bestOf === 3 &&
      sepakConfig.serveRotation === 3 &&
      board.sport === 'sepak-takraw' &&
      board.phase === 'set_live' &&
      board.points[seed.teamA.id] === 1 &&
      board.serving?.teamId === seed.teamA.id &&
      board.nextAction.action === 'rally_ready' &&
      undoneBoard.sport === 'sepak-takraw' &&
      undoneBoard.points[seed.teamA.id] === 0 &&
      undoneBoard.voidedEventCount === 1;

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_SEPAK_TAKRAW_SESSION',
      name: 'Scoring Sepak Takraw: service resolves its engine/config, scores a rally and undoes it',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Sepak-takraw API envelope accepted every event type; the 21/3-serve config, TOSS→LINEUP→SET_START→ACE, and undo all worked.'
        : 'Sepak-takraw event envelope, engine/config, or score/undo round-trip failed.',
      durationMs: Date.now() - t7Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_SEPAK_TAKRAW_SESSION',
      name: 'Scoring Sepak Takraw: service resolves its engine/config, scores a rally and undoes it',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t7Start,
    });
  }

  // Test 8: legacy Dodgeball sessions are migrated to the widened jersey range.
  const t8Start = Date.now();
  try {
    const seed = await seedScoreableMatch('dodgeball-legacy', [], 'dodgeball');
    const organizer: UserSession = { id: 'org-dodgeball-legacy', name: 'Organizer', role: 'organizer' };

    await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const created = await matchScoreRepository.findByMatchId(seed.match.id);
    if (!created || !('jerseyMax' in created.config)) {
      throw new Error('Dodgeball score session/config was not created');
    }

    // Simulate a session created before the range was widened.
    await matchScoreRepository.update(created.matchId, {
      config: { ...created.config, jerseyMax: 10 },
    });

    // A console GET must migrate the persisted config...
    const detail = await scoringService.getMatchForScoring(
      organizer,
      seed.tournament.id,
      seed.match.id,
    );
    const readMax =
      detail.score && 'jerseyMax' in detail.score.config
        ? detail.score.config.jerseyMax
        : null;

    // ...and double-digit jerseys must then be accepted end-to-end.
    await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      eventId: 'dodge-legacy-toss',
      atMs: 0,
      type: 'TOSS',
      winnerTeamId: seed.teamA.id,
    });
    const lineup = await scoringService.appendEvent(organizer, seed.tournament.id, seed.match.id, {
      eventId: 'dodge-legacy-lineup',
      atMs: 0,
      type: 'LINEUP_SET',
      teamId: seed.teamA.id,
      onCourt: ['1', '2', '11', '23'],
      subs: ['45', '99'],
    });

    const persisted = await matchScoreRepository.findByMatchId(seed.match.id);
    const persistedMax =
      persisted && 'jerseyMax' in persisted.config ? persisted.config.jerseyMax : null;
    const teamState =
      lineup.scoreboard.sport === 'dodgeball'
        ? lineup.scoreboard.teamStates.find((team) => team.teamId === seed.teamA.id)
        : undefined;

    const passed =
      readMax === 99 &&
      persistedMax === 99 &&
      teamState?.onCourt.includes('11') === true &&
      teamState?.onCourt.includes('23') === true &&
      teamState?.subs.includes('99') === true;

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_DODGEBALL_LEGACY_JERSEYS',
      name: 'Scoring Dodgeball: legacy sessions migrate to 1-99 jerseys and accept double-digit lineups',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'A stored jerseyMax=10 session was upgraded to 99 on read and accepted jerseys 11, 23, 45 and 99 end-to-end.'
        : `Legacy jersey migration failed (read=${readMax}, persisted=${persistedMax}, onCourt=${JSON.stringify(teamState?.onCourt ?? [])}, subs=${JSON.stringify(teamState?.subs ?? [])}).`,
      durationMs: Date.now() - t8Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_DODGEBALL_LEGACY_JERSEYS',
      name: 'Scoring Dodgeball: legacy sessions migrate to 1-99 jerseys and accept double-digit lineups',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t8Start,
    });
  }

  // Test 9: Dodgeball team colors persist through the scoring config.
  const t9Start = Date.now();
  try {
    const seed = await seedScoreableMatch('dodgeball-colors', [], 'dodgeball');
    const organizer: UserSession = { id: 'org-dodgeball-colors', name: 'Organizer', role: 'organizer' };

    await scoringService.ensureMatchScore(organizer, seed.tournament.id, seed.match.id);
    const updated = await scoringService.updateConfig(
      organizer,
      seed.tournament.id,
      seed.match.id,
      { teamAColor: '#16A34A', teamBColor: '#EA580C' },
    );
    const persisted = await matchScoreRepository.findByMatchId(seed.match.id);

    const passed =
      'teamAColor' in updated.config &&
      updated.config.teamAColor === '#16A34A' &&
      'teamBColor' in updated.config &&
      updated.config.teamBColor === '#EA580C' &&
      persisted !== null &&
      'teamAColor' in persisted.config &&
      persisted.config.teamAColor === '#16A34A' &&
      'teamBColor' in persisted.config &&
      persisted.config.teamBColor === '#EA580C';

    await cleanupScoreableMatch(seed);

    results.push({
      id: 'TEST_SCORING_DODGEBALL_TEAM_COLORS',
      name: 'Scoring Dodgeball: team colors persist in the score config for console/live display',
      category: 'LIVE SCORER Access Control',
      passed,
      message: passed
        ? 'Green/orange team colors were stored and returned in the sanitized score view.'
        : 'Team color config was not persisted or returned correctly.',
      durationMs: Date.now() - t9Start,
    });
  } catch (err: any) {
    results.push({
      id: 'TEST_SCORING_DODGEBALL_TEAM_COLORS',
      name: 'Scoring Dodgeball: team colors persist in the score config for console/live display',
      category: 'LIVE SCORER Access Control',
      passed: false,
      message: `Error: ${err.message}`,
      durationMs: Date.now() - t9Start,
    });
  }

  const durationMs = Date.now() - startAll;
  const passedCount = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    durationMs,
    results,
  };
}

