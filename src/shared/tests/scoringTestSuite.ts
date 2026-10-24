/**
 * Pure Kho-Kho live scoring engine tests. Mirrors src/shared/tests/testSuite.ts
 * conventions: framework-free, synchronous, reuse TestResult/TestSuiteSummary,
 * registered in the server runner, the /api/tests/run route and the in-browser
 * Engine Tests screen fallback.
 */
import { getScoringEngine, ScoringRuleError } from '../scoring/engine.ts';
import {
  KhoKhoDismissalType,
  KhoKhoNextAction,
  KhoKhoScoringConfig,
  KhoKhoScoreEvent,
  KhoKhoScoreboard,
  MatchScoringState,
  PAUSE_REMINDER_MS,
} from '../scoring/types.ts';
import { TestResult, TestSuiteSummary } from '../types.ts';

const TEAM_A = { id: 'team-a', name: 'Alpha Vidya Mandir' };
const TEAM_B = { id: 'team-b', name: 'Beta Vidya Mandir' };

type PartialEvent = Partial<KhoKhoScoreEvent> & Record<string, unknown>;

class Harness {
  t = 1000;
  private seq = 0;
  state: MatchScoringState;

  constructor(configOverride?: Partial<KhoKhoScoringConfig>) {
    this.state = khoKhoEngine().createInitialState({
      teams: [TEAM_A, TEAM_B],
      config: configOverride,
    });
  }

  eid(): string {
    this.seq += 1;
    return `ev-${this.seq}-${this.t}`;
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
    } as unknown as KhoKhoScoreEvent;
    try {
      this.state = khoKhoEngine().applyEvent(this.state, full);
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err as ScoringRuleError };
    }
  }

  mustApply(event: PartialEvent, atMs?: number): void {
    const res = this.apply(event, atMs);
    if (!res.ok) {
      throw new Error(`expected event to be accepted: ${JSON.stringify(event)} -> ${res.error?.code} ${res.error?.message}`);
    }
  }

  mustFail(event: PartialEvent, code: string, atMs?: number): void {
    const res = this.apply(event, atMs);
    if (res.ok) {
      throw new Error(`expected event to be REJECTED (${code}) but it was accepted: ${JSON.stringify(event)}`);
    }
    if (res.error?.code !== code) {
      throw new Error(`expected rejection code ${code} but got ${res.error?.code}: ${res.error?.message}`);
    }
  }

  board(): KhoKhoScoreboard {
    return khoKhoEngine().getScoreboard(this.state, this.t);
  }

  action(): string {
    return this.board().nextAction.action;
  }

  toss(winner = TEAM_A.id, decision: 'CHASE' | 'DEFEND' = 'CHASE', stage: 'first_innings' | 'extra_innings' = 'first_innings'): void {
    this.mustApply({ type: 'TOSS', stage, winnerTeamId: winner, decision });
  }

  startTurn(chaser?: string): void {
    const payload: PartialEvent = { type: 'TURN_START' };
    if (chaser) (payload as Record<string, unknown>).chaserTeamId = chaser;
    this.mustApply(payload);
  }

  dismiss(count = 1, dismissalType: KhoKhoDismissalType = 'TAG', defenderPlayerId?: string): void {
    for (let i = 0; i < count; i += 1) {
      const payload: PartialEvent = { type: 'DISMISSAL', dismissalType };
      if (defenderPlayerId) (payload as Record<string, unknown>).defenderPlayerId = `def-${i + 1}`;
      this.mustApply(payload);
    }
  }

  foul(): void {
    this.mustApply({ type: 'FOUL_LOG', note: 'free foul' });
  }

  endTerminal(reason: 'timer_expired' | 'all_out' | 'manual', advanceMs = 0, reasonText?: string): void {
    if (advanceMs > 0) this.tick(advanceMs);
    const payload: PartialEvent = { type: 'TURN_END', reason };
    if (reasonText) (payload as Record<string, unknown>).reasonText = reasonText;
    this.mustApply(payload);
  }

  chaserOfCurrentTurn(): string | null {
    return this.board().currentTurn?.chaserTeamId ?? null;
  }

  playTiedFourTurns(): void {
    this.startTurn();
    this.dismiss(2);
    this.endTerminal('timer_expired', 61_000);
    this.startTurn();
    this.dismiss(2);
    this.endTerminal('timer_expired', 61_000);
    this.startTurn();
    this.dismiss(2);
    this.endTerminal('timer_expired', 61_000);
    this.startTurn();
    this.dismiss(2);
    this.endTerminal('timer_expired', 61_000);
  }

  playTieToExtraToss(): void {
    this.playTiedFourTurns();
    const action = this.board().nextAction;
    if (action.action !== 'prompt_extra_toss') {
      throw new Error(`expected prompt_extra_toss but got ${action.action}`);
    }
  }
}

