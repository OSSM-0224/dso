'use client';

/**
 * React binding for the tournament-scoped score event queue.
 *
 * The hook binds ONE queue instance to the `tournamentId:matchId` pair:
 * - the queue is created/rekeyed when the pair changes (bug fix #2), so no
 *   React state or pending events are ever reused across matches or
 *   tournaments;
 * - `beforeunload` and the returned navigation guard block leaving while the
 *   queue is not empty (bug fix #4);
 * - all queue logic (undo ordering, retry/backoff, 4xx rejection cascade)
 *   lives in ScoreEventQueue (see scoreEventQueue.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  ScoreEventQueue,
  ScoreQueueItem,
  ScoreQueueState,
  newScoreEventId,
} from './scoreEventQueue';

export type ScoreQueueApi = {
  /** Enqueue a scoring event (optimistic UI must be applied by the caller). */
  enqueueEvent: (event: unknown, eventId?: string) => string;
  /** Enqueue an undo through the SAME ordered queue (bug fix #1). */
  enqueueUndo: (payload?: unknown) => void;
  undo: (payload?: unknown) => void;
  queuedCount: number;
  /** Alias of `queuedCount` (spec wording). */
  pendingCount: number;
  queued: Array<ScoreQueueItem>;
  isQueueEmpty: boolean;
  inFlight: boolean;
  offline: boolean;
  /** 401 pause: true => events are being held, nothing is sent, resumeQueue() resumes. */
  authPaused: boolean;
  /** Clear the 401 pause (after sign-in) and re-flush the SAME eventIds. */
  resumeQueue: () => void;
  lastError: string | null;
  clearLastError: () => void;
  /** Extra gate (e.g. engine says nothing to undo) AND the queue drained. */
  canUndo: boolean;
  getCanUndo: () => boolean;
  hasPending: boolean;
  isBlocked: boolean;
  flush: () => Promise<void>;
  flushRef: () => Promise<void>;
  /** Tracks the latest state via a subscription (React-friendly). */
  state: () => ScoreQueueState;
  /** Latest snapshot object (for non-hook consumers/tests). */
  snapshot: ScoreQueueState;
  queueRef: () => ScoreEventQueue;
};

export type UseScoreEventQueueOptions = {
  tournamentId: string;
  matchId: string;
  sendEvent: (event: unknown, eventId: string) => Promise<unknown>;
  sendUndo?: (payload: unknown) => Promise<unknown>;
  onReconcile: (ctx: { reason: 'rejected' | 'drained' }) => Promise<void> | void;
  onRejected: (message: string, droppedCount: number) => void;
  /** Optional engine gate: queue-drained AND this true => undo allowed. */
  getCanUndo?: () => boolean;
  maxBackoffMs?: number;
};

export function useScoreEventQueue(options: UseScoreEventQueueOptions): ScoreQueueApi {
  const { tournamentId, matchId } = options;

  // Latest handler each render (stable queue instance, fresh closures).
  const handlersRef = useRef({
    sendEvent: options.sendEvent,
    sendUndo: options.sendUndo,
    onReconcile: options.onReconcile,
    onRejected: options.onRejected,
    getCanUndo: options.getCanUndo,
  });
  handlersRef.current.sendEvent = options.sendEvent;
  handlersRef.current.sendUndo = options.sendUndo;
  handlersRef.current.onReconcile = options.onReconcile;
  handlersRef.current.onRejected = options.onRejected;
  handlersRef.current.getCanUndo = options.getCanUndo;

  const key = `${tournamentId}:${matchId}`;
  const stateRef = useRef<ScoreQueueState | null>(null);

  // One queue per mount, rekeyed on (tournamentId, matchId) change.
  const queue = useMemo(() => {
    const q = new ScoreEventQueue(
      {
        sendEvent: async (item) => {
          const res = await handlersRef.current.sendEvent(item.payload as unknown, item.eventId);
          return res;
        },
        sendUndo: async (item) => {
          if (handlersRef.current.sendUndo) {
            return handlersRef.current.sendUndo(item.payload as unknown);
          }
          throw new Error('Undo is not wired up for this console.');
        },
        onReconcile: (ctx) => Promise.resolve(handlersRef.current.onReconcile(ctx)),
        onRejected: (message, droppedCount) => handlersRef.current.onRejected(message, droppedCount),
      },
      key,
      { maxBackoffMs: options.maxBackoffMs }
    );
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug fix #2 — contamination guard: rekey flushes the queue whenever the
  // (tournamentId, matchId) pair changes (covers param changes after remounts).
  useEffect(() => {
    queue.ensureKey(key);
    return () => {
      queue.dispose();
    };
  }, [queue, key]);

  const snapshot = useSyncExternalStore(
    queue.subscribe,
    () => {
      const next = queue.getSnapshot();
      stateRef.current = next;
      return next;
    },
    () => queue.getSnapshot()
  );

  const enqueueEvent = useCallback(
    (event: unknown, eventId?: string) => queue.enqueueEvent(event, eventId ?? newScoreEventId()),
    [queue]
  );
  const enqueueUndo = useCallback((payload?: unknown) => queue.enqueueUndo(payload), [queue]);

  const getCanUndo = useCallback(
    () => handlersRef.current.getCanUndo ? handlersRef.current.getCanUndo() : true,
    []
  );

  // Bug fix #4 — block leaving with pending events.
  useEffect(() => {
    if (snapshot.queued.length === 0) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [snapshot.queued.length]);

  // Release resources on unmount.
  useEffect(() => () => queue.dispose(), [queue]);

  const canUndo = snapshot.queued.length === 0 && !snapshot.inFlight && getCanUndo();
  const queuedCount = snapshot.queued.length;

  return {
    enqueueEvent,
    enqueueUndo,
    undo: enqueueUndo,
    queuedCount,
    pendingCount: queuedCount,
    queued: snapshot.queued,
    isQueueEmpty: queuedCount === 0,
    inFlight: snapshot.inFlight,
    offline: queuedCount > 0,
    authPaused: snapshot.authPaused,
    resumeQueue: () => queue.resume(),
    lastError: snapshot.lastError,
    clearLastError: () => queue.clearLastError(),
    canUndo,
    getCanUndo,
    hasPending: queuedCount > 0,
    isBlocked: queuedCount > 0,
    flush: () => queue.flush(),
    flushRef: () => queue.flush(),
    state: () => snapshot,
    snapshot,
    queueRef: () => queue,
  };
}
