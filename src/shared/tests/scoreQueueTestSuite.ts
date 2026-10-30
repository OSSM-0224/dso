/**
 * PURE unit suite for the ordered score-event queue (no React, no DOM, no DB
 * — the class is exercised directly with an injectable manual scheduler).
 *
 * Covers the console bug fixes:
 *  #1 undo races    — undo travels BEHIND a still-in-flight event (FIFO).
 *  #2 contamination — re-keying a different tournament/match flushes state.
 *  #3 network fail  — retryable failures keep the item and retry the SAME
 *                     eventId (dedupe-safe); server 4xx drops the head plus
 *                     all later items, reconciles and reports the rejection.
 *  #4 leaving guard — pendingCount/isBlocked expose the "events waiting" state.
 * (Bug fix #5, auto-complete, is asserted via the drained state that the
 * consumer gates on.)
 */
import { TestResult, TestSuiteSummary } from './testSuite.ts';
import {
  ScoreEventQueue,
  ScoreQueueItem,
  newScoreEventId,
  offlineChipLabel,
} from '../../features/scoring/shared/scoreEventQueue.ts';

function makeQueueEnv(
  handlers: Partial<{
    sendEvent: (item: ScoreQueueItem<unknown, never>) => Promise<unknown>;
    sendUndo: (item: ScoreQueueItem<never, unknown>) => Promise<unknown>;
    onReconcile: (ctx: { reason: 'rejected' | 'drained' }) => Promise<void> | void;
    onRejected: (message: string, droppedCount: number) => void;
  }> = {}
) {
  const pendingTimers: Array<{ delayMs: number; done: boolean; fire: () => void }> = [];
  const sent: Array<{ kind: 'event' | 'undo'; eventId: string }> = [];
  const rejected: Array<{ message: string; droppedCount: number }> = [];
  const reconciles: Array<{ reason: string }> = [];

  const queue = new ScoreEventQueue(
    {
      sendEvent:
        handlers.sendEvent ??
        (async (item) => {
          sent.push({ kind: 'event', eventId: item.eventId });
          return { ok: true };
        }),
      sendUndo:
        handlers.sendUndo ??
        (async (item) => {
          sent.push({ kind: 'undo', eventId: item.eventId });
          return { ok: true };
        }),
      onReconcile: handlers.onReconcile ?? (async (ctx) => { reconciles.push(ctx); }),
      onRejected:
        handlers.onRejected ?? ((message, droppedCount) => rejected.push({ message, droppedCount })),
    },
    't1:m1',
    // Manual scheduler: retries only advance when the test fires them.
    {
      baseBackoffMs: 10,
      jitterMs: 0,
      maxBackoffMs: 1_000,
      schedule: (fn, delayMs) => {
        const t = {
          delayMs,
          done: false,
          fire: () => {
            t.done = true;
            fn();
          },
        };
        pendingTimers.push(t);
        return () => {
          t.done = true;
        };
      },
    }
  );

  return {
    queue,
    sent,
    rejected,
    reconciles,
    pendingTimers,
    /** Fires every scheduled (and not yet fired) retry. */
    fireTimers: () => {
      for (const t of [...pendingTimers]) t.fire();
    },
  };
}

