/**
 * Pure sepak takraw scoring engine tests (Phase 2A core fold).
 * Framework-free, synchronous; registered in the server runner and the
 * /api/tests/run in-browser fallback like the kho-kho suites.
 */
import { sepakTakrawScoringEngine } from '../scoring/sports/sepakTakraw/engine.ts';
import type {
  SepakTakrawFaultType,
  SepakTakrawLineupSlot,
  SepakTakrawPointType,
  SepakTakrawScoreEvent,
  SepakTakrawScoreboard,
  SepakTakrawScoringConfig,
  SepakTakrawScoringState,
} from '../scoring/sports/sepakTakraw/types.ts';
import { ScoringRuleError } from '../scoring/types.ts';
import { TestResult, TestSuiteSummary } from '../types.ts';

const TEAM_A = { id: 'team-a', name: 'Alpha Vidya Mandir' };
const TEAM_B = { id: 'team-b', name: 'Beta Vidya Mandir' };

const LINEUP_A: SepakTakrawLineupSlot[] = [
  { playerId: 'a-tekong', role: 'TEKONG' },
  { playerId: 'a-feeder', role: 'FEEDER' },
  { playerId: 'a-striker', role: 'STRIKER' },
];
const SUBS_A = ['a-sub1', 'a-sub2'];
const LINEUP_B: SepakTakrawLineupSlot[] = [
  { playerId: 'b-tekong', role: 'TEKONG' },
  { playerId: 'b-feeder', role: 'FEEDER' },
  { playerId: 'b-striker', role: 'STRIKER' },
];
const SUBS_B = ['b-sub1', 'b-sub2'];

type PartialEvent = Partial<SepakTakrawScoreEvent> & Record<string, unknown>;

class Harness {
  t = 1000;
  private seq = 0;
  state: SepakTakrawScoringState;

  constructor(config?: Partial<SepakTakrawScoringConfig>) {
    this.state = sepakTakrawScoringEngine.createInitialState({
      teams: [TEAM_A, TEAM_B],
      config,
    });
  }

  eid(): string {
    this.seq += 1;
    return `takraw-ev-${this.seq}-${this.t}`;
  }

  tick(ms: number): number {
    this.t += ms;
    return this.t;
  }

  apply(event: PartialEvent, atMs?: number): { ok: boolean; error: ScoringRuleError | null } {
    const full = {
      ...event,
      eventId: (event.eventId as string | undefined) ?? this.eid(),
      atMs: atMs ?? this.t,
    } as unknown as SepakTakrawScoreEvent;
    try {
      this.state = sepakTakrawScoringEngine.applyEvent(this.state, full);
      return { ok: true, error: null };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof ScoringRuleError ? err : new ScoringRuleError('UNKNOWN', String(err)),
      };
    }
  }

  mustApply(event: PartialEvent, atMs?: number): void {
    const result = this.apply(event, atMs);
    if (!result.ok) {
      throw new Error(
        `expected event to be accepted: ${JSON.stringify(event)} -> ${result.error?.code} ${result.error?.message}`,
      );
    }
  }

  mustFail(event: PartialEvent, code: string, atMs?: number): void {
    const result = this.apply(event, atMs);
    if (result.ok) {
      throw new Error(`expected event to be REJECTED (${code}) but it was accepted: ${JSON.stringify(event)}`);
    }
    if (result.error?.code !== code) {
      throw new Error(`expected rejection code ${code} but got ${result.error?.code}: ${result.error?.message}`);
    }
  }

  board(): SepakTakrawScoreboard {
    return sepakTakrawScoringEngine.getScoreboard(this.state, this.t);
  }

  action(): string {
    return this.board().nextAction.action;
  }

  toss(winnerTeamId = TEAM_A.id, choice: 'SERVE' | 'RECEIVE' = 'SERVE', forSetNo?: number): void {
    const payload: PartialEvent = { type: 'TOSS', winnerTeamId, choice };
    if (forSetNo !== undefined) payload.forSetNo = forSetNo;
    this.mustApply(payload);
  }

  lineup(teamId: string, onCourt: SepakTakrawLineupSlot[], subs: string[]): void {
    this.mustApply({ type: 'LINEUP_SET', teamId, onCourt, subs });
  }

  startSet(setNo: number): void {
    this.mustApply({ type: 'SET_START', setNo });
  }

  point(teamId: string, pointType: SepakTakrawPointType = 'OTHER', playerId?: string): void {
    const payload: PartialEvent = { type: 'POINT', pointType, scoringTeamId: teamId };
    if (playerId) payload.playerId = playerId;
    this.mustApply(payload);
  }

  fault(teamId: string, faultType: SepakTakrawFaultType, playerId?: string): void {
    const payload: PartialEvent = { type: 'FAULT', faultType, faultyTeamId: teamId };
    if (playerId) payload.playerId = playerId;
    this.mustApply(payload);
  }
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function pointsOf(board: SepakTakrawScoreboard, teamId: string): number {
  return board.points[teamId] ?? 0;
}

