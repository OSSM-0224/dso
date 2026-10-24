'use client';

/**
 * Live-score polling hook (Phase 4).
 *
 * Transport-agnostic: callers hand in a versioned poll fetcher (the reader DTO
 * short-circuits to `{ changed: false }` when unchanged, so unchanged polls
 * cost almost nothing). The hook owns cadence, hidden-tab suspension, manual
 * refresh, and the interpolation anchor (`snapshotAt`) used by consumers to
 * advance server-authoritative clock values between polls. Swapping in SSE/WS
 * later only requires replacing the fetcher — consumers stay identical.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchScorePollDto, MatchScoreViewDto } from '@/shared/types.ts';

export type LiveScoreStatus = 'idle' | 'loading' | 'live' | 'error';

export interface UseLiveScoreOptions {
  pollIntervalMs?: number;
  /** Master switch — when false no request is ever made and state freezes. */
  enabled?: boolean;
}

export interface UseLiveScoreResult {
  score: MatchScoreViewDto | null;
  /** Client timestamp of when the current snapshot arrived (clock anchor). */
  snapshotAt: number;
  status: LiveScoreStatus;
  error: string | null;
  refresh: () => void;
}

export function useLiveScore(
  fetcher: (version?: number) => Promise<MatchScorePollDto>,
  options: UseLiveScoreOptions = {},
): UseLiveScoreResult {
  const { pollIntervalMs = 4000, enabled = true } = options;

  const [score, setScore] = useState<MatchScoreViewDto | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<number>(0);
  const [status, setStatus] = useState<LiveScoreStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const versionRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const pollMsRef = useRef(pollIntervalMs);
  pollMsRef.current = pollIntervalMs;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetcherRef.current(versionRef.current ?? undefined);
      if (!mountedRef.current) return;
      if ('changed' in res && res.changed === false) {
        setStatus('live');
        setError(null);
        return;
      }
      const dto = res as MatchScoreViewDto;
      versionRef.current = dto.version;
      setScore(dto);
      setSnapshotAt(Date.now());
      setStatus('live');
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const refresh = useCallback((): void => {
    void doFetch();
  }, [doFetch]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (!cancelled) timer = setTimeout(loop, pollMsRef.current);
    };
    const loop = () => {
      void doFetch().then(schedule);
    };
    void doFetch().then(schedule);
    const onVisibility = () => {
      // Back from a hidden tab: pull fresh state immediately.
      if (!cancelled && !document.hidden) void doFetch();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, doFetch]);

  return { score, snapshotAt, status, error, refresh };
}
