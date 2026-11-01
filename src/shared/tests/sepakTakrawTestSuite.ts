/**
 * Pure sepak takraw scoring engine tests (Phase 2A core fold).
 * Framework-free, synchronous; registered in the server runner and the
 * /api/tests/run in-browser fallback like the kho-kho suites.
 */
import { sepakTakrawScoringEngine } from '../scoring/sports/sepakTakraw/engine.ts';
import { SEPAK_TAKRAW_FAULTS } from '../scoring/sports/sepakTakraw/types.ts';
import type {
  SepakTakrawFaultType,
  SepakTakrawLineupSlot,
  SepakTakrawPointType,
  SepakTakrawScoreEvent,
  SepakTakrawScoreboard,
  SepakTakrawScoringConfig,
  SepakTakrawScoringState,
  SepakTakrawStatsRow,
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

function toDecidingSet(h: Harness, config?: Partial<SepakTakrawScoringConfig>): void {
  scorePoints(h, TEAM_A.id, 21);
  h.startSet(2);
  scorePoints(h, TEAM_B.id, 21);
  if (config?.serveTossInDecidingSet === false) {
    h.startSet(3);
  } else {
    h.toss(TEAM_A.id, 'SERVE', 3);
    h.startSet(3);
  }
}

function expectRuleError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    const actual = err instanceof ScoringRuleError ? err.code : 'UNKNOWN';
    expect(actual === code, `expected ${code} but got ${actual}`);
    return;
  }
  throw new Error(`expected ${code} but no error was thrown`);
}

function lastEventId(h: Harness): string {
  const event = h.state.events[h.state.events.length - 1];
  if (!event) throw new Error('no events recorded');
  return event.eventId;
}

function eventIdOf(h: Harness, type: SepakTakrawScoreEvent['type'], occurrence = 0): string {
  const event = h.state.events.filter((entry) => entry.type === type)[occurrence];
  if (!event) throw new Error(`no ${type} event at index ${occurrence}`);
  return event.eventId;
}

function statRow(h: Harness, teamId: string, playerId: string | null): SepakTakrawStatsRow {
  const row = sepakTakrawScoringEngine
    .getPlayerStats(h.state)
    .find((entry) => entry.teamId === teamId && entry.playerId === playerId);
  if (!row) throw new Error(`no stats row for ${teamId}:${playerId ?? 'unassigned'}`);
  return row;
}

