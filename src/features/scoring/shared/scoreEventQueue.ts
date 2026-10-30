/**
 * Framework-agnostic ordered score-event queue shared by the score console.
 * `useScoreEventQueue` (React hook) wraps this class; unit tests exercise the
 * class directly so the real queue logic is covered without a DOM.
 *
 * Guarantees (the five console bug fixes live here):
 *  1. UNDO RACE   — undos travel through the same FIFO queue as events, so an
 *                   undo can never pass an in-flight event.
 *  2. CONTAMINATION — the queue is keyed by `tournamentId:matchId`; switching
 *                   keys flushes pending state and resets the queue.
 *  3. NETWORK ERRORS — 5xx/no-network keeps the item and retries the SAME
 *                   eventId with exponential backoff + jitter (the server
 *                   dedupes on eventId). Only a 4xx rejection drops items —
 *                   and then it drops the head plus every later queued item
 *                   that depended on it (later items always build on earlier
 *                   optimistic state), reconciles from the authoritative
 *                   server snapshot, and reports the rejection.
 *  4. LEAVING SOON — exposes `pendingCount`/`isBlocked` for the beforeunload
 *                   and in-app navigation guards; the hook wires the events.
 *  5. AUTO-COMPLETE — consumers gate completion on `pendingCount === 0` and
 *                   a server-confirmed scoreboard (never optimistic state).
 */
export type QueueItemKind = 'event' | 'undo';

export interface ScoreQueueItem<T = unknown, U = unknown> {
  kind: QueueItemKind;
  /** Stable client id; the server dedupes `event` items on it. */
  eventId: string;
  /** Opaque sport-specific payload (for undo items: server request body). */
  payload: T | U;
  attempts: number;
  enqueuedAt: number;
}

export interface ScoreQueueState {
  queued: Array<ScoreQueueItem>;
  inFlight: boolean;
  offline: boolean;
  lastError: string | null;
  /** Number of items dropped by the latest 4xx rejection (null when none). */
  rejectedDroppedCount: number | null;
}

export type ScoreQueueHandlers = {
  /** Delivers a scoring event to the server (ordered FIFO; server dedupes). */
  sendEvent: (item: ScoreQueueItem<unknown, never>) => Promise<unknown>;
  /** Delivers an undo request through the same ordered queue. */
  sendUndo: (item: ScoreQueueItem<never, unknown>) => Promise<unknown>;
  /** Refreshes the authoritative server state after a rejection. */
  onReconcile: (ctx: { reason: 'rejected' | 'drained' }) => Promise<void> | void;
  /** surfaced when a 4xx removes items (message already user-presentable). */
  onRejected: (message: string, droppedCount: number) => void;
};

export interface ScoreQueueOptions {
  maxBackoffMs?: number;
  baseBackoffMs?: number;
  jitterMs?: number;
  /** Injectable scheduler (tests use a fake clock). Default: window timers. */
  schedule?: (fn: () => void, delayMs: number) => () => void;
}

