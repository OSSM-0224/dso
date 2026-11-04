/**
 * Pure dodgeball scoring engine tests (jersey-based lineups, hits, catches,
 * all-out revival, cards, clock, extra time and sudden death).
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

const LINEUP_A = ['1', '2', '3', '4', '5', '6'];
const LINEUP_B = ['1', '2', '3', '4', '5', '6'];
const SUBS_A = ['7', '8', '9', '10'];
const SUBS_B = ['7', '8', '9', '10'];

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
        throw new Error(`expected rejection ${code} but got ${rule.code}: ${rule.message}`);
      }
      return;
    }
    throw new Error(`expected rejection ${code} but the event was accepted`);
  }

  board(nowMs?: number): DodgeballScoreboard {
    return dodgeballScoringEngine.getScoreboard(this.state, nowMs);
  }

  toss(): void {
    this.apply({ type: 'TOSS', winnerTeamId: TEAM_A.id, choice: 'COURT' });
  }

  lineups(): void {
    this.apply({ type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: LINEUP_A, subs: SUBS_A });
    this.apply({ type: 'LINEUP_SET', teamId: TEAM_B.id, onCourt: LINEUP_B, subs: SUBS_B });
  }

  beginSet(setNo = 1): number {
    const at = this.at();
    this.apply({ type: 'SET_START', setNo }, at);
    return at;
  }

  startMatch(): number {
    this.toss();
    this.lineups();
    return this.beginSet(1);
  }

  hit(teamId: string, playerId: string | undefined, targetPlayerId: string): DodgeballScoreEvent {
    return this.apply({
      type: 'HIT',
      teamId,
      ...(playerId ? { playerId } : {}),
      targetPlayerId,
    });
  }

  allOut(teamId: string, targetTeamId: string): void {
    for (const target of LINEUP_B) {
      this.hit(teamId, '1', target);
    }
    assert(
      this.board().teamStates.find((team) => team.teamId === targetTeamId)?.activeCount === 0,
      'expected the target team to be all out',
    );
  }
}

function sumPoints(rows: ReturnType<typeof dodgeballScoringEngine.getPlayerStats>): number {
  return rows.reduce((total, row) => total + (row.values.points ?? 0), 0);
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

  check('TEST_DODGEBALL_DEFAULT_CONFIG', 'dodgeball: defaults are a best-of-3, 8-minute, 6-a-side, jersey 1-10 game', () => {
    const cfg = dodgeballScoringEngine.createInitialState({
      teams: [TEAM_A, TEAM_B],
    }).config;
    assert(cfg.bestOf === 3, `bestOf=${cfg.bestOf}`);
    assert(cfg.setDurationSec === 480, `setDurationSec=${cfg.setDurationSec}`);
    assert(cfg.playersOnCourt === 6, `playersOnCourt=${cfg.playersOnCourt}`);
    assert(cfg.maxRosterSize === 10, `maxRosterSize=${cfg.maxRosterSize}`);
    assert(cfg.jerseyMin === 1 && cfg.jerseyMax === 10, `jerseys=${cfg.jerseyMin}-${cfg.jerseyMax}`);
    assert(cfg.allOutBonusPoints === 2, `allOutBonusPoints=${cfg.allOutBonusPoints}`);
    assert(DEFAULT_DODGEBALL_SCORING_CONFIG.suddenDeathEnabled, 'sudden death should default on');
  });

  check('TEST_DODGEBALL_TOSS_REQUIRED', 'dodgeball: a set cannot start before the toss', () => {
    const h = new Harness();
    h.reject('TOSS_REQUIRED', { type: 'SET_START', setNo: 1 });
  });

  check('TEST_DODGEBALL_LINEUP_REQUIRED', 'dodgeball: a set cannot start before both lineups are named', () => {
    const h = new Harness();
    h.toss();
    h.reject('LINEUP_REQUIRED', { type: 'SET_START', setNo: 1 });
  });

  check('TEST_DODGEBALL_JERSEY_RANGE', 'dodgeball: jerseys outside 1-10 are rejected', () => {
    const h = new Harness();
    h.toss();
    h.reject(
      'BAD_JERSEY',
      { type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: ['1', '2', '3', '11'], subs: [] },
    );
  });

  check('TEST_DODGEBALL_LINEUP_MIN_PLAYERS', 'dodgeball: fewer than four on-court players is rejected', () => {
    const h = new Harness();
    h.toss();
    h.reject(
      'BAD_LINEUP',
      { type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: ['1', '2', '3'], subs: [] },
    );
  });

  check('TEST_DODGEBALL_LINEUP_DUPLICATE', 'dodgeball: the same jersey cannot appear twice', () => {
    const h = new Harness();
    h.toss();
    h.reject(
      'BAD_LINEUP',
      { type: 'LINEUP_SET', teamId: TEAM_A.id, onCourt: ['1', '2', '2', '4'], subs: [] },
    );
  });

  check('TEST_DODGEBALL_SET_START_AND_CLOCK', 'dodgeball: set start opens an 8-minute clock', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    const sb = h.board(startedAt);
    assert(sb.phase === 'set_live', `phase=${sb.phase}`);
    assert(sb.time?.period === 'regulation', `period=${sb.time?.period}`);
    assert(sb.time?.remainingMs === 480000, `remaining=${sb.time?.remainingMs}`);
    assert(sb.setNo === 1, `setNo=${sb.setNo}`);
    assert(sb.teamStates.every((team) => team.activeCount === 6), 'both teams should start with six');
  });

  check('TEST_DODGEBALL_HIT_POINT_AND_OUT', 'dodgeball: a hit scores one and puts the target out', () => {
    const h = new Harness();
    h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    const sb = h.board();
    const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
    assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
    assert(b.activeCount === 5, `active=${b.activeCount}`);
    assert(b.outPlayerIds.includes('2'), `out=${JSON.stringify(b.outPlayerIds)}`);
    const stats = dodgeballScoringEngine.getPlayerStats(h.state);
    const thrower = stats.find((row) => row.teamId === TEAM_A.id && row.playerId === '1');
    const victim = stats.find((row) => row.teamId === TEAM_B.id && row.playerId === '2');
    assert(thrower?.values.points === 1 && thrower?.values.hits === 1, 'thrower stats missing');
    assert(victim?.values.outs === 1, 'victim out stat missing');
  });

  check('TEST_DODGEBALL_HIT_REJECTS_OUT_TARGET', 'dodgeball: an already-out player cannot be hit again', () => {
    const h = new Harness();
    h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    h.reject('TARGET_NOT_ACTIVE', {
      type: 'HIT',
      teamId: TEAM_A.id,
      playerId: '1',
      targetPlayerId: '2',
    });
  });

  check('TEST_DODGEBALL_LINE_OUT_POINT', 'dodgeball: a line-out scores for the opponent and puts the offender out', () => {
    const h = new Harness();
    h.startMatch();
    h.apply({ type: 'LINE_OUT', teamId: TEAM_A.id, targetPlayerId: '3' });
    const sb = h.board();
    const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
    assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
    assert(b.outPlayerIds.includes('3'), `out=${JSON.stringify(b.outPlayerIds)}`);
  });

  check('TEST_DODGEBALL_CATCH_OUT_AND_REVIVE', 'dodgeball: a catch puts the thrower out and revives one team-mate', () => {
    const h = new Harness();
    h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    assert(
      h.board().teamStates.find((team) => team.teamId === TEAM_B.id)?.outPlayerIds.includes('2'),
      'setup: B #2 should be out',
    );
    h.apply({
      type: 'CATCH',
      teamId: TEAM_B.id,
      playerId: '1',
      throwerTeamId: TEAM_A.id,
      throwerPlayerId: '3',
      revivePlayerId: '2',
    });
    const sb = h.board();
    const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
    const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
    assert(a.outPlayerIds.includes('3'), `A out=${JSON.stringify(a.outPlayerIds)}`);
    assert(b.activePlayerIds.includes('2'), 'B #2 should be revived');
    const stats = dodgeballScoringEngine.getPlayerStats(h.state);
    assert(
      stats.find((row) => row.teamId === TEAM_B.id && row.playerId === '1')?.values.catches === 1,
      'catcher stat missing',
    );
  });

  check('TEST_DODGEBALL_ALL_OUT_BONUS', 'dodgeball: all six out awards the +2 bonus and opens a revival window', () => {
    const h = new Harness();
    h.startMatch();
    h.allOut(TEAM_A.id, TEAM_B.id);
    const sb = h.board();
    assert(sb.points[TEAM_A.id] === 8, `points=${sb.points[TEAM_A.id]}`);
    assert(sb.phase === 'awaiting_revival', `phase=${sb.phase}`);
    assert(sb.revival?.teamId === TEAM_B.id, `revival=${JSON.stringify(sb.revival)}`);
    assert(sb.revival?.outPlayerIds.length === 6, `out=${sb.revival?.outPlayerIds.length}`);
  });

  check('TEST_DODGEBALL_REVIVE_ALL', 'dodgeball: all six re-enter together after an all-out', () => {
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
  });

  check('TEST_DODGEBALL_REVIVAL_FAILED', 'dodgeball: a failed revival awards a point and restarts play', () => {
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
  });

  check('TEST_DODGEBALL_ALL_OUT_BONUS_REPEATS', 'dodgeball: the all-out bonus repeats on the next cycle when configured', () => {
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
  });

  check('TEST_DODGEBALL_RED_CARD', 'dodgeball: a red card disqualifies the player, puts them out and scores for the opponent', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    h.apply({ type: 'CARD', cardType: 'RED', teamId: TEAM_B.id, playerId: '3' });
    const sb = h.board();
    const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
    assert(sb.points[TEAM_A.id] === 1, `points=${sb.points[TEAM_A.id]}`);
    assert(b.outPlayerIds.includes('3'), `out=${JSON.stringify(b.outPlayerIds)}`);
    assert(b.disqualifiedPlayerIds.includes('3'), 'player should be disqualified');

    h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 480000);
    h.reject('PLAYER_DISQUALIFIED', {
      type: 'LINEUP_SET',
      teamId: TEAM_B.id,
      onCourt: ['1', '2', '3', '4', '5', '6'],
      subs: ['7', '8', '9', '10'],
    });
  });

  check('TEST_DODGEBALL_SECOND_YELLOW', 'dodgeball: a second yellow must be recorded as a red', () => {
    const h = new Harness();
    h.startMatch();
    h.apply({ type: 'CARD', cardType: 'YELLOW', teamId: TEAM_A.id, playerId: '2' });
    h.reject('SECOND_YELLOW_IS_RED', {
      type: 'CARD',
      cardType: 'YELLOW',
      teamId: TEAM_A.id,
      playerId: '2',
    });
  });

  check('TEST_DODGEBALL_INJURY', 'dodgeball: an injured player leaves and the opponent scores', () => {
    const h = new Harness();
    h.startMatch();
    h.apply({ type: 'INJURY', teamId: TEAM_A.id, playerId: '4' });
    const sb = h.board();
    const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
    assert(sb.points[TEAM_B.id] === 1, `points=${sb.points[TEAM_B.id]}`);
    assert(a.outPlayerIds.includes('4'), `out=${JSON.stringify(a.outPlayerIds)}`);
  });

  check('TEST_DODGEBALL_DELAY_PENALTY', 'dodgeball: a delay awards a point but does not put the player out', () => {
    const h = new Harness();
    h.startMatch();
    h.apply({ type: 'DELAY', delayType: 'FIVE_SECOND', teamId: TEAM_A.id, playerId: '5' });
    const sb = h.board();
    const a = sb.teamStates.find((team) => team.teamId === TEAM_A.id)!;
    assert(sb.points[TEAM_B.id] === 1, `points=${sb.points[TEAM_B.id]}`);
    assert(a.activeCount === 6, `active=${a.activeCount}`);
  });

  check('TEST_DODGEBALL_PAUSE_RESUME', 'dodgeball: the clock freezes while paused and resumes from the same point', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    h.apply({ type: 'PAUSE', reason: 'OFFICIAL' }, startedAt + 100000);
    const paused = h.board(startedAt + 150000);
    assert(paused.time?.paused === true, 'clock should be paused');
    assert(paused.time?.remainingMs === 380000, `paused remaining=${paused.time?.remainingMs}`);
    h.apply({ type: 'RESUME' }, startedAt + 200000);
    const resumed = h.board(startedAt + 250000);
    assert(resumed.time?.paused === false, 'clock should be running');
    assert(resumed.time?.remainingMs === 330000, `resumed remaining=${resumed.time?.remainingMs}`);
  });

  check('TEST_DODGEBALL_SUBSTITUTION_INTERVAL_ONLY', 'dodgeball: substitutions are rejected live and allowed between sets', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    h.reject('SUBSTITUTION_NOT_ALLOWED', {
      type: 'SUBSTITUTION',
      teamId: TEAM_A.id,
      outPlayerId: '1',
      inPlayerId: '7',
    });
    h.hit(TEAM_A.id, '1', '2');
    h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 480000);
    h.apply({ type: 'SUBSTITUTION', teamId: TEAM_A.id, outPlayerId: '6', inPlayerId: '7' });
    const lineup = h.board().teamStates.find((team) => team.teamId === TEAM_A.id)!;
    assert(lineup.onCourt.includes('7'), `onCourt=${JSON.stringify(lineup.onCourt)}`);
    assert(lineup.subs.includes('6'), `subs=${JSON.stringify(lineup.subs)}`);
  });

  check('TEST_DODGEBALL_TIMER_REQUIRES_SET_END', 'dodgeball: scoring is blocked after regulation until the set is ended', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    h.reject('SET_TIME_NOT_EXPIRED', { type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 100000);
    h.reject(
      'SET_TIME_EXPIRED',
      { type: 'HIT', teamId: TEAM_A.id, playerId: '1', targetPlayerId: '3' },
      startedAt + 480000,
    );
    h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 480000);
    const sb = h.board(startedAt + 480000);
    assert(sb.sets[0].completed, 'set should be complete');
    assert(sb.sets[0].winnerTeamId === TEAM_A.id, `winner=${sb.sets[0].winnerTeamId}`);
    assert(sb.nextAction.action === 'start_set', `next=${sb.nextAction.action}`);
  });

  check('TEST_DODGEBALL_EXTRA_TIME_SUDDEN_DEATH', 'dodgeball: a tied set goes to 2-minute extra time, then sudden death', () => {
    const h = new Harness();
    const startedAt = h.startMatch();
    h.hit(TEAM_A.id, '1', '1');
    h.hit(TEAM_B.id, '2', '1');
    assert(h.board().points[TEAM_A.id] === 1 && h.board().points[TEAM_B.id] === 1, 'setup should be 1-1');

    h.reject('TIE_REQUIRES_EXTRA_TIME', { type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 480000);
    h.apply({ type: 'EXTRA_TIME_START', setNo: 1 }, startedAt + 480000);
    const extra = h.board(startedAt + 480000);
    assert(extra.time?.period === 'extra_time', `period=${extra.time?.period}`);
    assert(extra.time?.remainingMs === 120000, `remaining=${extra.time?.remainingMs}`);

    h.reject('TIE_REQUIRES_SUDDEN_DEATH', { type: 'SET_END', setNo: 1, reason: 'TIMER' }, startedAt + 600000);
    h.apply({ type: 'SUDDEN_DEATH_START', setNo: 1 }, startedAt + 600000);
    assert(h.board(startedAt + 600000).phase === 'sudden_death', 'phase should be sudden death');

    h.hit(TEAM_A.id, '2', '2');
    const sb = h.board(startedAt + 601000);
    assert(sb.sets[0].completed, 'sudden-death point should complete the set');
    assert(sb.sets[0].winnerTeamId === TEAM_A.id, `winner=${sb.sets[0].winnerTeamId}`);
    assert(sb.sets[0].suddenDeath, 'set should be flagged sudden death');
  });

  check('TEST_DODGEBALL_BEST_OF_THREE', 'dodgeball: two set wins complete the match', () => {
    const h = new Harness();
    const firstStart = h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    h.apply({ type: 'SET_END', setNo: 1, reason: 'TIMER' }, firstStart + 480000);

    const secondStart = h.beginSet(2);
    h.hit(TEAM_A.id, '1', '3');
    h.apply({ type: 'SET_END', setNo: 2, reason: 'TIMER' }, secondStart + 480000);

    const sb = h.board(secondStart + 480000);
    assert(sb.winner.resolved, 'winner should be resolved');
    assert(sb.winner.winnerTeamId === TEAM_A.id, `winner=${sb.winner.winnerTeamId}`);
    assert(sb.winner.kind === 'sets', `kind=${sb.winner.kind}`);
    assert(sb.winner.setWins[TEAM_A.id] === 2, `setWins=${JSON.stringify(sb.winner.setWins)}`);
    assert(sb.phase === 'completed', `phase=${sb.phase}`);
  });

  check('TEST_DODGEBALL_MANUAL_DECISION', 'dodgeball: a manual decision resolves the match and blocks further events', () => {
    const h = new Harness();
    h.startMatch();
    h.apply({ type: 'MANUAL_DECISION', winnerTeamId: TEAM_B.id, reason: 'Forfeit after injury' });
    const sb = h.board();
    assert(sb.winner.resolved && sb.winner.kind === 'manual', `winner=${JSON.stringify(sb.winner)}`);
    h.reject('MATCH_COMPLETED', {
      type: 'HIT',
      teamId: TEAM_A.id,
      playerId: '1',
      targetPlayerId: '1',
    });
    h.apply({ type: 'VOID', targetEventId: h.state.events[h.state.events.length - 1].eventId });
    assert(!h.board().winner.resolved, 'voiding the decision should reopen the match');
  });

  check('TEST_DODGEBALL_VOID_REVERTS', 'dodgeball: voiding a hit restores the point and the player', () => {
    const h = new Harness();
    h.startMatch();
    const hit = h.hit(TEAM_A.id, '1', '2');
    assert(h.board().points[TEAM_A.id] === 1, 'setup point missing');
    h.apply({ type: 'VOID', targetEventId: hit.eventId });
    const sb = h.board();
    const b = sb.teamStates.find((team) => team.teamId === TEAM_B.id)!;
    assert(sb.points[TEAM_A.id] === 0, `points=${sb.points[TEAM_A.id]}`);
    assert(b.activePlayerIds.includes('2'), 'target should be active again');
    assert(b.outPlayerIds.length === 0, `out=${JSON.stringify(b.outPlayerIds)}`);
    const stats = dodgeballScoringEngine.getPlayerStats(h.state);
    assert(sumPoints(stats) === 0, 'voided hit should remove stats points');
  });

  check('TEST_DODGEBALL_STAT_COLUMNS', 'dodgeball: statistics expose the jersey-wise action columns', () => {
    const columns = dodgeballScoringEngine.statColumns();
    const keys = columns.map((column) => column.key);
    for (const key of ['points', 'hits', 'outs', 'catches', 'revives', 'cards', 'delays']) {
      assert(keys.includes(key), `missing column ${key} (${keys.join(',')})`);
    }
    assert(columns.length === 7, `columns=${keys.join(',')}`);
  });

  check('TEST_DODGEBALL_STATS_JERSEY_ROWS', 'dodgeball: stats are grouped by jersey and include team-level bonuses', () => {
    const h = new Harness();
    h.startMatch();
    h.allOut(TEAM_A.id, TEAM_B.id);
    const rows = dodgeballScoringEngine.getPlayerStats(h.state);
    const a1 = rows.find((row) => row.teamId === TEAM_A.id && row.playerId === '1');
    assert(a1?.jerseyNumber === 1, `jersey=${a1?.jerseyNumber}`);
    assert(a1?.values.hits === 6, `hits=${a1?.values.hits}`);
    const teamBonus = rows.find((row) => row.teamId === TEAM_A.id && row.playerId === null);
    assert(teamBonus?.values.points === 2, `bonus=${teamBonus?.values.points}`);
    const outRows = rows.filter((row) => row.teamId === TEAM_B.id && (row.values.outs ?? 0) > 0);
    assert(outRows.length === 6, `out rows=${outRows.length}`);
  });

  check('TEST_DODGEBALL_CATCH_CONFIG_OFF', 'dodgeball: catch-out/revive behaviour follows the config flags', () => {
    const h = new Harness({ catchOutsThrower: false, catchRevivesTeammate: false });
    h.startMatch();
    h.apply({
      type: 'CATCH',
      teamId: TEAM_B.id,
      playerId: '1',
      throwerTeamId: TEAM_A.id,
      throwerPlayerId: '3',
    });
    const a = h.board().teamStates.find((team) => team.teamId === TEAM_A.id)!;
    assert(a.activeCount === 6, `active=${a.activeCount}`);
  });

  check('TEST_DODGEBALL_CATCH_REVIVE_DISABLED_REJECTED', 'dodgeball: naming a catch revival is rejected when the rule is off', () => {
    const h = new Harness({ catchRevivesTeammate: false });
    h.startMatch();
    h.hit(TEAM_A.id, '1', '2');
    h.reject('CATCH_REVIVE_DISABLED', {
      type: 'CATCH',
      teamId: TEAM_B.id,
      playerId: '1',
      throwerTeamId: TEAM_A.id,
      throwerPlayerId: '3',
      revivePlayerId: '2',
    });
  });

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