function khoKhoEngine() {
  return getScoringEngine('kho-kho');
}

function expect(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function pointsOf(harness: Harness, teamId: string, nowMs?: number): number {
  const board = khoKhoEngine().getScoreboard(harness.state, nowMs ?? harness.t);
  return board.teams.find((t) => t.id === teamId)?.totalPoints ?? -1;
}

export function runScoringEngineTestSuite(): TestSuiteSummary {
  const startTime = Date.now();
  const results: TestResult[] = [];
  let seq = 0;

  const test = (name: string, category: string, fn: () => void) => {
    seq += 1;
    const t0 = performance.now();
    try {
      fn();
      results.push({
        id: `kho-kho-scoring-${seq}`,
        name,
        category,
        passed: true,
        message: 'Passed.',
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err: any) {
      results.push({
        id: `kho-kho-scoring-${seq}`,
        name,
        category,
        passed: false,
        message: err?.message ?? String(err),
        details: { stack: err?.stack?.split('\n')[1] ?? '' },
        durationMs: Math.round(performance.now() - t0),
      });
    }
  };

  const DUR_60 = { turnDurationSec: 60 };

  test('createInitialState rejects team counts other than 2 and duplicate ids', 'Match Setup', () => {
    let threw = false;
    try {
      khoKhoEngine().createInitialState({ teams: [TEAM_A] });
    } catch (err) { threw = true; expect((err as ScoringRuleError).code === 'INVALID_TEAMS', 'wrong code'); }
    expect(threw, '3-team call should throw');
    threw = false;
    try {
      khoKhoEngine().createInitialState({ teams: [TEAM_A, TEAM_A] });
    } catch (err) { threw = true; }
    expect(threw, 'duplicate team ids should throw');
  });

  test('fresh state awaits the toss and refuses a premature turn start', 'Match Setup', () => {
    const h = new Harness();
    const board = h.board();
    expect(board.phase === 'awaiting_toss', 'phase should be awaiting_toss');
    expect(board.nextAction.action === 'prompt_toss', 'next action should be prompt_toss');
    expect(khoKhoEngine().canUndo(h.state) === false, 'nothing to undo on a fresh state');
    h.mustFail({ type: 'TURN_START' }, 'TURN_START_NOT_EXPECTED');
    h.toss(TEAM_A.id, 'CHASE');
    const b2 = h.board();
    expect(b2.phase === 'turn_break', 'phase after toss should be turn_break');
    expect(b2.nextAction.action === 'start_turn', 'toss done -> start_turn');
    expect((b2.nextAction as any).chaserTeamId === TEAM_A.id, 'winner chose CHASE so winner chases first');
  });

  test('toss decision DEFEND gives the first chase to the rival', 'Match Setup', () => {
    const h = new Harness();
    h.toss(TEAM_A.id, 'DEFEND');
    const action = h.board().nextAction as any;
    expect(action.action === 'start_turn', 'turn should be startable');
    expect(action.chaserTeamId === TEAM_B.id, 'rival of the toss winner should chase first');
  });

  test('turn start validates supplied chaser/innings/turn metadata', 'Match Setup', () => {
    const h = new Harness();
    h.toss(TEAM_A.id, 'CHASE');
    h.mustFail({ type: 'TURN_START', chaserTeamId: TEAM_B.id }, 'TURN_START_MISMATCH');
    h.startTurn(TEAM_A.id);
    const turn = h.board().currentTurn;
    expect(turn?.chaserTeamId === TEAM_A.id, 'current turn chaser should be team A');
    h.mustFail({ type: 'TURN_START' }, 'TURN_START_NOT_EXPECTED');
  });

  test('duplicate eventId is idempotent: state unchanged, no extra points', 'Match Setup', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.tick(1000);
    const before = h.state;
    h.apply({ type: 'DISMISSAL', dismissalType: 'TAG', eventId: 'dup-1' });
    const afterOne = h.state;
    expect(afterOne !== before, 'new state after first apply');
    const res = h.apply({ type: 'DISMISSAL', dismissalType: 'TAG', eventId: 'dup-1' });
    expect(res.ok, 'duplicate apply should succeed as a no-op');
    expect(h.state === afterOne, 'duplicate eventId must keep the exact same state object');
    expect(pointsOf(h, TEAM_A.id, h.t) === 1, 'only one point may be recorded');
  });

  test('events arrive strictly in timestamp order', 'Match Setup', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    const late = h.t - 5000;
    h.mustFail({ type: 'DISMISSAL', dismissalType: 'TAG' }, 'TIMESTAMP_OUT_OF_ORDER', late);
  });

  test('dismissals score pointsPerOut to the chasing team; batch tracker advances', 'Scoring Rules', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.dismiss(4);
    const board = h.board();
    expect(pointsOf(h, TEAM_A.id) === 4, '4 dismissals with pointsPerOut 1 -> 4 points');
    expect((board.nextAction as any).action === 'turn_running', 'turn should still be running');
    expect(board.currentTurn?.batchDisplay === 'Batch 2 / 3', `Batch display after 4 outs, got ${board.currentTurn?.batchDisplay}`);
    expect(board.currentTurn?.points === 4, 'turn points should equal dismissals * pointsPerOut');
  });

  test('fouls are logged without points; LATE_ENTRY dismissal style scores like TAG', 'Scoring Rules', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.foul();
    h.dismiss(1, 'LATE_ENTRY');
    const turn = h.board().currentTurn;
    expect(turn?.fouls === 1, 'foul should be counted');
    expect(turn?.points === 1, 'foul alone must not score; LATE_ENTRY scores 1');
    expect(pointsOf(h, TEAM_A.id) === 1, 'total should reflect only the dismissal');
  });

  test('pointsPerOut=2 config doubles dismissal scoring', 'Scoring Rules', () => {
    const h = new Harness({ pointsPerOut: 2 });
    h.toss();
    h.startTurn();
    h.dismiss(2);
    expect(pointsOf(h, TEAM_A.id) === 4, '2 dismissals x pointsPerOut 2 -> 4 points');
  });

  test('all-out flags the turn and requires the all_out end reason; premature all_out rejected', 'Scoring Rules', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.dismiss(8);
    h.mustFail({ type: 'TURN_END', reason: 'all_out' }, 'ALL_OUT_NOT_REACHED');
    h.dismiss(1, 'OUT_OF_BOUNDS');
    expect(h.board().currentTurn?.allOut === true, '9th dismissal must flag allOut');
    const action = h.board().nextAction;
    expect(action.action === 'end_turn_available' && (action as any).reasonHint === 'all_out', '9 outs -> end_turn_available(all_out)');
    h.endTerminal('all_out');
    expect(h.board().phase === 'turn_break', 'after all_out end, match moves to turn break');
    expect((h.board().nextAction as any).chaserTeamId === TEAM_B.id, 'turn 2 chaser should be team B');
  });

  test('timer expiry: dismissal rejected after zero, TURN_END(timer_expired) only within grace', 'Timer & Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(30_000);
    h.dismiss(1);
    h.tick(20_000);
    let early = h.apply({ type: 'TURN_END', reason: 'timer_expired' }, h.t);
    expect(!early.ok && early.error?.code === 'TURN_NOT_EXPIRED', 'early timer end must be rejected');
    h.tick(11_500);
    h.mustFail({ type: 'DISMISSAL', dismissalType: 'TAG' }, 'TURN_TIMER_EXPIRED');
    const action = h.board().nextAction;
    expect(action.action === 'end_turn_available' && (action as any).reasonHint === 'timer_expired', 'expired turn advertises end availability');
    h.endTerminal('timer_expired');
    expect(h.board().phase === 'turn_break', 'timer end closes the turn');
  });

  test('manual turn end requires a reason', 'Timer & Clock Stoppage', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.tick(2000);
    h.mustFail({ type: 'TURN_END', reason: 'manual' }, 'REASON_REQUIRED');
    h.endTerminal('manual', 0, 'injury to a running defender');
    expect(h.board().completedTurns.length === 1, 'manual end records the completed turn');
  });

  test('pause stops the clock: multipause remaining math is exact', 'Pause / Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(10_000);
    h.dismiss(1);
    h.mustApply({ type: 'TURN_PAUSE' });
    let b = h.board();
    expect(b.phase === 'turn_paused', 'phase should be turn_paused');
    expect(b.currentTurn?.remainingMs === 50_000, `remaining after 10s of play, got ${b.currentTurn?.remainingMs}`);
    h.tick(30_000);
    b = h.board();
    expect(b.currentTurn?.remainingMs === 50_000, 'clock must stay frozen while stopped');
    h.tick(30_000);
    h.mustFail({ type: 'TURN_PAUSE' }, 'CLOCK_NOT_RUNNING');
    b = h.board();
    expect(b.currentTurn?.remainingMs === 50_000, 'double pause rejected; remaining unchanged');
    h.mustApply({ type: 'TURN_RESUME' });
    h.tick(10_000);
    b = h.board();
    expect(b.currentTurn?.remainingMs === 40_000, `after resume+10s remaining 40s, got ${b.currentTurn?.remainingMs}`);
    h.dismiss(1);
    h.mustApply({ type: 'TURN_PAUSE' });
    h.tick(5_000);
    h.mustApply({ type: 'TURN_RESUME' });
    h.tick(5_000);
    expect(h.board().currentTurn?.remainingMs === 35_000, `second stoppage math, got ${h.board().currentTurn?.remainingMs}`);
    expect(h.board().currentTurn?.dismissals === 2, 'two dismissals recorded across stoppages');
    expect(pointsOf(h, TEAM_A.id, h.t) === 2, 'points across stoppages stable');
  });

  test('while paused, dismissals and turn end are rejected until resume', 'Pause / Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(5_000);
    h.mustApply({ type: 'TURN_PAUSE' });
    h.tick(30_000);
    h.mustFail({ type: 'DISMISSAL', dismissalType: 'TAG' }, 'CLOCK_STOPPED_RESUME_REQUIRED');
    h.tick(30_000);
    h.mustFail({ type: 'TURN_END', reason: 'manual', reasonText: 'try' }, 'CLOCK_STOPPED_END_BLOCKED');
    h.mustFail({ type: 'TURN_END', reason: 'timer_expired' }, 'CLOCK_STOPPED_END_BLOCKED');
    h.mustFail({ type: 'TURN_PAUSE' }, 'CLOCK_NOT_RUNNING');
    h.mustApply({ type: 'TURN_RESUME' });
    const turn = h.board().currentTurn;
    expect(turn?.status === 'live' && turn?.remainingMs === 55_000, `clock resumes frozen position, got ${turn?.remainingMs}`);
    h.dismiss(1);
    expect(h.board().currentTurn?.dismissals === 1, 'dismissal accepted right after resume');
  });

  test('turn cannot auto-end while paused even if the wall clock passed the duration', 'Pause / Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(10_000);
    h.mustApply({ type: 'TURN_PAUSE' });
    h.tick(120_000);
    h.mustFail({ type: 'TURN_END', reason: 'timer_expired' }, 'CLOCK_STOPPED_END_BLOCKED');
    h.mustApply({ type: 'TURN_RESUME' });
    h.tick(56_000);
    h.endTerminal('timer_expired');
    expect(h.board().completedTurns.length === 1, 'turn ends cleanly after the resumed clock expires');
  });

  test('paused action reports pausedForMs for the 2-minute resume reminder', 'Pause / Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(5_000);
    h.mustApply({ type: 'TURN_PAUSE' });
    h.tick(90_000);
    let action = h.board().nextAction as any;
    expect(action.action === 'turn_paused' && action.pausedForMs === 90_000, 'pausedForMs tracks the stoppage');
    h.tick(PAUSE_REMINDER_MS);
    action = h.board().nextAction as any;
    expect(action.action === 'turn_paused' && action.pausedForMs >= PAUSE_REMINDER_MS, 'past 2 minutes the reminder threshold is met');
  });

  test('resume without a stop and pauses after expiry are rejected', 'Pause / Clock Stoppage', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.mustFail({ type: 'TURN_RESUME' }, 'CLOCK_NOT_STOPPED');
    h.tick(65_000);
    h.mustFail({ type: 'TURN_PAUSE' }, 'TURN_TIMER_EXPIRED');
  });

  test('voiding the last pause restores a running clock', 'Undo / Void', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(10_000);
    h.mustApply({ type: 'TURN_PAUSE' });
    const pauseEvent = khoKhoEngine().getUndoTarget(h.state);
    expect(pauseEvent?.type === 'TURN_PAUSE', 'undo target should be the pause');
    const voided = pauseEvent as KhoKhoScoreEvent;
    h.tick(200);
    h.mustApply({ type: 'VOID', targetEventId: voided.eventId });
    const b = h.board();
    expect(b.phase === 'turn_live', 'voiding the pause revives the clock');
    expect(b.currentTurn?.remainingMs === 49_800, `remaining continues from start, got ${b.currentTurn?.remainingMs}`);
    expect(khoKhoEngine().canUndo(h.state) === false, 'void events themselves cannot be undone');
  });

  test('voiding the last dismissal reverts score and dismissal count', 'Undo / Void', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.dismiss(1, 'TAG');
    h.tick(3000);
    h.dismiss(1, 'OUT_OF_BOUNDS');
    expect(pointsOf(h, TEAM_A.id) === 2, 'two points before undo');
    const target = khoKhoEngine().getUndoTarget(h.state);
    expect(target?.type === 'DISMISSAL', 'undo target is the last dismissal');
    h.mustApply({ type: 'VOID', targetEventId: (target as KhoKhoScoreEvent).eventId });
    expect(pointsOf(h, TEAM_A.id) === 1, 'voiding the last dismissal drops the score');
    expect(h.board().currentTurn?.dismissals === 1, 'dismissal count drops to 1');
    const older = (h.state.events.find((e) => e.type === 'DISMISSAL') as KhoKhoScoreEvent).eventId;
    h.mustFail({ type: 'VOID', targetEventId: older }, 'ONLY_LAST_EVENT_VOIDABLE');
  });

  test('void validation: missing target, double void, void of void', 'Undo / Void', () => {
    const h = new Harness();
    h.toss();
    h.startTurn();
    h.dismiss(1, 'TAG');
    h.mustFail({ type: 'VOID', targetEventId: 'does-not-exist' }, 'TARGET_NOT_FOUND');
    const target = khoKhoEngine().getUndoTarget(h.state) as KhoKhoScoreEvent;
    h.mustApply({ type: 'VOID', targetEventId: target.eventId });
    h.mustFail({ type: 'VOID', targetEventId: target.eventId }, 'TARGET_ALREADY_VOIDED');
    const voidEvent = (h.state.events[h.state.events.length - 1] as KhoKhoScoreEvent);
    h.tick(100);
    h.mustFail({ type: 'VOID', targetEventId: voidEvent.eventId }, 'VOID_TARGET_INVALID');
  });

  test('voiding a premature turn end reopens the turn for scoring', 'Undo / Void', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(10_000);
    h.endTerminal('manual', 0, 'mistake - turn not supposed to end yet');
    const endEvent = khoKhoEngine().getUndoTarget(h.state) as KhoKhoScoreEvent;
    expect(endEvent.type === 'TURN_END', 'undo target is the turn end');
    h.tick(200);
    h.mustApply({ type: 'VOID', targetEventId: endEvent.eventId });
    const b = h.board();
    expect(b.phase === 'turn_live', 'turn reopened after voiding its end');
    h.dismiss(1, 'TAG');
    expect(h.board().currentTurn?.dismissals === 1, 'dismissal accepted on the reopened turn');
    expect(b.currentTurn?.remainingMs === 49_800, `clock continues from the reopen point, got ${b.currentTurn?.remainingMs}`);
  });

  test('second innings default order: the first-innings second chaser opens turn 3', 'Innings Structure', () => {
    const h = new Harness(DUR_60);
    h.toss(TEAM_A.id, 'CHASE');
    h.startTurn();
    h.dismiss(2);
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(1);
    h.endTerminal('timer_expired', 61_000);
    const b = h.board();
    expect(b.nextAction.action === 'start_turn', 'turn 3 should be startable');
    expect((b.nextAction as any).chaserTeamId === TEAM_B.id, 'team B (turn-2 chaser) chases first in innings 2');
    expect((b.nextAction as any).turnLabel.includes('Innings 2'), 'label shows the second innings');
  });

  test('follow-on prompt at lead >= 9; only the leader may decide; declined keeps default order', 'Follow-On', () => {
    const h = new Harness(DUR_60);
    h.toss(TEAM_A.id, 'CHASE');
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(9);
    h.endTerminal('all_out');
    const b = h.board();
    expect(b.phase === 'follow_on_prompt', `phase should be follow_on_prompt, got ${b.phase}`);
    expect((b.nextAction as any).action === 'prompt_follow_on', 'next action prompts the follow-on');
    expect((b.nextAction as any).leaderTeamId === TEAM_B.id, 'team B leads by 9');
    expect(b.followOn?.prompted === true && b.followOn?.leadPoints === 9, 'summary records lead 9');
    h.mustFail({ type: 'FOLLOW_ON_DECISION', optedByTeamId: TEAM_A.id, opted: false }, 'NOT_LEADING_TEAM');
    h.mustApply({ type: 'FOLLOW_ON_DECISION', optedByTeamId: TEAM_B.id, opted: false });
    expect((h.board().nextAction as any).chaserTeamId === TEAM_B.id, 'declined -> default order (team B again)');
  });

  test('follow-on opted: trailing team chases first in the second innings', 'Follow-On', () => {
    const h = new Harness(DUR_60);
    h.toss(TEAM_A.id, 'CHASE');
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(9);
    h.endTerminal('all_out');
    h.mustApply({ type: 'FOLLOW_ON_DECISION', optedByTeamId: TEAM_B.id, opted: true });
    expect((h.board().nextAction as any).chaserTeamId === TEAM_A.id, 'opted follow-on -> trailing team A chases first');
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    expect((h.board().nextAction as any).chaserTeamId === TEAM_B.id, 'then the leader closes the innings');
  });

  test('innings win: unreachable lead after the third chase ends the match with the innings label', 'Innings Structure', () => {
    const h = new Harness(DUR_60);
    h.toss(TEAM_A.id, 'CHASE');
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(9);
    h.endTerminal('all_out');
    h.mustApply({ type: 'FOLLOW_ON_DECISION', optedByTeamId: TEAM_B.id, opted: false });
    h.startTurn();
    h.dismiss(9);
    h.endTerminal('all_out');
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved === true, 'match should be decided');
    expect(winner.winnerTeamId === TEAM_B.id, 'team B wins by an innings');
    expect(winner.kind === 'innings', 'winner kind innings');
    expect(winner.label === 'WON BY AN INNINGS & 18 PTS', `label got: ${winner.label}`);
    expect(h.board().phase === 'completed', 'phase completed');
    h.mustFail({ type: 'TURN_START' }, 'TURN_START_NOT_EXPECTED');
    h.tick(100);
    h.mustFail({ type: 'MANUAL_DECISION', winnerTeamId: TEAM_A.id, reason: 'protest' }, 'MATCH_ALREADY_COMPLETED');
  });

  test('regular points win after four chases with margin label', 'Innings Structure', () => {
    const h = new Harness(DUR_60);
    h.toss(TEAM_A.id, 'CHASE');
    h.startTurn();
    h.dismiss(3);
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(1);
    h.endTerminal('timer_expired', 61_000);
    expect((h.board().nextAction as any).chaserTeamId === TEAM_B.id, 'default turn 3 for team B');
    h.startTurn();
    h.dismiss(2);
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(3);
    h.endTerminal('timer_expired', 61_000);
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.winnerTeamId === TEAM_A.id, 'team A wins 6-3');
    expect(winner.kind === 'points' && winner.label === 'WON BY 3 PTS', `label got ${winner.label}`);
    expect(winner.marginPoints === 3, 'margin 3');
  });

  test('tie after four chases triggers the extra-innings toss; premature extra toss rejected', 'Extra Innings & Sudden Death', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.mustFail({ type: 'TOSS', stage: 'extra_innings', winnerTeamId: TEAM_A.id, decision: 'CHASE' }, 'TOSS_NOT_EXPECTED');
    h.playTiedFourTurns();
    const b = h.board();
    expect(b.phase === 'awaiting_extra_toss', `phase should be awaiting_extra_toss, got ${b.phase}`);
    expect(b.nextAction.action === 'prompt_extra_toss' && (b.nextAction as any).round === 1, 'extra toss round 1 prompted');
    expect(b.extraInnings.tied && b.extraInnings.available, 'extras summary shows a live tie');
  });

  test('extra rounds resolve the tie; extra label applied', 'Extra Innings & Sudden Death', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.playTieToExtraToss();
    h.toss(TEAM_B.id, 'CHASE', 'extra_innings');
    expect((h.board().nextAction as any).chaserTeamId === TEAM_B.id, 'extra toss winner chases first');
    h.startTurn();
    h.dismiss(1);
    h.endTerminal('manual', 0, 'no need to wait');
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.winnerTeamId === TEAM_B.id, 'team B wins the extra chase');
    expect(winner.label === 'WON BY 1 PTS (EXTRA INNINGS)', `label got ${winner.label}`);
  });

  test('sudden death records stop-clock attempts; one score beats a failed attempt', 'Extra Innings & Sudden Death', () => {
    const h = new Harness({ ...DUR_60, extraInningsEnabled: false });
    h.toss();
    h.playTiedFourTurns();
    const b = h.board();
    expect(b.phase === 'min_time', `phase should be min_time, got ${b.phase}`);
    expect((b.nextAction as any).pendingTeamIds.length === 2, 'both teams pending');
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 8300 });
    expect(h.board().phase === 'min_time', 'still awaiting team B');
    h.tick(400);
    h.mustFail({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 4100 }, 'MIN_TIME_NOT_EXPECTED');
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_B.id, scored: false });
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.winnerTeamId === TEAM_A.id, 'team A scored, team B failed');
    expect(winner.kind === 'min_time' && winner.label === 'WON BY SUDDEN DEATH (MINIMUM TIME)', 'sudden death label');
    h.tick(400);
    h.mustFail({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: false }, 'MIN_TIME_NOT_EXPECTED');
  });

  test('sudden death with both scores resolved by the smaller elapsed time', 'Extra Innings & Sudden Death', () => {
    const h = new Harness({ ...DUR_60, extraInningsEnabled: false });
    h.toss();
    h.playTiedFourTurns();
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 9000 });
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_B.id, scored: true, elapsedMs: 5000 }, h.t);
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.winnerTeamId === TEAM_B.id, 'faster elapsed time wins');
  });

  test('sudden death elapsed beyond the allowed limit must be a failed attempt', 'Extra Innings & Sudden Death', () => {
    const h = new Harness({ ...DUR_60, extraInningsEnabled: false });
    h.toss();
    h.playTiedFourTurns();
    h.mustFail({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 302_001 }, 'ELAPSED_OUT_OF_RANGE');
    h.mustFail({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 0 }, 'ELAPSED_REQUIRED');
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: true, elapsedMs: 250_000 });
    expect(h.board().phase === 'min_time', 'valid score keeps the sudden-death phase');
  });

  test('both failed sudden-death attempts require a manual decision with a reason', 'Extra Innings & Sudden Death', () => {
    const h = new Harness({ ...DUR_60, extraInningsEnabled: false });
    h.toss();
    h.playTiedFourTurns();
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_A.id, scored: false });
    h.mustApply({ type: 'MIN_TIME_RESULT', teamId: TEAM_B.id, scored: false });
    expect(h.board().phase === 'awaiting_manual_decision', 'both failed -> manual decision required');
    h.mustFail({ type: 'MANUAL_DECISION', winnerTeamId: TEAM_A.id, reason: '' }, 'REASON_REQUIRED');
    h.mustApply({ type: 'MANUAL_DECISION', winnerTeamId: TEAM_A.id, reason: 'umpire panel decision: more touches' });
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.kind === 'manual' && winner.winnerTeamId === TEAM_A.id, 'manual decision resolves');
    expect(winner.label === 'WON BY DECISION', 'manual label');
  });

  test('manual decision works mid-match (organizer override) with mandatory reason', 'Extra Innings & Sudden Death', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.tick(10_000);
    h.dismiss(2);
    h.mustApply({ type: 'MANUAL_DECISION', winnerTeamId: TEAM_B.id, reason: 'walkover after protest' });
    const winner = khoKhoEngine().computeWinner(h.state);
    expect(winner.resolved && winner.kind === 'manual' && winner.winnerTeamId === TEAM_B.id, 'manual decision resolves the match');
    expect(h.board().phase === 'completed', 'phase completed');
    h.tick(1000);
    h.mustFail({ type: 'DISMISSAL', dismissalType: 'TAG' }, 'MATCH_ALREADY_COMPLETED');
    h.mustFail({ type: 'TURN_START' }, 'MATCH_ALREADY_COMPLETED');
  });

  test('toss rejections: duplicate first toss and missing teams', 'Match Setup', () => {
    const h = new Harness();
    h.toss();
    h.mustFail({ type: 'TOSS', stage: 'first_innings', winnerTeamId: TEAM_A.id, decision: 'DEFEND' }, 'TOSS_ALREADY_RECORDED');
    h.mustFail({ type: 'TOSS', stage: 'first_innings', winnerTeamId: 'ghost', decision: 'CHASE' }, 'TEAM_NOT_FOUND');
  });

  test('scoring events without an open turn are rejected', 'Ill-formed Events', () => {
    const h = new Harness();
    h.toss();
    h.mustFail({ type: 'DISMISSAL', dismissalType: 'TAG' }, 'NO_OPEN_TURN');
    h.mustFail({ type: 'FOUL_LOG' }, 'NO_OPEN_TURN');
    h.mustFail({ type: 'TURN_END', reason: 'manual', reasonText: 'x' }, 'NO_OPEN_TURN');
    h.mustFail({ type: 'TURN_PAUSE' }, 'CLOCK_NOT_RUNNING');
  });

  test('scoreboard exposes totals, phase history and turn summaries after three chases', 'Innings Structure', () => {
    const h = new Harness(DUR_60);
    h.toss();
    h.startTurn();
    h.dismiss(1);
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.endTerminal('timer_expired', 61_000);
    h.startTurn();
    h.dismiss(2);
    const b = h.board();
    expect(b.completedTurns.length === 2, 'two completed turns');
    expect(b.teams.find((t) => t.id === TEAM_A.id)?.totalPoints === 1, 'team A total 1');
    expect(b.teams.find((t) => t.id === TEAM_B.id)?.totalPoints === 2, 'team B total 2 from its live turn 3');
    expect(b.currentTurn?.chaserTeamId === TEAM_B.id && b.currentTurn?.points === 2, 'live turn summary tracks chaser and points');
    expect(b.completedTurns[0]?.endReason === 'timer_expired', 'turn 1 ended on the timer');
  });

  results.push(...verifyPlayTieHelpers());

  const durationMs = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs,
    results,
  };
}

function verifyPlayTieHelpers(): TestResult[] {
  const t0 = performance.now();
  try {
    const h = new Harness({ turnDurationSec: 60, extraInningsEnabled: false });
    h.toss();
    h.playTiedFourTurns();
    const b = h.board();
    if (!(b.phase === 'min_time')) throw new Error(`helper sanity failed: phase ${b.phase}`);
    return [{
      id: 'kho-kho-scoring-helper-sanity',
      name: 'Sudden-death helper produces a tied four-turn match',
      category: 'Match Setup',
      passed: true,
      message: 'Passed.',
      durationMs: Math.round(performance.now() - t0),
    }];
  } catch (err: any) {
    return [{
      id: 'kho-kho-scoring-helper-sanity',
      name: 'Sudden-death helper produces a tied four-turn match',
      category: 'Match Setup',
      passed: false,
      message: err?.message ?? String(err),
      durationMs: Math.round(performance.now() - t0),
    }];
  }
}
