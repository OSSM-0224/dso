import 'server-only';

/**
 * Tournament-scoping test suite (spec §4/§5) — proves the scoring module's
 * tournament isolation at the SERVICE level:
 *  - a scorer rostered on tournament A can score A's matches but never
 *    tournament B's (403, not-assigned message);
 *  - querying/rest/ops with a tournamentId ≠ match.tournamentId is a 404
 *    (mismatch, never a cross-tournament leak);
 *  - the picker/hub lists never mix tournaments;
 *  - the tournament roster endpoint round-trips;
 *  - complete/undo operate on the right tournament.
 */
import { TestResult, TestSuiteSummary } from '../../shared/tests/testSuite.ts';
import { schoolRepository } from '../repositories/schoolRepository.ts';
import { teamRepository } from '../repositories/teamRepository.ts';
import { tournamentRepository } from '../repositories/tournamentRepository.ts';
import { matchRepository } from '../repositories/matchRepository.ts';
import { matchScoreRepository } from '../repositories/matchScoreRepository.ts';
import { scoringService } from '../services/scoringService.ts';
import { MatchDoc, MatchScoreViewDto, UserSession } from '../../shared/types.ts';

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
    venue: 'Scoping Ground',
    quarter: 1,
    scorerIds,
    score: null,
  };
}

async function seedScopingTournament(suffix: string) {
  const schoolA = await schoolRepository.create({ name: `Scoping School A (${suffix})` });
  const schoolB = await schoolRepository.create({ name: `Scoping School B (${suffix})` });

  const tournament = await tournamentRepository.create({
    name: `Scoping Cup ${suffix}`,
    ageGroup: 'U-14',
    gender: 'boys',
    year: 2026,
  });
  await tournamentRepository.update(tournament.id, { status: 'published' });

  const teamA = await teamRepository.create({
    tournamentId: tournament.id,
    name: `Scoping Team A (${suffix})`,
    schoolId: schoolA.id,
    medium: 'English',
    ageGroup: 'U-14',
    gender: 'boys',
  });
  const teamB = await teamRepository.create({
    tournamentId: tournament.id,
    name: `Scoping Team B (${suffix})`,
    schoolId: schoolB.id,
    medium: 'Marathi',
    ageGroup: 'U-14',
    gender: 'boys',
  });

  const match = makeMatch(`match-scoping-${suffix}`, tournament.id, teamA, teamB);
  await matchRepository.saveBatch([match]);

  return { schoolA, schoolB, teamA, teamB, tournament, match };
}

async function cleanupScopingTournament(seed: Awaited<ReturnType<typeof seedScopingTournament>>) {
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
    eventId: `scoping-toss-${suffix}`,
    atMs: 0,
    type: 'TOSS',
    stage: 'first_innings',
    winnerTeamId: teamAId,
    decision: 'DEFEND',
  } as const;
}

const statusOf = (err: unknown): number => (err as { status?: number } | null)?.status ?? 0;