export function newScoreEventId(): string {
  return `ev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Categorises a transport failure: 4xx = permanent rejection, else retryable. */
export function classifyQueueFailure(err: unknown): { reject: boolean; status?: number; message: string } {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { reject: true, status, message: queueMessageOf(err) };
  }
  return { reject: false, status, message: queueMessageOf(err) };
}

function queueMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message || 'Network error';
  return String(err ?? 'Network error');
}

/** Shared wording for the "N events waiting" offline chip. */
export function offlineChipLabel(pendingCount: number): string {
  return pendingCount === 1 ? 'Offline, 1 event waiting' : `Offline, ${pendingCount} events waiting`;
}

export class ScoreEventQueue {
  private handlersRef: ScoreQueueHandlers;
  private readonly options: Required<Omit<ScoreQueueOptions, 'schedule'>> & {
    schedule?: ScoreQueueOptions['schedule'];
  };

  private key: string;
  private items: Array<ScoreQueueItem> = [];
  private flushRunning = false;
  private cancelBackoff: (() => void) | null = null;
  private disposed = false;

  private state: ScoreQueueState = {
    queued: [],
    inFlight: false,
    offline: false,
    lastError: null,
    rejectedDroppedCount: null,
  };

  private listeners = new Set<() => void>();

  constructor(
    handlers: ScoreQueueHandlers,
    /** Isolation key: `${tournamentId}:${matchId}`. */
    key: string,
    options: ScoreQueueOptions = {}
  ) {
    this.handlersRef = handlers;
    this.key = key;
    this.options = {
      maxBackoffMs: options.maxBackoffMs ?? 5000,
      baseBackoffMs: options.baseBackoffMs ?? 250,
      jitterMs: options.jitterMs ?? 150,
      schedule: options.schedule,
    };
  }

  // -------------------------------------------------------------- store glue

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ScoreQueueState => this.state;

  private emit() {
    this.state = {
      queued: this.items.slice(),
      inFlight: this.flushRunning,
      offline: this.items.length > 0,
      lastError: this.state.lastError,
      rejectedDroppedCount: this.state.rejectedDroppedCount,
    };
    for (const listener of this.listeners) listener();
  }

  // ------------------------------------------------------------ isolation

  get isolationKey(): string {
    return this.key;
  }

  /**
   * Bug fix #2: re-keying (tournament/match change) removes every queued item
   * and cancels pending retries so state from one match can never bleed into
   * another. Returns true when the key actually changed.
   */
  ensureKey(nextKey: string): boolean {
    if (nextKey === this.key) return false;
    this.cancelPendingBackoff();
    this.items = [];
    this.flushRunning = false;
    this.disposed = false;
    this.key = nextKey;
    this.state = {
      queued: [],
      inFlight: false,
      offline: false,
      lastError: null,
      rejectedDroppedCount: null,
    };
    this.emit();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPendingBackoff();
    this.items = [];
    this.flushRunning = false;
  }

  // --------------------------------------------------------------- writers

  /** Enqueue a scoring event (news/optimistic UI applies it client-side). */
  enqueueEvent(payload: unknown, eventId = newScoreEventId()): string {
    this.assertActive();
    this.push({ kind: 'event', eventId, payload, attempts: 0, enqueuedAt: Date.now() });
    void this.flush();
    return eventId;
  }

  /**
   * Bug fix #1: undo goes through the SAME ordered queue. If events are still
   * in flight the undo waits behind them (and the UI disables the button via
   * `canUndo`), so it can never void an older event first.
   */
  enqueueUndo(payload = {}): void {
    this.assertActive();
    this.push({
      kind: 'undo',
      eventId: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      payload,
      attempts: 0,
      enqueuedAt: Date.now(),
    });
    void this.flush();
  }

  private push(item: ScoreQueueItem) {
    this.items = [...this.items, item];
    this.emit();
  }

  // ----------------------------------------------------------------- state

  get pendingCount(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Non-empty queue blocks leaving the page (beforeunload + in-app guard). */
  get isBlocked(): boolean {
    return this.items.length > 0;
  }

  get inFlight(): boolean {
    return this.flushRunning;
  }

  get lastError(): string | null {
    return this.state.lastError;
  }

  clearLastError(): void {
    this.state.lastError = null;
    this.emit();
  }

  // ----------------------------------------------------------------- flush

  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.flushRunning) return;
    if (this.items.length === 0) {
      this.emit();
      return;
    }

    this.flushRunning = true;
    this.emit();

    try {
      while (this.items.length > 0 && !this.disposed) {
        const head = this.items[0];
        try {
          const item: ScoreQueueItem = {
            ...head,
            payload: head.payload,
          };
          if (item.kind === 'event') {
            await this.handlersRef.sendEvent(item as ScoreQueueItem<unknown, never>);
          } else {
            await this.handlersRef.sendUndo(item as ScoreQueueItem<never, unknown>);
          }

          // Accepted: remove the head, keep flushing (FIFO order).
          this.items = this.items.slice(1);
          this.emit();
          if (this.items.length === 0 && !this.disposed) {
            await this.handlersRef.onReconcile({ reason: 'drained' });
          }
        } catch (err) {
          const failure = classifyQueueFailure(err);
          if (failure.reject) {
            // Bug fix #3b: a server 4xx removes the head AND every later item
            // that depended on it (later items always build on earlier
            // optimistic state), then reconciles from the server truth.
            const droppedCount = this.items.length;
            this.items = [];
            this.emit();
            this.state.lastError = failure.message;
            this.emit();
            this.handlersRef.onRejected(stripPrefix(failure.message), droppedCount);
            await this.handlersRef.onReconcile({ reason: 'rejected' });
            break;
          }
          // Bug fix #3a: network/5xx keeps the item and retries the SAME
          // eventId with backoff. `offline` shows the waiting chip.
          this.items[0] = { ...head, attempts: head.attempts + 1 };
          this.emit();
          this.scheduleRetry(this.items[0]);
          break;
        }
      }
    } finally {
      this.flushRunning = false;
      this.emit();
    }
  }

  private scheduleRetry(item: ScoreQueueItem): void {
    const delay = Math.min(
      this.options.maxBackoffMs,
      this.options.baseBackoffMs * Math.pow(2, Math.max(0, item.attempts - 1))
    ) + (this.options.jitterMs > 0 ? Math.random() * this.options.jitterMs : 0);
    this.cancelPendingBackoff();
    const schedule = this.options.schedule ?? defaultSchedule;
    this.cancelBackoff = schedule(() => {
      this.cancelBackoff = null;
      void this.flush();
    }, delay);
  }

  private cancelPendingBackoff(): void {
    if (this.cancelBackoff) {
      this.cancelBackoff();
      this.cancelBackoff = null;
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('ScoreEventQueue is disposed');
    }
  }
}

function defaultSchedule(fn: () => void, delayMs: number): () => void {
  const isBrowser = typeof window !== 'undefined' && typeof window.setTimeout === 'function';
  const setter = isBrowser
    ? window.setTimeout.bind(window)
    : (globalThis.setTimeout.bind(globalThis) as (fn: () => void, ms: number) => unknown);
  const clearer = isBrowser
    ? window.clearTimeout.bind(window)
    : (globalThis.clearTimeout.bind(globalThis) as (id: unknown) => void);
  const id = setter(fn, delayMs);
  return () => clearer(id);
}

function stripPrefix(message: string): string {
  return message.replace(/^[A-Z_]+:\s*/, '') || message;
}
