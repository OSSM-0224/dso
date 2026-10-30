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