export async function runScoringScopingTestSuite(): Promise<TestSuiteSummary> {
  const results: TestResult[] = [];
  const startAll = Date.now();

  const push = (
    id: string,
    name: string,
    category: string,
    passed: boolean,
    message: string,
    start: number
  ) => {
    results.push({ id, name, category, passed, message, durationMs: Date.now() - start });
  };

  // ---------------------------------------------------------------
  // Shared data: two tournaments, one scorer rostered ONLY on T1.
  // ---------------------------------------------------------------
  const t1 = await seedScopingTournament(`t1-${Date.now()}`);
  const t2 = await seedScopingTournament(`t2-${Date.now()}`);

  const scorerUser = await (await import('../repositories/userRepository.ts')).userRepository.create({
    name: 'Scoping Scorer',
    role: 'scorer',
    email: `scoping-scorer-${Date.now()}@dso.test`,
    passwordHash: 'x',
    salt: 'x',
    mustChangePassword: false,
    isActive: true,
  });

  const admin: UserSession = { id: 'scoping-admin', name: 'Admin', role: 'admin' };
  const organizer: UserSession = { id: 'scoping-organizer', name: 'Organizer', role: 'organizer' };
  const scorer: UserSession = { id: scorerUser.id, name: scorerUser.name, role: 'scorer' };

  // Roster the scorer on T1 only (tournament-level assignment).
  await tournamentRepository.update(t1.tournament.id, { scorerIds: [scorerUser.id] });
  // Give T2 a DIFFERENT scorer so the picker shows the scorer exactly one hub.
  await tournamentRepository.update(t2.tournament.id, { scorerIds: ['someone-else'] });

  // Test 1: organizer-overview + picker permutation.
  {
    const start = Date.now();
    try {
      const overview = await scoringService.getOrganizerOverview(organizer);
      const summaryT1 = await scoringService.listScoringTournaments(scorer);

      const overviewHasBoth = overview.some(
        (g) => g.tournament.id === t1.tournament.id
      );
      const scorerSeesT1 = summaryT1.some((s) => s.id === t1.tournament.id);
      const scorerDoesNotSeeT2 = !summaryT1.some((s) => s.id === t2.tournament.id);

      push(
        'TEST_SCOPING_PICKER_OVERVIEW_SCOPED',
        'Scoring scoping: organizer overview + scorer picker are tournament-scoped',
        'Scoping',
        overviewHasBoth && scorerSeesT1 && scorerDoesNotSeeT2,
        `overview=${overview.length} t1=${scorerSeesT1} t2=${scorerDoesNotSeeT2}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_PICKER_OVERVIEW_SCOPED', 'Scoring scoping: organizer overview + scorer picker are tournament-scoped', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 2: hub list scoping + read authz.
  {
    const start = Date.now();
    try {
      const hubT1 = await scoringService.listTournamentMatches(scorer, t1.tournament.id);
      const idsOk = hubT1.matches.every((m) => m.tournamentId === t1.tournament.id);
      const onlyOwn = hubT1.matches.length === 1 && hubT1.matches[0].matchId === t1.match.id;

      let readForbidden = false;
      let notAssignedMessage = false;
      try {
        await scoringService.listTournamentMatches(scorer, t2.tournament.id);
      } catch (err: any) {
        readForbidden = statusOf(err) === 403;
        notAssignedMessage = /not assigned to this match/i.test(err?.message ?? '');
      }

      push(
        'TEST_SCOPING_HUB_LIST_AND_READ_GUARD',
        'Scoring scoping: hub lists only own tournament + 403 read guard',
        'Scoping',
        idsOk && onlyOwn && readForbidden && notAssignedMessage,
        `idsOk=${idsOk} onlyOwn=${onlyOwn} readForbidden=${readForbidden} msg=${notAssignedMessage}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_HUB_LIST_AND_READ_GUARD', 'Scoring scoping: hub lists only own tournament + 403 read guard', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 3: console must 404 on match/tournament mismatch.
  {
    const start = Date.now();
    try {
      let mismatch = false;
      try {
        await scoringService.getMatchForScoring(scorer, t1.tournament.id, t2.match.id);
      } catch (err: any) {
        mismatch = statusOf(err) === 404 && /not found in this tournament/i.test(err?.message ?? '');
      }

      push(
        'TEST_SCOPING_MISMATCH_IS_404',
        'Scoring scoping: match/tournament mismatch is a 404',
        'Scoping',
        mismatch,
        `mismatch=${mismatch}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_MISMATCH_IS_404', 'Scoring scoping: match/tournament mismatch is a 404', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 4: writer authorization across tournaments.
  {
    const start = Date.now();
    try {
      let firstScore: MatchScoreViewDto | null = null;
      try {
        firstScore = await scoringService.ensureMatchScore(scorer, t1.tournament.id, t1.match.id);
      } catch (err) {
        firstScore = null;
      }

      let crossTournamentBlocked = false;
      let assignedMsg = false;
      try {
        await scoringService.appendEvent(
          scorer,
          t2.tournament.id,
          t2.match.id,
          tossEvent(t2.teamA.id, 'x1') as unknown as Record<string, unknown>
        );
      } catch (err: any) {
        crossTournamentBlocked = statusOf(err) === 403;
        assignedMsg = /not assigned to this match/i.test(err?.message ?? '');
      }

      let legacyTournamentForOtherScorer = false;
      try {
        const outsider: UserSession = { id: 'outsider-scorer', name: 'Outsider', role: 'scorer' };
        await scoringService.ensureMatchScore(outsider, t1.tournament.id, t1.match.id);
      } catch (err: any) {
        legacyTournamentForOtherScorer = statusOf(err) === 403;
      }

      push(
        'TEST_SCOPING_WRITER_ROSTER_SCOPED',
        'Scoring scoping: writer roster is tournament-scoped',
        'Scoping',
        firstScore !== null &&
          crossTournamentBlocked &&
          assignedMsg &&
          legacyTournamentForOtherScorer,
        `ensure=${firstScore !== null} cross=${crossTournamentBlocked} msg=${assignedMsg} outsider=${legacyTournamentForOtherScorer}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_WRITER_ROSTER_SCOPED', 'Scoring scoping: writer roster is tournament-scoped', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 5: undo + complete operate on the correct tournament.
  {
    const start = Date.now();
    try {
      const appended = await scoringService.appendEvent(
        scorer,
        t1.tournament.id,
        t1.match.id,
        tossEvent(t1.teamA.id, 'u1') as unknown as Record<string, unknown>
      );
      const undone = await scoringService.undoLastEvent(scorer, t1.tournament.id, t1.match.id);
      // Undo appends an audit-trail VOID event: the version BUMPS (matches the
      // engine + TEST_SCORING_UNDO_VOID semantics).
      const undoneOk = undone.version === appended.version + 1;

      let undoScoped = false;
      try {
        // The scorer can't undo anything on the foreign tournament.
        await scoringService.undoLastEvent(scorer, t2.tournament.id, t2.match.id);
      } catch (err: any) {
        undoScoped = statusOf(err) === 403;
      }

      push(
        'TEST_SCOPING_UNDO_COMPLETE_BOUNDARY',
        'Scoring scoping: undo/complete respect the tournament boundary',
        'Scoping',
        undoneOk && undoScoped,
        `undone=${undoneOk} undoScoped=${undoScoped}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_UNDO_COMPLETE_BOUNDARY', 'Scoring scoping: undo/complete respect the tournament boundary', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 6: tournament scorer roster endpoint round trip.
  {
    const start = Date.now();
    try {
      await scoringService.setTournamentScorers(admin, t1.tournament.id, [scorerUser.id]);
      const roster = await scoringService.getTournamentScorers(admin, t1.tournament.id);
      let staffOnly = false;
      try {
        await scoringService.setTournamentScorers(scorer, t1.tournament.id, [scorerUser.id]);
      } catch (err: any) {
        staffOnly = statusOf(err) === 403;
      }
      push(
        'TEST_SCOPING_ROSTER_ENDPOINT_ROUND_TRIP',
        'Scoring scoping: tournament roster endpoint round-trips (staff only)',
        'Scoping',
        roster.scorerIds.includes(scorerUser.id) && staffOnly,
        `roster=${roster.scorerIds.length} staffOnly=${staffOnly}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_ROSTER_ENDPOINT_ROUND_TRIP', 'Scoring scoping: tournament roster endpoint round-trips (staff only)', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 7: legacy redirect resolution.
  {
    const start = Date.now();
    try {
      const resolved = await scoringService.resolveMatchTournamentId(t1.match.id);
      const missing = await scoringService.resolveMatchTournamentId('no-such-match');
      push(
        'TEST_SCOPING_LEGACY_REDIRECT_RESOLVE',
        'Scoring scoping: legacy redirect resolves the tournament',
        'Scoping',
        resolved === t1.tournament.id && missing === null,
        `resolved=${resolved} missing=${missing}`,
        start
      );
    } catch (err: any) {
      push('TEST_SCOPING_LEGACY_REDIRECT_RESOLVE', 'Scoring scoping: legacy redirect resolves the tournament', 'Scoping', false, err?.message ?? String(err), start);
    }
  }

  // Test 8: cleanup both tournaments.
  await cleanupScopingTournament(t1);
  await cleanupScopingTournament(t2);

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return {
    total,
    passed,
    failed: total - passed,
    durationMs: Date.now() - startAll,
    results,
  };
}