/** Awaits the next macrotask so the async flush chain settles. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const ERR = (status: number) => Object.assign(new Error('boom'), { status });

export async function runScoreQueueTestSuite(): Promise<TestSuiteSummary> {
  const results: TestResult[] = [];
  const startAll = Date.now();

  const run = async (id: string, name: string, category: string, test: () => Promise<void>) => {
    const start = Date.now();
    let message = '';
    let passed = true;
    try {
      await test();
    } catch (err) {
      passed = false;
      message = err instanceof Error ? err.message : String(err);
    }
    results.push({ id, name, category, passed, message, durationMs: Date.now() - start });
  };

  // Bug fix #1: undo orders AFTER a still-in-flight event (never races ahead).
  // Delivery order is recorded by the real handlers themselves: the custom
  // event sender must still be observable, otherwise the ordering assertion
  // would compare against an empty/one-sided log.
  await run('TEST_QUEUE_UNDO_FIFO_ORDER', 'queue FIFO: undo waits behind an in-flight event', 'Queue', async () => {
    let releaseEvent!: () => void;
    const hang = new Promise<void>((resolve) => {
      releaseEvent = resolve;
    });
    const deliveryKinds: Array<'event' | 'undo'> = [];

    const env = makeQueueEnv({
      sendEvent: async () => {
        await hang;
        deliveryKinds.push('event');
        return { ok: true };
      },
      sendUndo: async () => {
        deliveryKinds.push('undo');
        return { ok: true };
      },
    });

    env.queue.enqueueEvent({ type: 'DISMISSAL' });
    await tick(); // flush is running and hanging inside the event send
    env.queue.enqueueUndo();
    await tick();

    releaseEvent();
    await tick();

    if (deliveryKinds.length !== 2) {
      throw new Error(`expected 2 deliveries (event then undo), got ${JSON.stringify(deliveryKinds)}`);
    }
    if (deliveryKinds[0] !== 'event' || deliveryKinds[1] !== 'undo') {
      throw new Error(`ordering wrong: ${JSON.stringify(deliveryKinds)}`);
    }
  });

  // Bug fix #2: re-keying flushes the queue (no cross-match leakage).
  await run('TEST_QUEUE_REKEY_FLUSH', 'queue isolation: ensureKey flushes pending items', 'Queue', async () => {
    let releaseEvent!: () => void;
    const hang = new Promise<void>((resolve) => {
      releaseEvent = resolve;
    });

    const env = makeQueueEnv({
      sendEvent: async () => {
        await hang;
        return { ok: true };
      },
    });

    env.queue.enqueueEvent({ type: 'DISMISSAL' });
    await tick();
    if (!env.queue.isBlocked) throw new Error('expected pending item while event in flight');

    const changed = env.queue.ensureKey('t2:m9');
    releaseEvent();
    await tick();

    if (!changed) throw new Error('ensureKey should report a change');
    if (env.queue.pendingCount !== 0) throw new Error('items survived re-key');
    if (env.queue.isolationKey !== 't2:m9') throw new Error('key not updated');
    // The hanging send must never deliver to the server after a re-key.
    if (env.sent.length !== 0) throw new Error('dropped item still delivered');
  });

  // Bug fix #3a: retryable failure keeps the item and retries the SAME eventId.
  await run('TEST_QUEUE_RETRY_SAME_EVENTID', 'queue retry: network error retries the SAME eventId with backoff', 'Queue', async () => {
    let attempts = 0;
    const eventIds: string[] = [];
    const env = makeQueueEnv({
      sendEvent: async (item) => {
        attempts += 1;
        eventIds.push(item.eventId);
        if (attempts < 3) throw ERR(999);
        return { ok: true };
      },
    });

    env.queue.enqueueEvent({ type: 'FOUL_LOG' });
    await tick();
    env.fireTimers();
    await tick();
    env.fireTimers();
    await tick();

    if (attempts < 3) throw new Error(`retry did not advance, attempts=${attempts}`);
    if (new Set(eventIds).size !== 1) {
      throw new Error(`eventId changed across retries: ${JSON.stringify(eventIds)}`);
    }
    if (!env.reconciles.some((r) => r.reason === 'drained')) {
      throw new Error('drained reconcile missing after eventual success');
    }
  });

  // Bug fix #3b: a server 4xx drops the head AND all later queued items in a
  // SINGLE rejection, then reconciles. The later event must be queued WHILE
  // the head is still in flight — only then do the two items share fate
  // (later items build on earlier optimistic state).
  await run('TEST_QUEUE_REJECTION_4XX_CASCADE', 'queue rejection: 4xx cascade + reconcile + rejection message', 'Queue', async () => {
    let failInFlight!: (err: unknown) => void;
    const gatedSend = new Promise<never>((_, reject) => {
      failInFlight = reject;
    });
    const env = makeQueueEnv({
      sendEvent: async () => {
        await gatedSend;
        return { ok: true };
      },
    });

    env.queue.enqueueEvent({ type: 'DISMISSAL' }); // head hangs in flight
    await tick();
    env.queue.enqueueEvent({ type: 'DISMISSAL' }); // second item queued BEHIND it
    await tick();
    const queuedState: number = env.queue.pendingCount;
    // The in-flight head is NOT yet confirmed (it is removed only once its
    // send resolves), so it and the queued item are BOTH unconfirmed here.
    if (!env.queue.inFlight || queuedState !== 2) {
      throw new Error(`expected the head in flight + 1 queued item (2 unconfirmed), got inFlight=${env.queue.inFlight} pending=${queuedState}`);
    }

    failInFlight(ERR(422)); // the in-flight head now receives a 4xx
    await tick();

    const postCascadeCount: number = env.queue.pendingCount;
    if (postCascadeCount !== 0) throw new Error('4xx should drop ALL items');
    if (env.rejected.length !== 1) throw new Error(`onRejected called ${env.rejected.length} times`);
    if (env.rejected[0].droppedCount !== 2) {
      throw new Error(`droppedCount=${env.rejected[0].droppedCount}, expected 2`);
    }
    if (!env.reconciles.some((r) => r.reason === 'rejected')) {
      throw new Error('no reconcile on rejection');
    }
  });

  // A drained flush calls reconcile('drained') exactly once.
  await run('TEST_QUEUE_DRAINED_RECONCILE_ONCE', 'queue drained: reconcile runs once after the queue empties', 'Queue', async () => {
    const env = makeQueueEnv();
    env.queue.enqueueEvent({ type: 'TOSS' });
    env.queue.enqueueEvent({ type: 'TURN_START' });
    await tick();
    const drains = env.reconciles.filter((r) => r.reason === 'drained').length;
    if (drains !== 1) throw new Error(`drained reconciles=${drains}, expected 1`);
  });

  // Event ids are unique and shape-stable (server dedupe depends on them).
  await run('TEST_QUEUE_EVENT_ID_SHAPE', 'queue ids: newScoreEventId unique + shaped', 'Queue', async () => {
    const a = newScoreEventId();
    const b = newScoreEventId();
    if (a === b) throw new Error('ids must be unique');
    if (!/^ev-\d+-[a-z0-9]+$/.test(a)) throw new Error(`unexpected id shape: ${a}`);
  });

  // Bug fix #4 surface: pendingCount/isBlocked + the offline chip label.
  // The waiting state engages SYNCHRONOUSLY on enqueue (an event is pending
  // from that instant, even before its send attempts a network call), and
  // clears once the send settles. "pendingCount" is read into fresh, plainly
  // typed locals before each comparison so the checks compare real runtime
  // values instead of control-flow-narrowed literals.
  await run('TEST_QUEUE_GUARD_PENDING_STATE', 'queue guards: pendingCount/isBlocked expose waiting state', 'Queue', async () => {
    const env = makeQueueEnv();
    const freshCount: number = env.queue.pendingCount;
    if (env.queue.isBlocked || freshCount !== 0) {
      throw new Error('fresh queue should be clear');
    }
    env.queue.enqueueEvent({ type: 'TURN_RESUME' });
    const waitingCount: number = env.queue.pendingCount;
    if (!env.queue.isBlocked || waitingCount !== 1) {
      throw new Error(`expected the guard engaged with 1 pending item right after enqueue, got isBlocked=${env.queue.isBlocked} pendingCount=${waitingCount}`);
    }
    await tick();
    const settledCount: number = env.queue.pendingCount;
    if (env.queue.isBlocked || settledCount !== 0) {
      throw new Error(`queue did not clear after the send settled (pendingCount=${settledCount})`);
    }
    const label = offlineChipLabel(2);
    if (!label.includes('2') || !label.toLowerCase().includes('waiting')) {
      throw new Error(`chip label wrong: ${label}`);
    }
  });

  // Bug fix #5 gate input: after a drain the queue reports drained state the
  // host needs (empty + not in flight + reconcile done).
  await run('TEST_QUEUE_DRAINED_STATE_IDLE', 'queue drained state: empty + not in flight', 'Queue', async () => {
    const env = makeQueueEnv();
    env.queue.enqueueEvent({ type: 'MANUAL_DECISION' });
    await tick();
    if (!env.queue.isEmpty || env.queue.inFlight) {
      throw new Error('queue did not reach the drained {empty, idle} state');
    }
  });

  // 401 — session expired mid-scoring: the queue PAUSES and keeps ALL events,
  // sends nothing and reports no rejection; resume() re-flushes the SAME
  // items with the SAME eventIds (of which the server dedupe on eventId is
  // the backbone of safe re-delivery).
  await run('TEST_QUEUE_401_PAUSE_KEEP_ALL', 'queue auth pause: 401 holds ALL events; resume re-sends the same eventIds', 'Queue', async () => {
    let attempts = 0;
    const deliveredIds: string[] = [];
    const env = makeQueueEnv({
      sendEvent: async (item) => {
        attempts += 1;
        if (attempts === 1) throw ERR(401);
        deliveredIds.push(item.eventId);
        return { ok: true };
      },
    });

    const idA = env.queue.enqueueEvent({ type: 'TOSS' });
    await tick(); // attempt 1 fails with 401 -> the queue pauses
    const idB = env.queue.enqueueEvent({ type: 'TURN_START' });
    await tick(); // WHILE PAUSED nothing is sent: B is simply held

    const heldCount: number = env.queue.pendingCount;
    if (heldCount !== 2) {
      throw new Error(`401 must keep BOTH events, got pendingCount=${heldCount}`);
    }
    if (!env.queue.authPaused) throw new Error('queue is not in the auth-paused state');
    if (env.queue.inFlight) throw new Error('nothing must be sent while paused');
    if (env.rejected.length !== 0) {
      throw new Error(`401 must NOT trigger onRejected, got ${env.rejected.length}`);
    }
    if (env.reconciles.length !== 0) {
      throw new Error(`401 must NOT reconcile, got ${env.reconciles.length}`);
    }

    env.queue.resume(); // session restored -> drain with the same eventIds
    await tick();

    const resumedIds = new Set(deliveredIds);
    if (deliveredIds.length !== 2) {
      throw new Error(`resume should deliver both events once, got ${JSON.stringify(deliveredIds)}`);
    }
    if (!resumedIds.has(idA) || !resumedIds.has(idB)) {
      throw new Error(`resume must reuse the original eventIds, got ${JSON.stringify(deliveredIds)}`);
    }
    if (env.queue.authPaused) throw new Error('authPaused did not clear on resume');
    if (env.queue.pendingCount !== 0) throw new Error('queue did not drain after resume');
    if (!env.reconciles.some((r) => r.reason === 'drained')) {
      throw new Error('no drained reconcile after resume');
    }
  });

  // 408 / 429 / 5xx are RETRYABLE: the item is kept and the SAME eventId is
  // retried with backoff until it succeeds (server dedupes on eventId).
  await run('TEST_QUEUE_RETRYABLE_408_429_5XX', 'queue retry: 408, 429, 500, 503 retry the SAME eventId with backoff', 'Queue', async () => {
    const retryableStatuses = [408, 429, 500, 503];
    let attempts = 0;
    const sentIds: string[] = [];
    const env = makeQueueEnv({
      sendEvent: async (item) => {
        if (attempts < retryableStatuses.length) {
          const status = retryableStatuses[attempts];
          attempts += 1;
          throw ERR(status);
        }
        attempts += 1;
        sentIds.push(item.eventId);
        return { ok: true };
      },
    });

    const eventId = env.queue.enqueueEvent({ type: 'DISMISSAL' }, 'ev-fixed-retry-1');
    const backoffSequence = Math.max(1, retryableStatuses.length * 4);
    for (let round = 0; round < backoffSequence; round += 1) {
      await tick();
      env.fireTimers();
    }
    await tick();

    if (sentIds.length !== 1) {
      throw new Error(`expected the final successful send once, got ${sentIds.length} deliveries: ${JSON.stringify(sentIds)}`);
    }
    if (sentIds[0] !== eventId) {
      throw new Error(`retries must keep the SAME eventId, got ${sentIds[0]} vs ${eventId}`);
    }
    if (env.rejected.length !== 0) {
      throw new Error(`retryable statuses must not drop the event, onRejected=${env.rejected.length}`);
    }
    if (!env.reconciles.some((r) => r.reason === 'drained')) {
      throw new Error('no drained reconcile after the retry succeeded');
    }
  });

  // LATE RETRY: an event that comes back after an offline period keeps its
  // ORIGINAL payload verbatim — the same eventId AND the same clientAtMs on
  // every attempt (the server clamps timestamps by eventId, so a re-stamped
  // payload would corrupt the clock math; engine tests separately prove a
  // duplicate eventId can never double-score).
  await run('TEST_QUEUE_LATE_RETRY_PRESERVES', 'queue late retry: payload (eventId + clientAtMs) preserved verbatim across retries', 'Queue', async () => {
    const deliveries: Array<{ eventId: string; clientAtMs?: number }> = [];
    let fails = 1;
    const env = makeQueueEnv({
      sendEvent: async (item) => {
        const payload = item.payload as { clientAtMs?: number };
        deliveries.push({ eventId: item.eventId, clientAtMs: payload.clientAtMs });
        if (fails > 0) {
          fails -= 1;
          throw ERR(503);
        }
        return { ok: true };
      },
    });

    const FROZEN_CLIENT_AT_MS = 42_000;
    const lateId = env.queue.enqueueEvent(
      { type: 'DISMISSAL', clientAtMs: FROZEN_CLIENT_AT_MS, atMs: FROZEN_CLIENT_AT_MS },
      'ev-late-retry-1'
    );
    await tick(); // first attempt fails (offline)
    env.fireTimers(); // backoff fires
    await tick(); // retry succeeds

    // The duplicate id question is answered one level up (engine dedupe) but
    // the queue must also never rewrite a client-supplied event id — enqueue
    // a SECOND event with the SAME id and confirm it is forwarded as-is.
    env.queue.enqueueEvent({ type: 'DISMISSAL', clientAtMs: FROZEN_CLIENT_AT_MS }, lateId);
    await tick();

    if (deliveries.length !== 3) {
      throw new Error(`expected 3 send attempts (retry + duplicate), got ${deliveries.length}`);
    }
    for (const seen of deliveries) {
      if (seen.eventId !== 'ev-late-retry-1') {
        throw new Error(`eventId rewritten by the queue: ${JSON.stringify(seen)}`);
      }
      if (seen.clientAtMs !== FROZEN_CLIENT_AT_MS) {
        throw new Error(`clientAtMs re-stamped by the queue: ${JSON.stringify(seen)}`);
      }
    }
    if (!env.reconciles.some((r) => r.reason === 'drained')) {
      throw new Error('no drained reconcile after the queue settled');
    }
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