function statValue(h: Harness, teamId: string, playerId: string | null, key: string): number {
  return statRow(h, teamId, playerId).values[key] ?? 0;
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

  test(
    'TEST_TAKRAW_INIT_REJECTS_BAD_TEAMS',
    'Match setup: exactly two distinct, named teams; config overrides merge with defaults',
    'Match Setup',
    () => {
      expectRuleError(
        () => sepakTakrawScoringEngine.createInitialState({ teams: [] }),
        'INVALID_TEAMS',
      );
      expectRuleError(
        () => sepakTakrawScoringEngine.createInitialState({ teams: [TEAM_A] }),
        'INVALID_TEAMS',
      );
      expectRuleError(
        () =>
          sepakTakrawScoringEngine.createInitialState({
            teams: [TEAM_A, TEAM_B, { id: 'team-c', name: 'Gamma Vidya Mandir' }],
          }),
        'INVALID_TEAMS',
      );
      expectRuleError(
        () =>
          sepakTakrawScoringEngine.createInitialState({
            teams: [TEAM_A, { ...TEAM_B, id: TEAM_A.id }],
          }),
        'INVALID_TEAMS',
      );
      expectRuleError(
        () =>
          sepakTakrawScoringEngine.createInitialState({
            teams: [{ id: '', name: 'Blank' }, TEAM_B],
          }),
        'INVALID_TEAMS',
      );
      expectRuleError(
        () =>
          sepakTakrawScoringEngine.createInitialState({
            teams: [TEAM_A, { id: 'team-b', name: '' }],
          }),
        'INVALID_TEAMS',
      );

      const custom = sepakTakrawScoringEngine.createInitialState({
        teams: [TEAM_A, TEAM_B],
        config: { serveRotation: 2, letServeAllowed: true },
      });
      expect(custom.config.serveRotation === 2, 'config overrides are applied');
      expect(custom.config.letServeAllowed, 'boolean config overrides are applied');
      expect(custom.config.setPoints === 21 && custom.config.maxRosterSize === 5, 'defaults are preserved');
      expect(custom.events.length === 0 && custom.teams.length === 2, 'the initial state starts empty');
      expect(sepakTakrawScoringEngine.getScoreboard(custom).phase === 'awaiting_toss', 'fresh phase');
    },
  );

  test(
    'TEST_TAKRAW_FIRST_SERVE_ALTERNATES',
    'First serve: toss decides set 1, set 2 alternates, and the deciding set uses its toss or alternation',
    'Scoring Rules',
    () => {
      const receive = new Harness();
      receive.toss(TEAM_A.id, 'RECEIVE');
      receive.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
      receive.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      receive.startSet(1);
      expect(receive.board().serving?.teamId === TEAM_B.id, 'a RECEIVE toss makes the rival serve first');

      const alternating = liveSet();
      expect(alternating.board().serving?.teamId === TEAM_A.id, 'set 1 first server is the toss winner');
      scorePoints(alternating, TEAM_A.id, 21);
      alternating.startSet(2);
      expect(alternating.board().serving?.teamId === TEAM_B.id, 'set 2 first serve alternates');
      scorePoints(alternating, TEAM_B.id, 21);
      alternating.toss(TEAM_B.id, 'RECEIVE', 3);
      alternating.startSet(3);
      expect(alternating.board().serving?.teamId === TEAM_A.id, 'the deciding toss sets the first server');

      const stay = liveSet({ firstServeAlternate: false });
      scorePoints(stay, TEAM_A.id, 21);
      stay.startSet(2);
      expect(stay.board().serving?.teamId === TEAM_A.id, 'firstServeAlternate=false keeps the set 1 server');

      const noToss = liveSet({ serveTossInDecidingSet: false });
      scorePoints(noToss, TEAM_A.id, 21);
      noToss.startSet(2);
      expect(noToss.board().serving?.teamId === TEAM_B.id, 'set 2 still alternates');
      scorePoints(noToss, TEAM_B.id, 21);
      noToss.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_NOT_EXPECTED',
      );
      noToss.startSet(3);
      expect(
        noToss.board().serving?.teamId === TEAM_A.id,
        'without a deciding toss the serve alternates back to A',
      );
    },
  );

  test(
    'TEST_TAKRAW_DECIDING_SET_TOSS',
    'Deciding toss: rejected early, mid-set, on non-deciding sets and when disabled; required before set start',
    'Scoring Rules',
    () => {
      const early = new Harness();
      early.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_NOT_EXPECTED',
      );

      const afterOne = liveSet();
      scorePoints(afterOne, TEAM_A.id, 21);
      afterOne.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_NOT_EXPECTED',
      );
      afterOne.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 2 },
        'TOSS_NOT_EXPECTED',
      );

      afterOne.startSet(2);
      afterOne.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_B.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_NOT_EXPECTED',
      );

      const ready = liveSet();
      scorePoints(ready, TEAM_A.id, 21);
      ready.startSet(2);
      scorePoints(ready, TEAM_B.id, 21);
      const board = ready.board();
      expect(
        board.nextAction.action === 'prompt_toss' && board.nextAction.setNo === 3,
        'the deciding toss is prompted',
      );
      ready.mustFail({ type: 'SET_START', setNo: 3 }, 'TOSS_REQUIRED');
      ready.toss(TEAM_A.id, 'RECEIVE', 3);
      ready.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_B.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_ALREADY_SET',
      );
      ready.startSet(3);
      expect(ready.board().serving?.teamId === TEAM_B.id, 'the RECEIVE toss hands the first serve to B');

      const disabled = liveSet({ serveTossInDecidingSet: false });
      scorePoints(disabled, TEAM_A.id, 21);
      disabled.startSet(2);
      scorePoints(disabled, TEAM_B.id, 21);
      disabled.mustFail(
        { type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'SERVE', forSetNo: 3 },
        'TOSS_NOT_EXPECTED',
      );
      disabled.startSet(3);
    },
  );

  test(
    'TEST_TAKRAW_POINT_TYPES',
    'Point types: ACE/ATTACK/BLOCK/OTHER accepted with the right attribution guards',
    'Scoring Rules',
    () => {
      const pre = new Harness();
      pre.toss(TEAM_A.id, 'SERVE');
      pre.mustFail(
        { type: 'POINT', pointType: 'OTHER', scoringTeamId: TEAM_A.id },
        'SET_NOT_STARTED',
      );

      const h = liveSet();
      h.point(TEAM_A.id, 'ATTACK', 'a-striker');
      h.point(TEAM_A.id, 'BLOCK', 'a-feeder');
      h.point(TEAM_A.id, 'ATTACK');
      h.point(TEAM_B.id, 'OTHER');
      const board = h.board();
      expect(
        pointsOf(board, TEAM_A.id) === 3 && pointsOf(board, TEAM_B.id) === 1,
        'attack, block and other points score',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'ATTACK', scoringTeamId: TEAM_A.id, playerId: 'a-sub1' },
        'PLAYER_NOT_ON_COURT',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'BLOCK', scoringTeamId: TEAM_A.id, playerId: 'b-tekong' },
        'PLAYER_NOT_ON_COURT',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'OTHER', scoringTeamId: TEAM_A.id, playerId: 'a-striker' },
        'ATTRIBUTION_NOT_ALLOWED',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'OTHER', scoringTeamId: 'ghost' },
        'TEAM_NOT_FOUND',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'SMASH', scoringTeamId: TEAM_A.id } as unknown as PartialEvent,
        'MALFORMED_EVENT',
      );
    },
  );

  test(
    'TEST_TAKRAW_ACE_TEKONG_ONLY',
    'Aces: only the serving team and its current Tekong; a role swap moves the serving role',
    'Scoring Rules',
    () => {
      const h = liveSet();
      h.point(TEAM_A.id, 'ACE', 'a-tekong');
      expect(pointsOf(h.board(), TEAM_A.id) === 1, 'the serving Tekong can ace');
      h.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_B.id, playerId: 'b-tekong' },
        'NOT_SERVING_TEAM',
      );
      h.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_A.id, playerId: 'a-feeder' },
        'NOT_TEKONG',
      );
      h.mustApply({
        type: 'ROLE_SWAP',
        teamId: TEAM_A.id,
        playerId: 'a-tekong',
        withPlayerId: 'a-striker',
      });
      expect(h.board().serving?.playerId === 'a-striker', 'the role swap moves the Tekong role');
      h.point(TEAM_A.id, 'ACE', 'a-striker');
      h.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_A.id, playerId: 'a-tekong' },
        'NOT_TEKONG',
      );
      h.point(TEAM_B.id, 'OTHER');
      expect(h.board().serving?.teamId === TEAM_B.id, 'the serve passed to B');
      h.point(TEAM_B.id, 'ACE', 'b-tekong');
      expect(pointsOf(h.board(), TEAM_B.id) === 2, 'the B Tekong can ace');
      h.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_B.id, playerId: 'b-feeder' },
        'NOT_TEKONG',
      );
      h.mustApply({ type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_B.id });
    },
  );

  test(
    'TEST_TAKRAW_SERVICE_FAULT_RULES',
    'Faults: every catalogue entry awards the opponent; service faults belong to the serving team',
    'Scoring Rules',
    () => {
      for (const fault of SEPAK_TAKRAW_FAULTS) {
        const h = liveSet();
        const faultyTeam = fault.category === 'service' ? TEAM_A.id : TEAM_B.id;
        h.fault(faultyTeam, fault.type);
        const board = h.board();
        expect(
          pointsOf(board, other(faultyTeam)) === 1,
          `${fault.type} should award the point to the opponent`,
        );
        expect(pointsOf(board, faultyTeam) === 0, `${fault.type} must not score for the faulty team`);
        if (fault.category === 'service') {
          expect(
            board.serving?.teamId === TEAM_A.id && board.serving?.serveCount === 2,
            `${fault.type} consumes one of the serves`,
          );
        }
      }

      const h = liveSet();
      h.mustFail(
        { type: 'FAULT', faultType: 'BAD_THROW', faultyTeamId: TEAM_B.id },
        'NOT_SERVING_TEAM',
      );
      h.mustFail(
        { type: 'FAULT', faultType: 'BAD_THROW', faultyTeamId: 'ghost' },
        'TEAM_NOT_FOUND',
      );
      h.mustFail(
        { type: 'FAULT', faultType: 'SMASH', faultyTeamId: TEAM_A.id } as unknown as PartialEvent,
        'MALFORMED_EVENT',
      );
      h.mustFail(
        { type: 'FAULT', faultType: 'FOUR_TOUCHES', faultyTeamId: TEAM_A.id, playerId: 'a-sub1' },
        'PLAYER_NOT_ON_COURT',
      );

      const pre = new Harness();
      pre.toss(TEAM_A.id, 'SERVE');
      pre.mustFail(
        { type: 'FAULT', faultType: 'FOUR_TOUCHES', faultyTeamId: TEAM_B.id },
        'SET_NOT_STARTED',
      );
    },
  );

  test(
    'TEST_TAKRAW_LET_SERVE_CONFIG',
    'Let serves: a net-touching serve is a fault by default and played on when configured',
    'Scoring Rules',
    () => {
      const strict = liveSet();
      strict.fault(TEAM_A.id, 'BALL_TOUCHING_NET_ON_SERVE');
      expect(pointsOf(strict.board(), TEAM_B.id) === 1, 'letServeAllowed=false keeps the fault');

      const lenient = liveSet({ letServeAllowed: true });
      lenient.mustFail(
        { type: 'FAULT', faultType: 'BALL_TOUCHING_NET_ON_SERVE', faultyTeamId: TEAM_A.id },
        'LET_SERVE_ALLOWED',
      );
      lenient.fault(TEAM_A.id, 'BAD_THROW');
      expect(pointsOf(lenient.board(), TEAM_B.id) === 1, 'other service faults still count');
      expect(lenient.board().serving?.serveCount === 2, 'the fault still consumed a serve');
      lenient.mustFail(
        { type: 'FAULT', faultType: 'BALL_TOUCHING_NET_ON_SERVE', faultyTeamId: TEAM_B.id },
        'NOT_SERVING_TEAM',
      );
    },
  );

  test(
    'TEST_TAKRAW_ROTATION_VS_FAULT',
    'Serve rotation counts every rally including faults; deuce rotation also applies after a fault',
    'Scoring Rules',
    () => {
      const h = liveSet();
      h.point(TEAM_B.id, 'ATTACK', 'b-striker');
      expect(h.board().serving?.serveCount === 2, 'rally 1: A still serves at 2/3');
      h.fault(TEAM_A.id, 'BAD_THROW');
      expect(h.board().serving?.serveCount === 3, 'rally 2: the service fault consumes a serve');
      h.point(TEAM_A.id, 'OTHER');
      let board = h.board();
      expect(
        board.serving?.teamId === TEAM_B.id && board.serving?.serveCount === 1,
        'rally 3: the serve passes to B at 1/3',
      );
      expect(
        pointsOf(board, TEAM_A.id) === 1 && pointsOf(board, TEAM_B.id) === 2,
        'the score follows the rallies',
      );
      h.fault(TEAM_B.id, 'FOUR_TOUCHES');
      board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 2, 'a play fault by B awards A');
      expect(
        board.serving?.teamId === TEAM_B.id && board.serving?.serveCount === 2,
        'B keeps serving at 2/3',
      );
      h.point(TEAM_B.id, 'OTHER');
      h.point(TEAM_A.id, 'OTHER');
      expect(
        h.board().serving?.teamId === TEAM_A.id && h.board().serving?.serveCount === 1,
        'B completes the rotation and A serves 1/3',
      );

      const deuce = liveSet();
      scoreAlternatingTo(deuce, 20, 20);
      const server = deuce.board().serving?.teamId;
      expect(!!server, 'a team is serving at deuce');
      deuce.fault(server ?? TEAM_A.id, 'BAD_THROW');
      board = deuce.board();
      expect(
        board.serving?.teamId === other(server ?? TEAM_A.id) && board.serving?.serveCount === 1,
        'at deuce a service fault still changes the serve after the rally',
      );
    },
  );

  test(
    'TEST_TAKRAW_SIDE_CHANGE',
    'Side change: deciding-set reminder at the threshold, one confirmation, and no reminder elsewhere',
    'Scoring Rules',
    () => {
      const regulation = liveSet();
      scorePoints(regulation, TEAM_A.id, 8);
      expect(!regulation.board().sideChangePending, 'regulation sets have no mid-set side change');
      regulation.mustFail(
        { type: 'SIDE_CHANGE_CONFIRMED', setNo: 1 },
        'SIDE_CHANGE_NOT_PENDING',
      );
      scorePoints(regulation, TEAM_A.id, 13);
      regulation.mustFail({ type: 'SIDE_CHANGE_CONFIRMED', setNo: 1 }, 'SET_NOT_STARTED');

      const h = liveSet();
      toDecidingSet(h);
      scorePoints(h, TEAM_A.id, 7);
      expect(!h.board().sideChangePending, '7 points is below the threshold');
      h.mustFail({ type: 'SIDE_CHANGE_CONFIRMED', setNo: 3 }, 'SIDE_CHANGE_NOT_PENDING');
      h.mustFail({ type: 'SIDE_CHANGE_CONFIRMED', setNo: 1 }, 'SET_NO_MISMATCH');
      h.point(TEAM_A.id, 'OTHER');
      let board = h.board();
      expect(board.sideChangePending, '8 points triggers the deciding-set reminder');
      expect(
        board.nextAction.action === 'side_change_pending' && board.nextAction.threshold === 8,
        'the next action advertises the side change',
      );
      h.point(TEAM_B.id, 'OTHER');
      expect(h.board().sideChangePending, 'scoring is not blocked while the reminder is pending');
      h.mustApply({ type: 'SIDE_CHANGE_CONFIRMED', setNo: 3 });
      board = h.board();
      expect(!board.sideChangePending && board.sideChangeConfirmed, 'confirmation clears the reminder');
      expect(board.nextAction.action === 'rally_ready', 'scoring continues after confirmation');
      h.mustFail({ type: 'SIDE_CHANGE_CONFIRMED', setNo: 3 }, 'SIDE_CHANGE_NOT_PENDING');

      const custom = liveSet({ sideChangeDecidingSetAt: 5 });
      toDecidingSet(custom);
      scorePoints(custom, TEAM_A.id, 4);
      expect(!custom.board().sideChangePending, 'the custom threshold is not reached at 4');
      custom.point(TEAM_A.id, 'OTHER');
      const customBoard = custom.board();
      expect(customBoard.sideChangePending, 'the custom threshold triggers at 5');
      expect(
        customBoard.nextAction.action === 'side_change_pending' &&
          customBoard.nextAction.threshold === 5,
        'the custom threshold is advertised',
      );

      const finished = liveSet();
      toDecidingSet(finished);
      scorePoints(finished, TEAM_A.id, 15);
      board = finished.board();
      expect(board.phase === 'completed', 'the deciding set completed');
      expect(!board.sideChangePending, 'no side change is pending after the match is won');
      expect(!board.sideChangeConfirmed, 'side-change flags reset after completion');
      expect(board.serving === null, 'no live server is reported after completion');
    },
  );

  test(
    'TEST_TAKRAW_VOID',
    'Void: points, faults, set starts, tosses, lineups, substitutions, timeouts and decisions undo cleanly',
    'Corrections',
    () => {
      const h = liveSet();
      h.point(TEAM_A.id, 'OTHER');
      const pointId = lastEventId(h);
      expect(h.board().serving?.serveCount === 2, 'the point advanced the serve');
      h.mustApply({ type: 'VOID', targetEventId: pointId });
      let board = h.board();
      expect(pointsOf(board, TEAM_A.id) === 0, 'voiding the point removes it');
      expect(board.serving?.serveCount === 1, 'the serve rotation is recomputed');
      expect(
        board.activeEventCount === 5 && board.voidedEventCount === 1,
        'the event counters track the void',
      );
      h.mustFail({ type: 'VOID', targetEventId: pointId }, 'VOID_TARGET_INVALID');
      const voidId = lastEventId(h);
      h.mustFail({ type: 'VOID', targetEventId: voidId }, 'VOID_TARGET_INVALID');
      h.mustFail({ type: 'VOID', targetEventId: 'missing-event' }, 'VOID_TARGET_INVALID');

      h.fault(TEAM_A.id, 'BAD_THROW');
      const faultId = lastEventId(h);
      expect(pointsOf(h.board(), TEAM_B.id) === 1, 'the fault scored for B');
      h.mustApply({ type: 'VOID', targetEventId: faultId });
      expect(pointsOf(h.board(), TEAM_B.id) === 0, 'voiding the fault removes its point');
      expect(h.board().serving?.serveCount === 1, 'the voided fault no longer consumes a serve');

      const setStart = liveSet();
      setStart.point(TEAM_A.id, 'OTHER');
      const setStartId = eventIdOf(setStart, 'SET_START');
      setStart.mustApply({ type: 'VOID', targetEventId: setStartId });
      board = setStart.board();
      expect(
        board.sets.length === 0 && board.phase === 'awaiting_set_start',
        'voiding SET_START removes the set',
      );
      expect(pointsOf(board, TEAM_A.id) === 0, 'orphaned points do not count');
      setStart.startSet(1);
      expect(
        setStart.board().phase === 'set_live' && pointsOf(setStart.board(), TEAM_A.id) === 0,
        'the set can start again from zero',
      );

      const toss = new Harness();
      toss.toss(TEAM_A.id, 'SERVE');
      toss.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
      toss.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      toss.startSet(1);
      const tossId = eventIdOf(toss, 'TOSS');
      toss.mustApply({ type: 'VOID', targetEventId: tossId });
      board = toss.board();
      expect(
        board.phase === 'awaiting_toss' && board.serving === null,
        'voiding the toss reopens the toss gate',
      );
      toss.mustFail({ type: 'SET_START', setNo: 1 }, 'TOSS_REQUIRED');
      toss.toss(TEAM_B.id, 'SERVE');
      toss.startSet(1);
      expect(toss.board().serving?.teamId === TEAM_B.id, 'the replacement toss decides the server');

      const lineup = new Harness();
      lineup.toss(TEAM_A.id, 'SERVE');
      lineup.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
      lineup.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      const lineupBId = eventIdOf(lineup, 'LINEUP_SET', 1);
      lineup.mustApply({ type: 'VOID', targetEventId: lineupBId });
      expect(lineup.board().phase === 'awaiting_lineups', 'voiding the B lineup reopens the lineup gate');
      lineup.mustFail({ type: 'SET_START', setNo: 1 }, 'LINEUP_REQUIRED');
      lineup.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      lineup.startSet(1);

      const sub = liveSet();
      sub.mustApply({
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: 'a-striker',
        inPlayerId: 'a-sub1',
      });
      sub.point(TEAM_A.id, 'ATTACK', 'a-sub1');
      const subId = eventIdOf(sub, 'SUBSTITUTION');
      sub.mustApply({ type: 'VOID', targetEventId: subId });
      sub.mustFail(
        { type: 'POINT', pointType: 'ATTACK', scoringTeamId: TEAM_A.id, playerId: 'a-sub1' },
        'PLAYER_NOT_ON_COURT',
      );
      sub.point(TEAM_A.id, 'ATTACK', 'a-striker');

      const timeout = liveSet();
      timeout.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });
      timeout.mustFail({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 }, 'TIMEOUT_LIMIT');
      const timeoutId = lastEventId(timeout);
      timeout.mustApply({ type: 'VOID', targetEventId: timeoutId });
      expect(timeout.board().timeoutsUsed[TEAM_A.id] === 0, 'voiding the timeout refunds it');
      timeout.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });

      const manual = liveSet();
      manual.point(TEAM_A.id, 'OTHER');
      manual.mustApply({
        type: 'MANUAL_DECISION',
        winnerTeamId: TEAM_B.id,
        reason: 'Walkover',
      });
      expect(manual.board().winner.kind === 'manual', 'the manual decision resolves the match');
      const manualId = lastEventId(manual);
      manual.mustApply({ type: 'VOID', targetEventId: manualId });
      board = manual.board();
      expect(
        board.phase === 'set_live' && !board.winner.resolved,
        'voiding the manual decision reopens the match',
      );
      manual.point(TEAM_B.id, 'OTHER');
      expect(pointsOf(manual.board(), TEAM_B.id) === 1, 'scoring resumes after the void');

      const winning = liveSet();
      scorePoints(winning, TEAM_A.id, 21);
      winning.startSet(2);
      scorePoints(winning, TEAM_A.id, 20);
      winning.point(TEAM_A.id, 'OTHER');
      const winningPointId = lastEventId(winning);
      expect(winning.board().phase === 'completed', 'the match completed');
      winning.mustApply({ type: 'VOID', targetEventId: winningPointId });
      board = winning.board();
      expect(
        board.phase === 'set_live' && !board.winner.resolved,
        'voiding the winning point reopens the set',
      );
      expect(
        board.sets[1]?.completed === false && pointsOf(board, TEAM_A.id) === 20,
        'the set is live again at 20',
      );
      expect(board.serving !== null, 'the live server is restored');
    },
  );

  test(
    'TEST_TAKRAW_IDEMPOTENT_EVENT_ID',
    'Event ids are idempotent: replaying the same event is a no-op returning the same state',
    'Corrections',
    () => {
      const h = liveSet();
      const event: SepakTakrawScoreEvent = {
        eventId: 'fixed-point-1',
        atMs: h.t,
        type: 'POINT',
        pointType: 'ATTACK',
        scoringTeamId: TEAM_A.id,
        playerId: 'a-striker',
      };
      const once = sepakTakrawScoringEngine.applyEvent(h.state, event);
      const twice = sepakTakrawScoringEngine.applyEvent(once, event);
      expect(twice === once, 'a duplicate eventId returns the same state object');
      expect(twice.events.length === once.events.length, 'the duplicate is not appended');
      expect(
        pointsOf(sepakTakrawScoringEngine.getScoreboard(twice), TEAM_A.id) === 1,
        'the point counted once',
      );
      const attackRow = sepakTakrawScoringEngine
        .getPlayerStats(twice)
        .find((row) => row.teamId === TEAM_A.id && row.playerId === 'a-striker');
      expect(attackRow?.values.attacks === 1, 'stats counted the event once');

      const replayed = sepakTakrawScoringEngine.applyEvent(once, {
        ...event,
        atMs: event.atMs + 5000,
      });
      expect(replayed === once, 'a duplicate id is a no-op even with a different timestamp');

      const distinct = sepakTakrawScoringEngine.applyEvent(once, {
        ...event,
        eventId: 'fixed-point-2',
      });
      expect(distinct !== once && distinct.events.length === once.events.length + 1, 'a new id is applied');
      expect(
        pointsOf(sepakTakrawScoringEngine.getScoreboard(distinct), TEAM_A.id) === 2,
        'the second point counts',
      );

      const voidEvent: SepakTakrawScoreEvent = {
        eventId: 'fixed-void-1',
        atMs: h.t,
        type: 'VOID',
        targetEventId: event.eventId,
      };
      const voided = sepakTakrawScoringEngine.applyEvent(distinct, voidEvent);
      const voidedAgain = sepakTakrawScoringEngine.applyEvent(voided, voidEvent);
      expect(voidedAgain === voided, 'a duplicate VOID is a no-op');
      expect(
        sepakTakrawScoringEngine.getScoreboard(voided).voidedEventCount === 1,
        'the void counted once',
      );
    },
  );

  test(
    'TEST_TAKRAW_ATTRIBUTION',
    'Attribution: retarget and clear points/faults, with Tekong and lineup-history guards',
    'Corrections',
    () => {
      const h = liveSet();
      h.point(TEAM_A.id, 'ATTACK', 'a-striker');
      const attackId = lastEventId(h);
      expect(
        statValue(h, TEAM_A.id, 'a-striker', 'attacks') === 1,
        'the direct attribution lands on the striker',
      );
      h.mustApply({ type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: 'a-feeder' });
      expect(statValue(h, TEAM_A.id, 'a-striker', 'attacks') === 0, 'retargeting clears the original player');
      expect(statValue(h, TEAM_A.id, 'a-feeder', 'attacks') === 1, 'retargeting credits the new player');
      h.mustApply({ type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: 'a-tekong' });
      expect(statValue(h, TEAM_A.id, 'a-feeder', 'attacks') === 0, 'the latest attribution wins');
      expect(statValue(h, TEAM_A.id, 'a-tekong', 'attacks') === 1, 'the latest player is credited');
      h.mustApply({ type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: null });
      expect(statValue(h, TEAM_A.id, null, 'attacks') === 1, 'null clears to the unassigned row');
      expect(statValue(h, TEAM_A.id, 'a-tekong', 'attacks') === 0, 'clearing removes the player credit');

      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: 'ghost-player' },
        'ATTRIBUTION_NOT_ALLOWED',
      );
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: 'b-tekong' },
        'ATTRIBUTION_NOT_ALLOWED',
      );
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: 'missing', playerId: 'a-feeder' },
        'ATTRIBUTION_NOT_ALLOWED',
      );
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: eventIdOf(h, 'TOSS'), playerId: 'a-feeder' },
        'ATTRIBUTION_NOT_ALLOWED',
      );

      h.point(TEAM_A.id, 'OTHER');
      const otherId = lastEventId(h);
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: otherId, playerId: 'a-feeder' },
        'ATTRIBUTION_NOT_ALLOWED',
      );

      h.point(TEAM_A.id, 'ACE', 'a-tekong');
      const aceId = lastEventId(h);
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: aceId, playerId: 'a-feeder' },
        'NOT_TEKONG',
      );
      h.mustApply({ type: 'PLAYER_ATTRIBUTION', targetEventId: aceId, playerId: 'a-tekong' });

      h.fault(TEAM_A.id, 'FOUR_TOUCHES');
      const faultId = lastEventId(h);
      expect(statValue(h, TEAM_A.id, null, 'faults') === 1, 'the unattributed fault lands on the team row');
      h.mustApply({ type: 'PLAYER_ATTRIBUTION', targetEventId: faultId, playerId: 'a-feeder' });
      expect(statValue(h, TEAM_A.id, 'a-feeder', 'faults') === 1, 'the fault is attributed to the player');
      expect(statValue(h, TEAM_A.id, null, 'faults') === 0, 'the unassigned fault is cleared');
      const faultAttributionId = lastEventId(h);
      h.mustApply({ type: 'VOID', targetEventId: faultAttributionId });
      expect(statValue(h, TEAM_A.id, null, 'faults') === 1, 'voiding the attribution restores the team row');

      h.mustApply({ type: 'VOID', targetEventId: attackId });
      h.mustFail(
        { type: 'PLAYER_ATTRIBUTION', targetEventId: attackId, playerId: 'a-feeder' },
        'ATTRIBUTION_NOT_ALLOWED',
      );

      const done = liveSet();
      scorePoints(done, TEAM_A.id, 21);
      done.startSet(2);
      scorePoints(done, TEAM_A.id, 20);
      done.point(TEAM_A.id, 'ATTACK', 'a-striker');
      const winningAttackId = lastEventId(done);
      expect(done.board().phase === 'completed', 'the match completed');
      done.mustApply({
        type: 'PLAYER_ATTRIBUTION',
        targetEventId: winningAttackId,
        playerId: 'a-feeder',
      });
      expect(
        statValue(done, TEAM_A.id, 'a-feeder', 'attacks') === 1 &&
          statValue(done, TEAM_A.id, 'a-feeder', 'points') === 1,
        'attribution is allowed after completion',
      );
    },
  );

  test(
    'TEST_TAKRAW_SUBSTITUTION',
    'Substitutions: swap court players, inherit roles, and let the outgoing player return',
    'Match Setup',
    () => {
      const h = liveSet();
      h.mustApply({
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: 'a-striker',
        inPlayerId: 'a-sub1',
      });
      h.point(TEAM_A.id, 'ATTACK', 'a-sub1');
      h.mustFail(
        { type: 'POINT', pointType: 'ATTACK', scoringTeamId: TEAM_A.id, playerId: 'a-striker' },
        'PLAYER_NOT_ON_COURT',
      );
      h.mustApply({
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: 'a-sub1',
        inPlayerId: 'a-striker',
      });
      h.point(TEAM_A.id, 'ATTACK', 'a-striker');
      h.mustFail(
        { type: 'POINT', pointType: 'ATTACK', scoringTeamId: TEAM_A.id, playerId: 'a-sub1' },
        'PLAYER_NOT_ON_COURT',
      );

      const tekong = liveSet();
      tekong.mustApply({
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: 'a-tekong',
        inPlayerId: 'a-sub2',
      });
      expect(tekong.board().serving?.playerId === 'a-sub2', 'the substitute inherits the Tekong role');
      tekong.point(TEAM_A.id, 'ACE', 'a-sub2');
      tekong.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_A.id, playerId: 'a-tekong' },
        'NOT_TEKONG',
      );

      const invalid = liveSet();
      invalid.mustFail(
        { type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: 'a-sub1', inPlayerId: 'a-sub2' },
        'PLAYER_NOT_ON_COURT',
      );
      invalid.mustFail(
        { type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: 'a-striker', inPlayerId: 'a-tekong' },
        'PLAYER_NOT_A_SUB',
      );
      invalid.mustFail(
        { type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: 'a-striker' },
        'MALFORMED_EVENT',
      );
      invalid.mustFail(
        { type: 'SUBSTITUTION', teamId: 'ghost', outPlayerId: 'a-striker', inPlayerId: 'a-sub1' },
        'TEAM_NOT_FOUND',
      );

      const early = new Harness();
      early.toss(TEAM_A.id, 'SERVE');
      early.mustFail(
        { type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: 'a-striker', inPlayerId: 'a-sub1' },
        'SET_NOT_STARTED',
      );

      const done = liveSet();
      scorePoints(done, TEAM_A.id, 21);
      done.startSet(2);
      scorePoints(done, TEAM_A.id, 21);
      done.mustFail(
        { type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: 'a-striker', inPlayerId: 'a-sub1' },
        'MATCH_COMPLETED',
      );
    },
  );

  test(
    'TEST_TAKRAW_ROLE_SWAP',
    'Role swaps: exchange court roles live, move the Tekong, and persist into the next set',
    'Match Setup',
    () => {
      const h = liveSet();
      h.mustApply({
        type: 'ROLE_SWAP',
        teamId: TEAM_A.id,
        playerId: 'a-tekong',
        withPlayerId: 'a-striker',
      });
      expect(h.board().serving?.playerId === 'a-striker', 'the swapped striker becomes the Tekong');
      h.point(TEAM_A.id, 'ACE', 'a-striker');
      h.mustFail(
        { type: 'POINT', pointType: 'ACE', scoringTeamId: TEAM_A.id, playerId: 'a-tekong' },
        'NOT_TEKONG',
      );
      h.mustApply({
        type: 'ROLE_SWAP',
        teamId: TEAM_A.id,
        playerId: 'a-tekong',
        withPlayerId: 'a-striker',
      });
      expect(h.board().serving?.playerId === 'a-tekong', 'swapping back restores the original Tekong');

      const invalid = liveSet();
      invalid.mustFail(
        { type: 'ROLE_SWAP', teamId: TEAM_A.id, playerId: 'a-tekong', withPlayerId: 'a-tekong' },
        'MALFORMED_EVENT',
      );
      invalid.mustFail(
        { type: 'ROLE_SWAP', teamId: TEAM_A.id, playerId: 'a-tekong', withPlayerId: 'a-sub1' },
        'PLAYER_NOT_ON_COURT',
      );
      invalid.mustFail(
        { type: 'ROLE_SWAP', teamId: TEAM_A.id, playerId: 'a-tekong' },
        'MALFORMED_EVENT',
      );
      invalid.mustFail(
        { type: 'ROLE_SWAP', teamId: 'ghost', playerId: 'a-tekong', withPlayerId: 'a-striker' },
        'TEAM_NOT_FOUND',
      );

      const early = new Harness();
      early.toss(TEAM_A.id, 'SERVE');
      early.mustFail(
        { type: 'ROLE_SWAP', teamId: TEAM_A.id, playerId: 'a-tekong', withPlayerId: 'a-striker' },
        'SET_NOT_STARTED',
      );

      const persist = liveSet({ firstServeAlternate: false });
      persist.mustApply({
        type: 'ROLE_SWAP',
        teamId: TEAM_A.id,
        playerId: 'a-tekong',
        withPlayerId: 'a-striker',
      });
      scorePoints(persist, TEAM_A.id, 21);
      persist.startSet(2);
      expect(persist.board().serving?.teamId === TEAM_A.id, 'A serves first in set 2 with alternation off');
      expect(
        persist.board().serving?.playerId === 'a-striker',
        'the swapped role persists into the next set',
      );

      const done = liveSet();
      scorePoints(done, TEAM_A.id, 21);
      done.startSet(2);
      scorePoints(done, TEAM_A.id, 21);
      done.mustFail(
        { type: 'ROLE_SWAP', teamId: TEAM_A.id, playerId: 'a-tekong', withPlayerId: 'a-striker' },
        'MATCH_COMPLETED',
      );
    },
  );

  test(
    'TEST_TAKRAW_TIMEOUTS',
    'Timeouts: one per team per set, reset at the next set, and configurable limits',
    'Scoring Rules',
    () => {
      const h = liveSet();
      const servingBefore = h.board().serving?.teamId;
      h.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });
      expect(h.board().timeoutsUsed[TEAM_A.id] === 1, 'the timeout is recorded');
      expect(h.board().serving?.teamId === servingBefore, 'a timeout does not change the server');
      h.mustFail({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 }, 'TIMEOUT_LIMIT');
      h.mustApply({ type: 'TIMEOUT', teamId: TEAM_B.id, setNo: 1 });
      expect(h.board().timeoutsUsed[TEAM_B.id] === 1, 'each team has its own allowance');
      h.mustFail({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 2 }, 'SET_NO_MISMATCH');
      h.mustFail({ type: 'TIMEOUT', teamId: 'ghost', setNo: 1 }, 'TEAM_NOT_FOUND');

      scorePoints(h, TEAM_A.id, 21);
      h.startSet(2);
      expect(h.board().timeoutsUsed[TEAM_A.id] === 0, 'timeouts reset for the new set');
      h.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 2 });

      const two = liveSet({ timeoutsPerSet: 2 });
      two.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });
      two.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });
      two.mustFail({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 }, 'TIMEOUT_LIMIT');

      const early = new Harness();
      early.toss(TEAM_A.id, 'SERVE');
      early.mustFail({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 }, 'SET_NOT_STARTED');
    },
  );

  test(
    'TEST_TAKRAW_MANUAL_DECISION',
    'Manual decisions: reason required, resolve or forfeit the match, and reopen when voided',
    'Match Completion',
    () => {
      const walkover = new Harness();
      walkover.mustFail(
        { type: 'MANUAL_DECISION', winnerTeamId: TEAM_A.id, reason: '   ' },
        'REASON_REQUIRED',
      );
      walkover.mustFail(
        { type: 'MANUAL_DECISION', winnerTeamId: TEAM_A.id },
        'REASON_REQUIRED',
      );
      walkover.mustFail(
        { type: 'MANUAL_DECISION', winnerTeamId: 'ghost', reason: 'Walkover' },
        'TEAM_NOT_FOUND',
      );
      walkover.mustApply({
        type: 'MANUAL_DECISION',
        winnerTeamId: TEAM_A.id,
        reason: 'Opponent did not arrive',
      });
      let board = walkover.board();
      expect(board.phase === 'completed', 'a walkover completes the match');
      expect(
        board.winner.kind === 'manual' && board.winner.winnerTeamId === TEAM_A.id,
        'the manual winner is recorded',
      );
      expect(board.winner.label === 'WON BY DECISION', 'the manual winner label');
      expect(board.nextAction.action === 'completed', 'there is no next action after a decision');
      walkover.mustFail(
        { type: 'POINT', pointType: 'OTHER', scoringTeamId: TEAM_A.id },
        'MATCH_COMPLETED',
      );
      walkover.mustFail(
        { type: 'MANUAL_DECISION', winnerTeamId: TEAM_B.id, reason: 'Again' },
        'MATCH_COMPLETED',
      );

      const midSet = liveSet();
      scoreAlternatingTo(midSet, 20, 20);
      midSet.mustApply({
        type: 'MANUAL_DECISION',
        winnerTeamId: TEAM_B.id,
        reason: 'Team A forfeits',
      });
      board = midSet.board();
      expect(
        board.phase === 'completed' && board.winner.winnerTeamId === TEAM_B.id,
        'a mid-set forfeit resolves the match',
      );
      expect(
        pointsOf(board, TEAM_A.id) === 20 && pointsOf(board, TEAM_B.id) === 20,
        'the score is preserved',
      );
      expect(board.serving === null, 'no server is reported after completion');
      expect(!board.deuce, 'deuce is cleared after completion');
      expect(!board.sideChangePending, 'side-change reminders are cleared after completion');

      const manualId = lastEventId(midSet);
      midSet.mustApply({ type: 'VOID', targetEventId: manualId });
      board = midSet.board();
      expect(
        board.phase === 'set_live' && !board.winner.resolved,
        'voiding the decision reopens the match',
      );
      expect(board.deuce && board.serving !== null, 'the live deuce state returns');
      midSet.point(TEAM_A.id, 'OTHER');
      expect(pointsOf(midSet.board(), TEAM_A.id) === 21, 'scoring resumes');

      const deciding = liveSet();
      toDecidingSet(deciding);
      scorePoints(deciding, TEAM_A.id, 8);
      expect(deciding.board().sideChangePending, 'the side change is pending at 8');
      deciding.mustApply({
        type: 'MANUAL_DECISION',
        winnerTeamId: TEAM_B.id,
        reason: 'Injury walkover',
      });
      expect(!deciding.board().sideChangePending, 'completion clears the pending side change');
      expect(!deciding.board().sideChangeConfirmed, 'completion clears the confirmation flag');
    },
  );

  test(
    'TEST_TAKRAW_STATS',
    'Player stats: columns, roster rows, credited points/faults, and voided events excluded',
    'Stats',
    () => {
      const columns = sepakTakrawScoringEngine.statColumns();
      expect(columns.length === 6, 'six stat columns');
      expect(
        columns.map((column) => column.key).join(',') ===
          'points,aces,attacks,blocks,faults,serviceFaults',
        'the column keys are stable',
      );
      expect(
        columns.every((column) => column.kind === 'count' && column.align === 'end'),
        'every column is an end-aligned count',
      );

      const empty = new Harness();
      const emptyRows = sepakTakrawScoringEngine.getPlayerStats(empty.state);
      expect(emptyRows.length === 2, 'one unassigned row per team before lineups');
      expect(
        emptyRows.every((row) => row.playerId === null && row.jerseyNumber === null),
        'the empty rows are unassigned and jersey-less',
      );

      const h = liveSet();
      h.point(TEAM_A.id, 'ACE', 'a-tekong');
      h.point(TEAM_A.id, 'ATTACK', 'a-striker');
      h.fault(TEAM_A.id, 'BAD_THROW', 'a-feeder');
      h.point(TEAM_B.id, 'BLOCK', 'b-striker');
      h.point(TEAM_A.id, 'OTHER');
      h.fault(TEAM_B.id, 'FOUR_TOUCHES');
      h.fault(TEAM_A.id, 'CROSSING_THE_NET', 'a-tekong');
      const blockEvent = h.state.events.find(
        (event) => event.type === 'POINT' && event.pointType === 'BLOCK',
      );
      if (!blockEvent) throw new Error('the block event was not recorded');

      const rows = sepakTakrawScoringEngine.getPlayerStats(h.state);
      expect(rows.length === 12, 'five roster players plus an unassigned row per team');
      expect(rows.every((row) => row.jerseyNumber === null), 'the engine has no jersey data');
      expect(statValue(h, TEAM_A.id, 'a-tekong', 'points') === 1, 'the ace point is credited');
      expect(statValue(h, TEAM_A.id, 'a-tekong', 'aces') === 1, 'the ace is counted');
      expect(statValue(h, TEAM_A.id, 'a-tekong', 'faults') === 1, 'the boundary fault is credited');
      expect(
        statValue(h, TEAM_A.id, 'a-tekong', 'serviceFaults') === 0,
        'a boundary fault is not a service fault',
      );
      expect(
        statValue(h, TEAM_A.id, 'a-striker', 'points') === 1 &&
          statValue(h, TEAM_A.id, 'a-striker', 'attacks') === 1,
        'the attack is credited',
      );
      expect(
        statValue(h, TEAM_A.id, 'a-feeder', 'faults') === 1 &&
          statValue(h, TEAM_A.id, 'a-feeder', 'serviceFaults') === 1,
        'the service fault is credited',
      );
      expect(
        statValue(h, TEAM_B.id, 'b-striker', 'points') === 1 &&
          statValue(h, TEAM_B.id, 'b-striker', 'blocks') === 1,
        'the block is credited',
      );
      expect(statValue(h, TEAM_B.id, null, 'faults') === 1, 'the unattributed play fault lands on the team row');
      expect(statValue(h, TEAM_A.id, null, 'points') === 0, 'OTHER points are not credited to a player row');
      expect(statValue(h, TEAM_A.id, 'a-sub1', 'points') === 0, 'unused substitutes have empty rows');

      h.mustApply({ type: 'VOID', targetEventId: blockEvent.eventId });
      expect(statValue(h, TEAM_B.id, 'b-striker', 'blocks') === 0, 'the voided block is excluded');
      expect(statValue(h, TEAM_B.id, 'b-striker', 'points') === 0, 'the voided block point is excluded');
    },
  );

  test(
    'TEST_TAKRAW_UNDO_TARGET',
    'Undo target: the last active event, null after a void, and still available after completion',
    'Corrections',
    () => {
      const h = new Harness();
      expect(sepakTakrawScoringEngine.getUndoTarget(h.state) === null, 'a fresh state has nothing to undo');
      expect(!sepakTakrawScoringEngine.canUndo(h.state), 'canUndo is false on a fresh state');

      h.toss(TEAM_A.id, 'SERVE');
      expect(sepakTakrawScoringEngine.getUndoTarget(h.state)?.type === 'TOSS', 'the toss is undoable');
      h.lineup(TEAM_A.id, LINEUP_A, SUBS_A);
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state)?.type === 'LINEUP_SET',
        'the latest lineup is undoable',
      );
      h.lineup(TEAM_B.id, LINEUP_B, SUBS_B);
      h.startSet(1);
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state)?.type === 'SET_START',
        'the set start is undoable',
      );
      h.point(TEAM_A.id, 'OTHER');
      const firstPoint = lastEventId(h);
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state)?.eventId === firstPoint,
        'the point is undoable',
      );
      h.point(TEAM_B.id, 'OTHER');
      h.mustApply({ type: 'VOID', targetEventId: firstPoint });
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state) === null,
        'a trailing VOID event is itself the last active event',
      );
      expect(
        pointsOf(h.board(), TEAM_A.id) === 0 && pointsOf(h.board(), TEAM_B.id) === 1,
        'voiding an earlier point keeps the later point',
      );
      h.fault(TEAM_A.id, 'FOUR_TOUCHES');
      const faultId = lastEventId(h);
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state)?.eventId === faultId,
        'the fault is undoable',
      );
      h.mustApply({ type: 'VOID', targetEventId: faultId });
      expect(sepakTakrawScoringEngine.getUndoTarget(h.state) === null, 'a trailing void is not undoable');
      expect(!sepakTakrawScoringEngine.canUndo(h.state), 'canUndo is false after a void');
      h.mustApply({ type: 'TIMEOUT', teamId: TEAM_A.id, setNo: 1 });
      expect(
        sepakTakrawScoringEngine.getUndoTarget(h.state)?.type === 'TIMEOUT',
        'the timeout is undoable after a void',
      );

      const sweep = liveSet();
      scorePoints(sweep, TEAM_A.id, 21);
      sweep.startSet(2);
      scorePoints(sweep, TEAM_A.id, 21);
      expect(sweep.board().phase === 'completed', 'the sweep completed');
      expect(
        sepakTakrawScoringEngine.getUndoTarget(sweep.state)?.type === 'POINT',
        'the winning point remains undoable',
      );
      expect(sepakTakrawScoringEngine.canUndo(sweep.state), 'canUndo is true after completion');
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
