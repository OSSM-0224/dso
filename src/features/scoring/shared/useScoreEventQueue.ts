'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type QueuedEvent<T = unknown> = {
  eventId: string;
  event: T;
  attempts: number;
  enqueuedAt: number;
};

export type QueueState = {
  queued: QueuedEvent[];
  inFlight: boolean;
  offline: boolean;
  lastError: string | null;
  canUndo: boolean;
};

export type UseScoreEventQueueOptions<T> = {
  tournamentId: string;
  matchId: string;
  sendEvent: (event: T) => Promise<unknown>;
  onReconcile: () => Promise<void> | void;
  onRejected: (message: string, droppedCount: number) => void;
  getCanUndo?: () => boolean;
  isUndoEvent?: (event: T) => boolean;
  maxBackoffMs?: number;
};

const backoff = (attempt: number, max = 5000) => {
  const base = Math.min(max, 250 * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.random() * 150;
  return base + jitter;
};

export function useScoreEventQueue<T = unknown>(options: UseScoreEventQueueOptions<T>) {
  const {
    tournamentId,
    matchId,
    sendEvent,
    onReconcile,
    onRejected,
    getCanUndo,
    isUndoEvent,
    maxBackoffMs = 5000,
  } = options;

  const [state, setState] = useState<QueueState>({
    queued: [],
    inFlight: false,
    offline: false,
    lastError: null,
    canUndo: true,
  });

  const queueRef = useRef<QueuedEvent<T>[]>([]);
  const flushingRef = useRef(false);
  const keyRef = useRef<string>(`${tournamentId}:${matchId}`);
  const retryTimerRef = useRef<number | null>(null);

  const updateState = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queued: queueRef.current.slice(),
      offline: queueRef.current.length > 0,
      canUndo: getCanUndo ? getCanUndo() && queueRef.current.length === 0 && !flushingRef.current : queueRef.current.length === 0 && !flushingRef.current,
    }));
  }, [getCanUndo]);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const resetForMatch = useCallback(() => {
    const newKey = `${tournamentId}:${matchId}`;
    if (keyRef.current !== newKey) {
      queueRef.current = [];
      flushingRef.current = false;
      clearTimers();
      keyRef.current = newKey;
      setState({
        queued: [],
        inFlight: false,
        offline: false,
        lastError: null,
        canUndo: getCanUndo ? getCanUndo() : true,
      });
    }
  }, [tournamentId, matchId, clearTimers, getCanUndo]);

  useEffect(() => {
    resetForMatch();
  }, [resetForMatch]);

  const enqueue = useCallback((event: T, eventId?: string) => {
    const id = eventId || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const item: QueuedEvent<T> = {
      eventId: id,
      event,
      attempts: 0,
      enqueuedAt: Date.now(),
    };
    queueRef.current = [...queueRef.current, item];
    updateState();
    // trigger flush
    void flush();
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) {
      flushingRef.current = false;
      updateState();
      return;
    }
    flushingRef.current = true;
    setState((prev) => ({ ...prev, inFlight: true, offline: queueRef.current.length > 0 }));
    try {
      while (queueRef.current.length > 0) {
        const head = queueRef.current[0];
        try {
          await sendEvent(head.event);
          // success - remove head
          queueRef.current = queueRef.current.slice(1);
          updateState();
        } catch (err: any) {
          const message = err instanceof Error ? err.message : String(err);
          const status = err?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) {
            // Rejection: drop this event and every later queued event that depended on it
            // If it's an undo or affects ordering, drop from head onward? "drop every later queued event that depended on it"
            // Conservative: drop all queued events on 4xx rejection to be safe and refresh authoritative state
            const droppedCount = queueRef.current.length;
            queueRef.current = [];
            updateState();
            setState((prev) => ({ ...prev, lastError: message, inFlight: false, offline: false }));
            onRejected(message.replace(/^[A-Z_]+:\s*/, '') || message, droppedCount);
            await onReconcile();
            break;
          } else {
            // Network/server error - retry same eventId with backoff, do NOT drop
            head.attempts += 1;
            setState((prev) => ({ ...prev, lastError: message, offline: true, inFlight: false }));
            clearTimers();
            const delay = backoff(head.attempts, maxBackoffMs);
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              flushingRef.current = false;
              void flush();
            }, delay) as unknown as number;
            break;
          }
        }
      }
    } finally {
      if (queueRef.current.length === 0) {
        flushingRef.current = false;
        setState((prev) => ({ ...prev, inFlight: false, offline: false }));
        updateState();
      } else {
        flushingRef.current = false;
        setState((prev) => ({ ...prev, inFlight: false }));
        updateState();
      }
    }
  }, [sendEvent, onRejected, onReconcile, clearTimers, maxBackoffMs, updateState]);

  const undo = useCallback(() => {
    // Undo must go through the same ordered queue or stay disabled until the queue is drained
    if (queueRef.current.length > 0) {
      // disabled while queue not drained
      return;
    }
    if (getCanUndo && !getCanUndo()) return;
    // caller is responsible for enqueuing undo through queue if needed; this hook enforces ordering
  }, [getCanUndo]);

  const hasPending = queueRef.current.length > 0;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (queueRef.current.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    enqueue,
    flush,
    undo,
    state,
    hasPending,
    queueLength: queueRef.current.length,
    isQueueEmpty: queueRef.current.length === 0,
  };
}
