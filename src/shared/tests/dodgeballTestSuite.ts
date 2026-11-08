/**
 * Pure dodgeball scoring engine tests for the DSO rules:
 * - no toss and no jersey numbers (Player 1-6 auto lineups);
 * - two 1:30 sets, third set only when the first two are level;
 * - three balls per team;
 * - team-only points (no individual player points);
 * - draws are valid set results; no extra time or sudden death.
 *
 * Framework-free, synchronous; registered in the server runner and the
 * /api/tests/run in-browser fallback like the kho-kho and sepak-takraw suites.
 */
import { dodgeballScoringEngine } from '../scoring/sports/dodgeball/engine.ts';
import {
  DEFAULT_DODGEBALL_SCORING_CONFIG,
  type DodgeballScoreEvent,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
  type DodgeballScoringState,
} from '../scoring/sports/dodgeball/types.ts';
import { TestResult, TestSuiteSummary } from './testSuite.ts';

const TEAM_A = { id: 'team-a', name: 'Alpha Vidya Mandir' };
const TEAM_B = { id: 'team-b', name: 'Beta Vidya Mandir' };

const PLAYERS_A = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const PLAYERS_B = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const LEGACY_LINEUP_A = ['1', '2', '3', '4', '5', '6'];
const LEGACY_LINEUP_B = ['1', '2', '3', '4', '5', '6'];