function other(teamId: string): string {
  return teamId === TEAM_A.id ? TEAM_B.id : TEAM_A.id;
}

function liveSet(config?: Partial<SepakTakrawScoringConfig>): Harness {
  const h = new Harness(config);
  h.toss(TEAM_A.id, 'SERVE');
  h.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
  h.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
  h.startSet(1);
  return h;
}

function scorePoints(h: Harness, teamId: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    h.point(teamId, 'OTHER');
  }
}

function scoreAlternatingTo(h: Harness, aTarget: number, bTarget: number): void {
  const board = h.board();
  let a = pointsOf(board, TEAM_A.id);
  let b = pointsOf(board, TEAM_B.id);
  while (a < aTarget || b < bTarget) {
    if (a < aTarget) {
      h.point(TEAM_A.id, 'OTHER');
      a += 1;
    }
    if (b < bTarget) {
      h.point(TEAM_B.id, 'OTHER');
      b += 1;
    }
  }
}

export function runSepakTakrawTestSuite(): TestSuiteSummary {
  const startTime = Date.now();
  const results: TestResult[] = [];

  const test = (id: string, name: string, category: string, fn: () => void) => {
    const t0 = performance.now();
    try {
      fn();
      results.push({
        id,
        name,
        category,
        passed: true,
        message: 'Passed.',
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      results.push({
        id,
        name,
        category,
        passed: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - t0),
      });
    }
  };

  test(
    'TEST_TAKRAW_TOSS_GATE',
    'Toss gate: toss before lineups, duplicate toss rejected, later-set tosses refused',
    'Match Setup',
    () => {
      const h = new Harness();
      const fresh = h.board();
      expect(fresh.phase === 'awaiting_toss', `fresh phase should be awaiting_toss, got ${fresh.phase}`);
      expect(
        fresh.nextAction.action === 'prompt_toss' && fresh.nextAction.setNo === 1,
        'fresh next action should prompt the opening toss',
      );

      h.mustFail({ type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: LINEUP_A, subs: SUBS_A }, 'TOSS_REQUIRED');
      h.mustFail({ type: 'SET_START', setNo: 1 }, 'TOSS_REQUIRED');
      h.mustFail({ type: 'TOSS', winnerTeamId: 'ghost', choice: 'SERVE' }, 'TEAM_NOT_FOUND');
      h.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'CHASE' } as unknown as PartialEvent,
        'MALFORMED_EVENT',
      );

      h.toss(TEAM_A.id, 'SERVE');
      const afterToss = h.board();
      expect(afterToss.phase === 'awaiting_lineups', `after toss phase should be awaiting_lineups, got ${afterToss.phase}`);
      expect(
        afterToss.nextAction.action === 'require_lineups' &&
          afterToss.nextAction.missingTeamIds.length === 2,
        'both lineups should be required after the toss',
      );

      h.mustFail({ type: 'TOSS', winnerTeamId: TEAM_B.id, choice: 'RECEIVE' }, 'TOSS_ALREADY_SET');
      h.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_B.id, choice: 'RECEIVE', forSetNo: 2 },
        'TOSS_NOT_EXPECTED',
      );
    },
  );

  test(
    'TEST_TAKRAW_LINEUP_VALIDATION',
    'Lineup validation: three players, one of each role, legal subs, no live-set edits',
    'Match Setup',
    () => {
      const h = new Harness();
      h.toss(TEAM_A.id, 'SERVE');

      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: [LINEUP_A[0], LINEUP_A[1]],
          subs: [],
        },
        'BAD_LINEUP',
      );
      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: [...LINEUP_A, { playerId: 'a-extra', role: 'STRIKER' }],
          subs: [],
        },
        'BAD_LINEUP',
      );
      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: [
            { playerId: 'a-tekong', role: 'TEKONG' },
            { playerId: 'a-feeder', role: 'FEEDER' },
            { playerId: 'a-feeder-2', role: 'FEEDER' },
          ],
          subs: [],
        },
        'ROLE_SLOTS_INVALID',
      );
      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: [
            { playerId: 'a-tekong', role: 'TEKONG' },
            { playerId: 'a-feeder', role: 'FEEDER' },
            { playerId: 'a-tekong', role: 'STRIKER' },
          ],
          subs: [],
        },
        'BAD_LINEUP',
      );
      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: LINEUP_A,
          subs: ['a-tekong'],
        },
        'BAD_LINEUP',
      );
      h.mustFail(
        {
          type: 'LINEUP_SET',
          teamId: TEAM_A.id,
          onCourt: LINEUP_A,
          subs: ['a-sub1', 'a-sub2', 'a-sub3'],
        },
        'BAD_LINEUP',
      );
      h.mustFail({ type: 'LINEUP_SET', teamId: 'ghost', onCourt: LINEUP_A, subs: [] }, 'TEAM_NOT_FOUND');

      h.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
      expect(h.board().phase === 'awaiting_lineups', 'team B lineup still missing');
      h.mustFail({ type: 'SET_START', setNo: 1 }, 'LINEUP_REQUIRED');
      h.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      expect(h.board().phase === 'awaiting_set_start', 'both lineups ready -> awaiting_set_start');
      expect(h.action() === 'start_set', 'next action should be start_set');

      h.startSet(1);
      h.mustFail(
        { type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: LINEUP_A, subs: SUBS_A },
        'BAD_LINEUP',
      );
    },
  );

  test(
    'TEST_TAKRAW_SERVE_ROTATION',
    'Serve rotation: three rallies per team regardless of winner; a service fault consumes a serve',
    'Scoring Rules',
    () => {
      const h = liveSet();
      let board = h.board();
      expect(board.serving?.teamId === TEAM_A.id, 'team A serves first after winning the toss');
      expect(board.serving?.playerId === 'a-tekong', 'the Tekong serves');
      expect(board.serving?.serveCount === 1 && board.serving?.maxServes === 3, 'first serve is 1/3');

      h.point(TEAM_B.id, 'ATTACK', 'b-striker');
      board = h.board();
      expect(pointsOf(board, TEAM_B.id) === 1, 'the receiving team can win the rally');
      expect(
        board.serving?.teamId === TEAM_A.id && board.serving?.serveCount === 2,
        'serve stays with A at 2/3 even though B won the rally',
      );

      h.point(TEAM_A.id, 'ATTACK', 'a-striker');
      board = h.board();
      expect(
        board.serving?.teamId === TEAM_A.id && board.serving?.serveCount === 3,
        'serve stays with A at 3/3',
      );

      h.point(TEAM_B.id, 'OTHER');
      board = h.board();
      expect(
        board.serving?.teamId === TEAM_B.id &&
          board.serving?.playerId === 'b-tekong' &&
          board.serving?.serveCount === 1,
        'after three rallies the serve passes to B and its Tekong serves 1/3',
      );

      h.fault(TEAM_B.id, 'TEKONG_STANDING_FAULT');
      board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 2, 'a service fault awards the point to the opponent');
      expect(
        board.serving?.teamId === TEAM_B.id && board.serving?.serveCount === 2,
        'a service fault still consumes one of the three serves',
      );

      h.point(TEAM_A.id, 'OTHER');
      board = h.board();
      expect(
        board.serving?.teamId === TEAM_B.id && board.serving?.serveCount === 3,
        'B is still serving at 3/3',
      );

      h.point(TEAM_B.id, 'OTHER');
      board = h.board();
      expect(
        board.serving?.teamId === TEAM_A.id && board.serving?.serveCount === 1,
        'B completed three rallies; the serve returns to A at 1/3',
      );
    },
  );

  test(
    'TEST_TAKRAW_DEUCE_SERVE',
    'Deuce: serve changes after every rally and the counter shows 1/1',
    'Scoring Rules',
    () => {
      const h = liveSet();
      scoreAlternatingTo(h, 19, 19);
      let board = h.board();
      expect(!board.deuce, '19-19 is not deuce yet');
      expect(board.serving?.maxServes === 3, 'serve rotation is still three before deuce');

      scoreAlternatingTo(h, 20, 20);
      board = h.board();
      expect(board.deuce, '20-20 is deuce');
      expect(pointsOf(board, TEAM_A.id) === 20 && pointsOf(board, TEAM_B.id) === 20, 'score is 20-20');
      expect(
        board.serving?.serveCount === 1 && board.serving?.maxServes === 1,
        'at deuce the display is 1/1',
      );

      const deuceServer = board.serving?.teamId;
      expect(!!deuceServer, 'a team must be serving at deuce');

      h.point(TEAM_A.id, 'OTHER');
      board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 21 && pointsOf(board, TEAM_B.id) === 20, 'A leads 21-20');
      expect(board.deuce, 'still deuce at 21-20');
      expect(
        board.serving?.teamId === other(deuceServer ?? '') && board.serving?.serveCount === 1,
        'the serve changed hands after the rally',
      );

      h.point(TEAM_B.id, 'OTHER');
      board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 21 && pointsOf(board, TEAM_B.id) === 21, '21-21');
      expect(
        board.serving?.teamId === deuceServer && board.serving?.serveCount === 1,
        'the serve alternates after every deuce rally',
      );

      h.point(TEAM_A.id, 'OTHER');
      board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 22 && pointsOf(board, TEAM_B.id) === 21, '22-21');
      expect(
        board.serving?.teamId === other(deuceServer ?? '') && board.serving?.serveCount === 1,
        'serve still alternates at 22-21',
      );
    },
  );

  test(
    'TEST_TAKRAW_SET_END_CAP',
    'Set end: 21-20 continues, 22-20 wins, 25-24 hits the cap; deciding 15/17 equivalents',
    'Scoring Rules',
    () => {
      const regulation = liveSet();
      scoreAlternatingTo(regulation, 20, 20);
      regulation.point(TEAM_A.id, 'OTHER');
      let board = regulation.board();
      expect(pointsOf(board, TEAM_A.id) === 21 && pointsOf(board, TEAM_B.id) === 20, '21-20');
      expect(board.phase === 'set_live', '21-20 must not end the set');
      expect(board.sets[0]?.completed === false, 'set is still live at 21-20');

      regulation.point(TEAM_A.id, 'OTHER');
      board = regulation.board();
      expect(pointsOf(board, TEAM_A.id) === 22 && pointsOf(board, TEAM_B.id) === 20, '22-20');
      expect(board.sets[0]?.completed === true, '22-20 ends the set');
      expect(board.sets[0]?.winnerTeamId === TEAM_A.id, 'team A wins the set');
      expect(board.phase === 'set_break', 'a completed set moves to set_break');
      expect(board.nextAction.action === 'set_complete', 'next action advertises the completed set');

      const capped = liveSet();
      scoreAlternatingTo(capped, 20, 20);
      scoreAlternatingTo(capped, 24, 24);
      let cappedBoard = capped.board();
      expect(cappedBoard.phase === 'set_live', '24-24 must not end the set');
      capped.point(TEAM_A.id, 'OTHER');
      cappedBoard = capped.board();
      expect(pointsOf(cappedBoard, TEAM_A.id) === 25 && pointsOf(cappedBoard, TEAM_B.id) === 24, '25-24');
      expect(cappedBoard.sets[0]?.completed === true, '25-24 hits the hard cap and ends the set');
      expect(cappedBoard.sets[0]?.winnerTeamId === TEAM_A.id, 'team A wins at the cap');
      expect(cappedBoard.sets[0]?.deuceEntered === true, 'the set recorded that deuce was reached');

      const deciding = liveSet();
      scorePoints(deciding, TEAM_A.id, 21);
      deciding.startSet(2);
      scorePoints(deciding, TEAM_B.id, 21);
      let decidingBoard = deciding.board();
      expect(decidingBoard.setWins[TEAM_A.id] === 1 && decidingBoard.setWins[TEAM_B.id] === 1, '1-1 after two sets');
      expect(decidingBoard.phase === 'set_break', 'the match is at the set break');
      deciding.mustFail({ type: 'SET_START', setNo: 3 }, 'TOSS_REQUIRED');
      deciding.toss(TEAM_A.id, 'SERVE', 3);
      deciding.startSet(3);
      scoreAlternatingTo(deciding, 14, 14);
      deciding.point(TEAM_A.id, 'OTHER');
      decidingBoard = deciding.board();
      expect(
        pointsOf(decidingBoard, TEAM_A.id) === 15 && pointsOf(decidingBoard, TEAM_B.id) === 14,
        'deciding set 15-14',
      );
      expect(decidingBoard.phase === 'set_live', '15-14 must not end the deciding set');
      deciding.point(TEAM_A.id, 'OTHER');
      decidingBoard = deciding.board();
      expect(pointsOf(decidingBoard, TEAM_A.id) === 16 && pointsOf(decidingBoard, TEAM_B.id) === 14, '16-14');
      expect(decidingBoard.sets[2]?.completed === true, '16-14 ends the deciding set');
      expect(decidingBoard.winner.resolved && decidingBoard.winner.winnerTeamId === TEAM_A.id, 'team A wins the match');

      const decidingCap = liveSet();
      scorePoints(decidingCap, TEAM_A.id, 21);
      decidingCap.startSet(2);
      scorePoints(decidingCap, TEAM_B.id, 21);
      decidingCap.toss(TEAM_A.id, 'SERVE', 3);
      decidingCap.startSet(3);
      scoreAlternatingTo(decidingCap, 14, 14);
      scoreAlternatingTo(decidingCap, 16, 16);
      let capBoard = decidingCap.board();
      expect(capBoard.phase === 'set_live', '16-16 must not end the deciding set');
      decidingCap.point(TEAM_A.id, 'OTHER');
      capBoard = decidingCap.board();
      expect(pointsOf(capBoard, TEAM_A.id) === 17 && pointsOf(capBoard, TEAM_B.id) === 16, '17-16');
      expect(capBoard.sets[2]?.completed === true, '17-16 hits the deciding-set cap');
      expect(capBoard.winner.resolved && capBoard.winner.winnerTeamId === TEAM_A.id, 'team A wins at the deciding cap');
    },
  );

  test(
    'TEST_TAKRAW_MATCH_COMPLETION',
    'Match completion: first to two sets wins; a 1-1 match needs the deciding set and its toss',
    'Match Completion',
    () => {
      const sweep = liveSet();
      scorePoints(sweep, TEAM_A.id, 21);
      expect(sweep.board().setWins[TEAM_A.id] === 1, 'set 1 goes to team A');
      sweep.startSet(2);
      expect(sweep.board().serving?.teamId === TEAM_B.id, 'set 2 first serve alternates to team B');
      scorePoints(sweep, TEAM_A.id, 21);
      const swept = sweep.board();
      expect(swept.phase === 'completed', 'two set wins complete the match');
      expect(swept.winner.resolved && swept.winner.winnerTeamId === TEAM_A.id, 'team A is the winner');
      expect(swept.winner.kind === 'sets' && swept.winner.label === 'WON BY 2 SETS', 'sets winner label');
      expect(swept.nextAction.action === 'completed', 'next action is completed');
      expect(sepakTakrawScoringEngine.computeWinner(sweep.state).winnerTeamId === TEAM_A.id, 'computeWinner agrees');
      sweep.mustFail({ type: 'POINT', pointType: 'OTHER', scoringTeamId: TEAM_A.id }, 'MATCH_COMPLETED');
      sweep.mustFail({ type: 'SET_START', setNo: 3 }, 'MATCH_COMPLETED');
      sweep.mustFail({ type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 3 }, 'MATCH_COMPLETED');

      const threeSets = liveSet();
      scorePoints(threeSets, TEAM_A.id, 21);
      threeSets.startSet(2);
      scorePoints(threeSets, TEAM_B.id, 21);
      let board = threeSets.board();
      expect(board.phase === 'set_break', '1-1 goes to the set break');
      expect(!board.winner.resolved, 'no winner after two sets');
      expect(
        board.nextAction.action === 'prompt_toss' && board.nextAction.setNo === 3,
        'deciding-set toss prompted',
      );
      threeSets.toss(TEAM_B.id, 'RECEIVE', 3);
      threeSets.startSet(3);
      expect(threeSets.board().serving?.teamId === TEAM_A.id, 'the deciding toss decides the first server');
      scorePoints(threeSets, TEAM_A.id, 15);
      board = threeSets.board();
      expect(board.phase === 'completed', 'the deciding set completes the match');
      expect(board.sets.length === 3, 'three sets were played');
      expect(board.setWins[TEAM_A.id] === 2 && board.setWins[TEAM_B.id] === 1, 'sets ended 2-1');
      expect(board.winner.winnerTeamId === TEAM_A.id, 'team A wins 2-1');
    },
  );

  const durationMs = Date.now() - startTime;
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs,
    results,
  };
}