type PartialEvent = Record<string, unknown> & { type: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class Harness {
  state: DodgeballScoringState;
  clock = 0;
  private seq = 0;

  constructor(config?: Partial<DodgeballScoringConfig>) {
    this.state = dodgeballScoringEngine.createInitialState({
      teams: [TEAM_A, TEAM_B],
      config,
    });
  }

  at(step = 1000): number {
    this.clock += step;
    return this.clock;
  }

  apply(payload: PartialEvent, atMs?: number): DodgeballScoreEvent {
    const when = atMs ?? this.at();
    this.clock = Math.max(this.clock, when);
    const event = {
      eventId: `ev-${++this.seq}`,
      atMs: when,
      ...payload,
    } as unknown as DodgeballScoreEvent;
    this.state = dodgeballScoringEngine.applyEvent(this.state, event);
    return event;
  }

  reject(code: string, payload: PartialEvent, atMs?: number): void {
    const when = atMs ?? this.at();
    const event = {
      eventId: `reject-${++this.seq}`,
      atMs: when,
      ...payload,
    } as unknown as DodgeballScoreEvent;
    try {
      dodgeballScoringEngine.validateEvent(this.state, event);
    } catch (err) {
      const rule = err as { code?: string; message?: string };
      if (rule.code !== code) {
        throw new Error(
          `expected rejection ${code} but got ${rule.code}: ${rule.message}`,
        );
      }
      return;
    }
    throw new Error(`expected rejection ${code} but the event was accepted`);
  }

  board(nowMs?: number): DodgeballScoreboard {
    return dodgeballScoringEngine.getScoreboard(this.state, nowMs);
  }

  beginSet(setNo = 1): number {
    const at = this.at();
    this.apply({ type: 'SET_START', setNo }, at);
    return at;
  }

  startMatch(): number {
    // DSO dodgeball has no toss and no lineup screen.
    return this.beginSet(1);
  }

  hit(teamId: string, targetPlayerId: string): DodgeballScoreEvent {
    return this.apply({
      type: 'HIT',
      teamId,
      targetPlayerId,
    });
  }

  allOut(teamId: string, targetTeamId: string, players = PLAYERS_B): void {
    for (const target of players) {
      this.hit(teamId, target);
    }
    assert(
      this.board().teamStates.find((team) => team.teamId === targetTeamId)
        ?.activeCount === 0,
      'expected the target team to be all out',
    );
  }
}

export function runDodgeballTestSuite(): TestSuiteSummary {
  const results: TestResult[] = [];
  const startAll = Date.now();

  const check = (id: string, name: string, fn: () => void) => {
    const start = Date.now();
    let passed = true;
    let message = '';
    try {
      fn();
    } catch (err) {
      passed = false;
      message = err instanceof Error ? err.message : String(err);
    }
    results.push({
      id,
      name,
      category: 'Dodgeball Engine',
      passed,
      message,
      durationMs: Date.now() - start,
    });
  };

  check(
    'TEST_DODGEBALL_DEFAULT_CONFIG',
    'dodgeball: DSO defaults are 2 sets of 1:30, 3 balls, 6 anonymous players',
    () => {
      const cfg = dodgeballScoringEngine.createInitialState({
        teams: [TEAM_A, TEAM_B],
      }).config;
      assert(cfg.regulationSets === 2, `regulationSets=${cfg.regulationSets}`);
      assert(cfg.decidingSetOnTie, 'a deciding set should be enabled');
      assert(cfg.setDurationSec === 90, `setDurationSec=${cfg.setDurationSec}`);
      assert(cfg.ballsPerTeam === 3, `ballsPerTeam=${cfg.ballsPerTeam}`);
      assert(cfg.playersOnCourt === 6, `playersOnCourt=${cfg.playersOnCourt}`);
      assert(
        cfg.suddenDeathEnabled === false,
        'sudden death should be disabled',
      );
      assert(cfg.extraTimeSec === 0, `extraTimeSec=${cfg.extraTimeSec}`);
      assert(
        DEFAULT_DODGEBALL_SCORING_CONFIG.setDurationSec === 90,
        'default export should match',
      );
    },
  );

  check(
    'TEST_DODGEBALL_NO_TOSS_REQUIRED',
    'dodgeball: a set starts without a toss',
    () => {
      const h = new Harness();
      h.apply({ type: 'SET_START', setNo: 1 });
      const sb = h.board();
      assert(sb.phase === 'set_live', `phase=${sb.phase}`);
      assert(sb.time?.remainingMs === 90000, `remaining=${sb.time?.remainingMs}`);
    },
  );

  check(
    'TEST_DODGEBALL_AUTO_LINEUPS',
    'dodgeball: both teams field six anonymous players without jersey numbers',
    () => {
      const h = new Harness();
      h.startMatch();
      const sb = h.board();
      const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(a.activeCount === 6 && b.activeCount === 6, 'both teams need six');
      assert(
        PLAYERS_A.every((playerId) => a.onCourt.includes(playerId)),
        `A onCourt=${JSON.stringify(a.onCourt)}`,
      );
      assert(
        PLAYERS_B.every((playerId) => b.onCourt.includes(playerId)),
        `B onCourt=${JSON.stringify(b.onCourt)}`,
      );
      assert(a.balls === 3 && b.balls === 3, 'each team needs three balls');
    },
  );

  check(
    'TEST_DODGEBALL_SET_CLOCK_1_30',
    'dodgeball: set start opens a 1:30 clock',
    () => {
      const h = new Harness();
      const startedAt = h.startMatch();
      const sb = h.board(startedAt);
      assert(sb.time?.period === 'regulation', `period=${sb.time?.period}`);
      assert(sb.time?.remainingMs === 90000, `remaining=${sb.time?.remainingMs}`);
      assert(sb.setNo === 1, `setNo=${sb.setNo}`);
    },
  );

  check(
    'TEST_DODGEBALL_HIT_POINT_AND_OUT',
    'dodgeball: a hit scores for the team and puts the target out',
    () => {
      const h = new Harness();
      h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      const sb = h.board();
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
      assert(b.activeCount === 5, `active=${b.activeCount}`);
      assert(b.outPlayerIds.includes('p2'), `out=${JSON.stringify(b.outPlayerIds)}`);
      const stats = dodgeballScoringEngine.getPlayerStats(h.state);
      assert(
        stats.every((row) => row.playerId === null),
        'stats must be team-only',
      );
      const aRow = stats.find((row) => row.teamId === TEAM_A.id)!;
      const bRow = stats.find((row) => row.teamId === TEAM_B.id)!;
      assert(aRow.values.points === 1 && aRow.values.hits === 1, 'team hit stats missing');
      assert(bRow.values.outs === 1, 'team out stats missing');
    },
  );

  check(
    'TEST_DODGEBALL_TEAM_POINT_ONLY',
    'dodgeball: a team point adds to the team with no player selection or out',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({ type: 'TEAM_POINT', teamId: TEAM_A.id });
      h.apply({ type: 'TEAM_POINT', teamId: TEAM_A.id, points: 2 });
      const sb = h.board();
      assert(sb.points[TEAM_A.id] === 3, `points=${sb.points[TEAM_A.id]}`);
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(b.activeCount === 6, 'a team point must not put anyone out');
      const stats = dodgeballScoringEngine.getPlayerStats(h.state);
      assert(stats.length === 2, `rows=${stats.length}`);
      assert(
        stats.every((row) => row.playerId === null && row.jerseyNumber === null),
        'team point stats must be team-only',
      );
      const aRow = stats.find((row) => row.teamId === TEAM_A.id)!;
      assert(aRow.values.points === 3, `A points=${aRow.values.points}`);
      assert(aRow.values.hits === 0, 'a team point is not a hit');
      h.reject('MALFORMED_EVENT', {
        type: 'TEAM_POINT',
        teamId: TEAM_A.id,
        points: 0,
      });
    },
  );

  check(
    'TEST_DODGEBALL_HIT_REJECTS_OUT_TARGET',
    'dodgeball: an already-out player cannot be hit again',
    () => {
      const h = new Harness();
      h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      h.reject('TARGET_NOT_ACTIVE', {
        type: 'HIT',
        teamId: TEAM_A.id,
        targetPlayerId: 'p2',
      });
    },
  );

  check(
    'TEST_DODGEBALL_LINE_OUT_POINT',
    'dodgeball: a line-out scores for the opponent and puts the offender out',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({ type: 'LINE_OUT', teamId: TEAM_A.id, targetPlayerId: 'p3' });
      const sb = h.board();
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
      assert(b.outPlayerIds.includes('p3'), `out=${JSON.stringify(b.outPlayerIds)}`);
    },
  );

  check(
    'TEST_DODGEBALL_CATCH_OUT_AND_REVIVE',
    'dodgeball: a catch puts the thrower out and revives one team-mate',
    () => {
      const h = new Harness();
      h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      assert(
        h
          .board()
          .teamStates.find((team) => team.teamId === TEAM_B.id)
          ?.outPlayerIds.includes('p2'),
        'setup: B p2 should be out',
      );
      h.apply({
        type: 'CATCH',
        teamId: TEAM_B.id,
        playerId: 'p1',
        throwerTeamId: TEAM_A.id,
        throwerPlayerId: 'p3',
        revivePlayerId: 'p2',
      });
      const sb = h.board();
      const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(a.outPlayerIds.includes('p3'), `A out=${JSON.stringify(a.outPlayerIds)}`);
      assert(b.activePlayerIds.includes('p2'), 'B p2 should be revived');
      const stats = dodgeballScoringEngine.getPlayerStats(h.state);
      assert(
        stats.find((row) => row.teamId === TEAM_B.id)?.values.catches === 1,
        'team catch stat missing',
      );
      assert(
        stats.find((row) => row.teamId === TEAM_B.id)?.values.revives === 1,
        'team revive stat missing',
      );
    },
  );

  check(
    'TEST_DODGEBALL_ALL_OUT_BONUS',
    'dodgeball: all six out awards the +2 bonus and opens a revival window',
    () => {
      const h = new Harness();
      h.startMatch();
      h.allOut(TEAM_A.id, TEAM_B.id);
      const sb = h.board();
      assert(sb.points[TEAM_A.id] === 8, `points=${sb.points[TEAM_A.id]}`);
      assert(sb.phase === 'awaiting_revival', `phase=${sb.phase}`);
      assert(sb.revival?.teamId === TEAM_B.id, `revival=${JSON.stringify(sb.revival)}`);
      assert(sb.revival?.outPlayerIds.length === 6, `out=${sb.revival?.outPlayerIds.length}`);
    },
  );

  check(
    'TEST_DODGEBALL_REVIVE_ALL',
    'dodgeball: all six re-enter together after an all-out',
    () => {
      const h = new Harness();
      h.startMatch();
      h.allOut(TEAM_A.id, TEAM_B.id);
      const sb = h.board();
      h.apply({
        type: 'REVIVE',
        teamId: TEAM_B.id,
        playerIds: sb.revival!.outPlayerIds,
        reason: 'REVIVAL',
      });
      const after = h.board();
      const b = after.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(b.activeCount === 6, `active=${b.activeCount}`);
      assert(after.revival === null, 'revival window should be closed');
      assert(after.points[TEAM_A.id] === 8, `points=${after.points[TEAM_A.id]}`);
    },
  );

  check(
    'TEST_DODGEBALL_REVIVAL_FAILED',
    'dodgeball: a failed revival awards a point and restarts play',
    () => {
      const h = new Harness();
      h.startMatch();
      h.allOut(TEAM_A.id, TEAM_B.id);
      h.apply({ type: 'REVIVAL_FAILED', teamId: TEAM_B.id });
      const sb = h.board();
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(sb.points[TEAM_A.id] === 9, `points=${sb.points[TEAM_A.id]}`);
      assert(b.activeCount === 6, `active=${b.activeCount}`);
      assert(sb.revival === null, 'revival window should be closed');
      assert(sb.nextAction.action === 'record_events', `next=${sb.nextAction.action}`);
    },
  );

  check(
    'TEST_DODGEBALL_ALL_OUT_BONUS_REPEATS',
    'dodgeball: the all-out bonus repeats on the next cycle when configured',
    () => {
      const h = new Harness();
      h.startMatch();
      h.allOut(TEAM_A.id, TEAM_B.id);
      const first = h.board();
      h.apply({
        type: 'REVIVE',
        teamId: TEAM_B.id,
        playerIds: first.revival!.outPlayerIds,
        reason: 'REVIVAL',
      });
      h.allOut(TEAM_A.id, TEAM_B.id);
      const sb = h.board();
      assert(sb.points[TEAM_A.id] === 16, `points=${sb.points[TEAM_A.id]}`);
    },
  );

  check(
    'TEST_DODGEBALL_RED_CARD',
    'dodgeball: a red card disqualifies the player, puts them out and scores for the opponent',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({ type: 'CARD', cardType: 'RED', teamId: TEAM_B.id, playerId: 'p3' });
      const sb = h.board();
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
      assert(b.outPlayerIds.includes('p3'), `out=${JSON.stringify(b.outPlayerIds)}`);
      assert(
        b.disqualifiedPlayerIds.includes('p3'),
        'player should be disqualified',
      );
    },
  );

  check(
    'TEST_DODGEBALL_SECOND_YELLOW',
    'dodgeball: a second yellow must be recorded as a red',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({ type: 'CARD', cardType: 'YELLOW', teamId: TEAM_A.id, playerId: 'p2' });
      h.reject('SECOND_YELLOW_IS_RED', {
        type: 'CARD',
        cardType: 'YELLOW',
        teamId: TEAM_A.id,
        playerId: 'p2',
      });
    },
  );

  check(
    'TEST_DODGEBALL_INJURY',
    'dodgeball: an injured player leaves and the opponent scores',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({ type: 'INJURY', teamId: TEAM_A.id, playerId: 'p4' });
      const sb = h.board();
      const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
      assert(sb.points[TEAM_B.id] === 1, `points=${sb.points[TEAM_B.id]}`);
      assert(a.outPlayerIds.includes('p4'), `out=${JSON.stringify(a.outPlayerIds)}`);
    },
  );

  check(
    'TEST_DODGEBALL_DELAY_PENALTY',
    'dodgeball: a delay awards a point but does not put the player out',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({
        type: 'DELAY',
        delayType: 'FIVE_SECOND',
        teamId: TEAM_A.id,
        playerId: 'p5',
      });
      const sb = h.board();
      const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
      assert(sb.points[TEAM_B.id] === 1, `points=${sb.points[TEAM_B.id]}`);
      assert(a.activeCount === 6, `active=${a.activeCount}`);
    },
  );

  check(
    'TEST_DODGEBALL_PAUSE_RESUME',
    'dodgeball: the clock freezes while paused and resumes from the same point',
    () => {
      const h = new Harness();
      const startedAt = h.startMatch();
      h.apply({ type: 'PAUSE', reason: 'OFFICIAL' }, startedAt + 40000);
      const paused = h.board(startedAt + 60000);
      assert(paused.time?.paused === true, 'clock should be paused');
      assert(paused.time?.remainingMs === 50000, `paused remaining=${paused.time?.remainingMs}`);
      h.apply({ type: 'RESUME' }, startedAt + 80000);
      const resumed = h.board(startedAt + 100000);
      assert(resumed.time?.paused === false, 'clock should be running');
      assert(resumed.time?.remainingMs === 30000, `resumed remaining=${resumed.time?.remainingMs}`);
    },
  );

  check(
    'TEST_DODGEBALL_LEGACY_SUBSTITUTION_INTERVAL_ONLY',
    'dodgeball: legacy lineups still reject live substitutions and allow them between sets',
    () => {
      const h = new Harness();
      h.apply({
        type: 'LINEUP_SET',
        teamId: TEAM_A.id,
        onCourt: LEGACY_LINEUP_A,
        subs: ['7'],
      });
      const startedAt = h.startMatch();
      h.reject('SUBSTITUTION_NOT_ALLOWED', {
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: '1',
        inPlayerId: '7',
      });
      h.hit(TEAM_A.id, 'p1');
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 90000);
      h.apply({
        type: 'SUBSTITUTION',
        teamId: TEAM_A.id,
        outPlayerId: '6',
        inPlayerId: '7',
      });
      const lineup = h.board().teamStates.find((team) => team.teamId === TEAM_A.id)!;
      assert(lineup.onCourt.includes('7'), `onCourt=${JSON.stringify(lineup.onCourt)}`);
      assert(lineup.subs.includes('6'), `subs=${JSON.stringify(lineup.subs)}`);
    },
  );

  check(
    'TEST_DODGEBALL_TIMER_REQUIRES_SET_END',
    'dodgeball: scoring is blocked after 1:30 until the set is ended',
    () => {
      const h = new Harness();
      const startedAt = h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      h.reject(
        'SET_TIME_NOT_EXPIRED',
        { type: 'SET_END', setNo: 1, reason: 'TIMER' },
        startedAt + 40000,
      );
      h.reject(
        'SET_TIME_EXPIRED',
        { type: 'HIT', teamId: TEAM_A.id, targetPlayerId: 'p3' },
        startedAt + 90000,
      );
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 90000);
      const sb = h.board(startedAt + 90000);
      assert(sb.sets[0].completed, 'set should be complete');
      assert(sb.sets[0].winnerTeamId === TEAM_A.id, `winner=${sb.sets[0].winnerTeamId}`);
      assert(sb.nextAction.action === 'start_set', `next=${sb.nextAction.action}`);
    },
  );

  check(
    'TEST_DODGEBALL_TIED_SET_IS_DRAW',
    'dodgeball: a level set ends as a draw and awards no set point',
    () => {
      const h = new Harness();
      const startedAt = h.startMatch();
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 90000);
      const sb = h.board(startedAt + 90000);
      assert(sb.sets[0].completed, 'set should be complete');
      assert(sb.sets[0].winnerTeamId === null, `winner=${sb.sets[0].winnerTeamId}`);
      assert(sb.setWins[TEAM_A.id] === 0 && sb.setWins[TEAM_B.id] === 0, 'no set points');
      assert(sb.nextAction.action === 'start_set', `next=${sb.nextAction.action}`);
      if (sb.nextAction.action === 'start_set') {
        assert(sb.nextAction.setNo === 2, `setNo=${sb.nextAction.setNo}`);
      }
    },
  );

  check(
    'TEST_DODGEBALL_THIRD_SET_ONLY_WHEN_LEVEL',
    'dodgeball: a third set is played when the first two sets are drawn',
    () => {
      const h = new Harness();
      const first = h.startMatch();
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, first + 90000);
      const second = h.beginSet(2);
      h.apply({ type: 'SET_END', setNo: 2, reason: 'TIMER' }, second + 90000);
      const afterTwo = h.board(second + 90000);
      assert(afterTwo.nextAction.action === 'start_set', `next=${afterTwo.nextAction.action}`);
      if (afterTwo.nextAction.action === 'start_set') {
        assert(afterTwo.nextAction.setNo === 3, `setNo=${afterTwo.nextAction.setNo}`);
        assert(afterTwo.nextAction.deciding, 'set 3 should be the decider');
      }

      const third = h.beginSet(3);
      h.hit(TEAM_A.id, 'p2');
      h.apply({ type: 'SET_END', setNo: 3, reason: 'TIMER' }, third + 90000);
      const sb = h.board(third + 90000);
      assert(sb.winner.resolved, 'winner should be resolved');
      assert(sb.winner.winnerTeamId === TEAM_A.id, `winner=${sb.winner.winnerTeamId}`);
      assert(sb.setWins[TEAM_A.id] === 1, `setWins=${JSON.stringify(sb.setWins)}`);
      assert(sb.phase === 'completed', `phase=${sb.phase}`);
    },
  );

  check(
    'TEST_DODGEBALL_ONE_EACH_GOES_TO_DECIDER',
    'dodgeball: a 1-1 match after two sets is decided by the third set',
    () => {
      const h = new Harness();
      const first = h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, first + 90000);

      const second = h.beginSet(2);
      h.hit(TEAM_B.id, 'p2');
      h.apply({ type: 'SET_END', setNo: 2, reason: 'TIMER' }, second + 90000);

      const afterTwo = h.board(second + 90000);
      assert(afterTwo.setWins[TEAM_A.id] === 1, `A wins=${afterTwo.setWins[TEAM_A.id]}`);
      assert(afterTwo.setWins[TEAM_B.id] === 1, `B wins=${afterTwo.setWins[TEAM_B.id]}`);
      assert(afterTwo.nextAction.action === 'start_set', `next=${afterTwo.nextAction.action}`);
      if (afterTwo.nextAction.action === 'start_set') {
        assert(afterTwo.nextAction.setNo === 3, `setNo=${afterTwo.nextAction.setNo}`);
      }

      const third = h.beginSet(3);
      h.hit(TEAM_A.id, 'p3');
      h.apply({ type: 'SET_END', setNo: 3, reason: 'TIMER' }, third + 90000);
      const sb = h.board(third + 90000);
      assert(sb.winner.winnerTeamId === TEAM_A.id, `winner=${sb.winner.winnerTeamId}`);
      assert(sb.setWins[TEAM_A.id] === 2, `setWins=${JSON.stringify(sb.setWins)}`);
    },
  );

  check(
    'TEST_DODGEBALL_TWO_SET_WINS',
    'dodgeball: two set wins complete the match after two sets',
    () => {
      const h = new Harness();
      const first = h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, first + 90000);

      const second = h.beginSet(2);
      h.hit(TEAM_A.id, 'p3');
      h.apply({ type: 'SET_END', setNo: 2, reason: 'TIMER' }, second + 90000);

      const sb = h.board(second + 90000);
      assert(sb.winner.resolved, 'winner should be resolved');
      assert(sb.winner.winnerTeamId === TEAM_A.id, `winner=${sb.winner.winnerTeamId}`);
      assert(sb.winner.kind === 'sets', `kind=${sb.winner.kind}`);
      assert(sb.winner.setWins[TEAM_A.id] === 2, `setWins=${JSON.stringify(sb.winner.setWins)}`);
      assert(sb.phase === 'completed', `phase=${sb.phase}`);
      assert(sb.nextAction.action === 'completed', `next=${sb.nextAction.action}`);
    },
  );

  check(
    'TEST_DODGEBALL_MANUAL_DECISION',
    'dodgeball: a manual decision resolves the match and blocks further events',
    () => {
      const h = new Harness();
      h.startMatch();
      h.apply({
        type: 'MANUAL_DECISION',
        winnerTeamId: TEAM_B.id,
        reason: 'Forfeit after injury',
      });
      const sb = h.board();
      assert(sb.winner.resolved && sb.winner.kind === 'manual', `winner=${JSON.stringify(sb.winner)}`);
      h.reject('MATCH_COMPLETED', {
        type: 'HIT',
        teamId: TEAM_A.id,
        targetPlayerId: 'p1',
      });
      h.apply({
        type: 'VOID',
        targetEventId: h.state.events[h.state.events.length - 1].eventId,
      });
      assert(!h.board().winner.resolved, 'voiding the decision should reopen the match');
    },
  );

  check(
    'TEST_DODGEBALL_VOID_REVERTS',
    'dodgeball: voiding a hit restores the team point and the player',
    () => {
      const h = new Harness();
      h.startMatch();
      const hit = h.hit(TEAM_A.id, 'p2');
      assert(h.board().points[TEAM_A.id] === 1, 'setup point missing');
      h.apply({ type: 'VOID', targetEventId: hit.eventId });
      const sb = h.board();
      const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
      assert(sb.points[TEAM_A.id] === 0, `points=${sb.points[TEAM_A.id]}`);
      assert(b.activePlayerIds.includes('p2'), 'target should be active again');
      assert(b.outPlayerIds.length === 0, `out=${JSON.stringify(b.outPlayerIds)}`);
      const stats = dodgeballScoringEngine.getPlayerStats(h.state);
      assert(stats.every((row) => row.values.points === 0), 'voided hit should remove points');
    },
  );

  check(
    'TEST_DODGEBALL_TEAM_STAT_COLUMNS',
    'dodgeball: statistics expose team-level action columns only',
    () => {
      const columns = dodgeballScoringEngine.statColumns();
      const keys = columns.map((column) => column.key);
      for (const key of ['points', 'hits', 'outs', 'catches', 'revives', 'cards', 'delays']) {
        assert(keys.includes(key), `missing column ${key} (${keys.join(',')})`);
      }
      assert(columns.length === 7, `columns=${keys.join(',')}`);
    },
  );

  check(
    'TEST_DODGEBALL_STATS_ARE_TEAM_ONLY',
    'dodgeball: stats are grouped by team and never by player',
    () => {
      const h = new Harness();
      h.startMatch();
      h.allOut(TEAM_A.id, TEAM_B.id);
      const rows = dodgeballScoringEngine.getPlayerStats(h.state);
      assert(rows.length === 2, `rows=${rows.length}`);
      assert(rows.every((row) => row.playerId === null), 'player rows should not exist');
      assert(rows.every((row) => row.jerseyNumber === null), 'jersey rows should not exist');
      const a = rows.find((row) => row.teamId === TEAM_A.id)!;
      assert(a.values.points === 8, `A points=${a.values.points}`);
      assert(a.values.hits === 6, `A hits=${a.values.hits}`);
      const b = rows.find((row) => row.teamId === TEAM_B.id)!;
      assert(b.values.outs === 6, `B outs=${b.values.outs}`);
    },
  );

  check(
    'TEST_DODGEBALL_CATCH_CONFIG_OFF',
    'dodgeball: catch-out/revive behaviour follows the config flags',
    () => {
      const h = new Harness({ catchOutsThrower: false, catchRevivesTeammate: false });
      h.startMatch();
      h.apply({
        type: 'CATCH',
        teamId: TEAM_B.id,
        playerId: 'p1',
        throwerTeamId: TEAM_A.id,
        throwerPlayerId: 'p3',
      });
      const a = h.board().teamStates.find((team) => team.teamId === TEAM_A.id)!;
      assert(a.activeCount === 6, `active=${a.activeCount}`);
    },
  );

  check(
    'TEST_DODGEBALL_CATCH_REVIVE_DISABLED_REJECTED',
    'dodgeball: naming a catch revival is rejected when the rule is off',
    () => {
      const h = new Harness({ catchRevivesTeammate: false });
      h.startMatch();
      h.hit(TEAM_A.id, 'p2');
      h.reject('CATCH_REVIVE_DISABLED', {
        type: 'CATCH',
        teamId: TEAM_B.id,
        playerId: 'p1',
        throwerTeamId: TEAM_A.id,
        throwerPlayerId: 'p3',
        revivePlayerId: 'p2',
      });
    },
  );

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
