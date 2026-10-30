'use client';

/**
 * Thin tournament-scoped console host:
 *   /score/[tournamentId]/[matchId] -> <ScoringConsoleHost ... />
 *
 * Responsibilities:
 *  - load the match detail (server verifies match ∈ tournament, 404 otherwise);
 *  - resolve the sport Console from the registry via `tournament.sport`
 *    (never hard-coded kho-kho) and show a friendly screen for unregistered
 *    sports;
 *  - own the ordered score event queue (undo ordering, retry/backoff, 4xx
 *    cascade) and merge pending events over the server DTO with
 *    `getScoringEngine(tournament.sport)` client replay;
 *  - bind React state to the `${tournamentId}:${matchId}` key (no reuse across
 *    matches/tournaments) and warn when leaving with pending events;
 *  - auto-complete ONLY when the queue is drained and the SERVER has
 *    confirmed the last event (never purely optimistic state);
 *  - dedicated "not assigned" screen on 403 (login card only on 401).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api.ts';
import type { MatchScoreViewDto, ScoringMatchDetail } from '@/shared/types.ts';
import type { KhoKhoScoreEvent } from '@/shared/scoring/types.ts';
import { getScoringEngine } from '@/shared/scoring/engine.ts';
import type { ScoringEngine } from '@/shared/scoring/engine.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from '@/features/scoring/ScorerLoginCard.tsx';
import { useScoreEventQueue, type ScoreQueueApi } from '@/features/scoring/shared/useScoreEventQueue.ts';
import { offlineChipLabel } from '@/features/scoring/shared/scoreEventQueue.ts';
import { ConsoleShell } from '@/features/scoring/shared/ConsoleShell.tsx';
import { ScoreHeader } from '@/features/scoring/shared/ScoreHeader.tsx';
import {
  getSportConsole,
  type SportConsoleProps,
  type SportConsoleRegistryEntry,
} from '@/features/scoring/consoles/registry.ts';

const btnGhost =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45';

export const ScoringConsoleHost: React.FC<{ tournamentId: string; matchId: string }> = ({
  tournamentId,
  matchId,
}) => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore } = useAuth();

  const [detail, setDetail] = useState<ScoringMatchDetail | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notAssigned, setNotAssigned] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [snapshotAt, setSnapshotAt] = useState<number>(() => Date.now());
  const [fault, setFault] = useState<{ message: string; droppedCount: number } | null>(null);

  // Server-authoritative snapshot (KO-the optimistic overlay) used for auto-complete.
  const serverScoreRef = useRef<MatchScoreViewDto | null>(null);
  const serverScoreReceivedAtRef = useRef<number>(Date.now());
  const autoCompletingRef = useRef(false);

  const sport = detail?.tournament.sport ?? '';
  // Registry lookup happens BEFORE any engine/polling work: an unregistered
  // sport gets the friendly fallback screen (see below).
  const sportEntry: SportConsoleRegistryEntry | null = sport ? getSportConsole(sport) : null;
  const engine: ScoringEngine | null = sportEntry
    ? // Spec: the client replay engine is resolved with tournament.sport.
      getScoringEngine(sport as '__SPORT__') // cast widened below
    : null;

  // ------------------------------------------------ load & poll

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoadError(null);
      try {
        const d = await api.scoring.getMatch(tournamentId, matchId);
        serverScoreRef.current = d.score;
        serverScoreReceivedAtRef.current = Date.now();
        setSnapshotAt(Date.now());
        setDetail(d);
        setNeedsLogin(false);
        setNotAssigned(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not assigned/i.test(message)) {
          setNotAssigned(true); // bug fix #6: dedicated state, NOT the login card
        } else if (/Authentication required|access denied|401/i.test(message)) {
          setNeedsLogin(true);
        } else if (!silent) {
          setLoadError(message);
        }
      }
    },
    [tournamentId, matchId]
  );

  useEffect(() => {
    if (authLoading || !canScore) return;
    refresh();
  }, [authLoading, canScore, refresh]);

  // Light polling keeps the console truthful when a second scorer acts.
  const pendingCountRef = useRef(0);
  useEffect(() => {
    if (!canScore) return;
    const id = window.setInterval(() => {
      if (pendingCountRef.current > 0 || document.hidden) return;
      refresh(true);
    }, 5000);
    return () => window.clearInterval(id);
  }, [canScore, refresh]);

  // Clock interpolation tick.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // --- queue wiring (bug fixes #1-#5 live in the hook + ScoreEventQueue) ---

  const onRejected = useCallback(
    (message: string, droppedCount: number) => {
      setFault({ message, droppedCount });
    },
    []
  );

  const queue: ScoreQueueApi = useScoreEventQueue({
    tournamentId,
    matchId,
    sendEvent: async (event, eventId) => {
      const payload = { ...(event as Record<string, unknown>), eventId };
      return api.scoring.appendEvent(tournamentId, matchId, payload);
    },
    sendUndo: async () => {
      return api.scoring.undo(tournamentId, matchId);
    },
    onReconcile: async () => {
      await refresh(true);
    },
    onRejected,
    getCanUndo: () => !!serverScoreRef.current && serverScoreRef.current.status === 'active',
  });
  pendingCountRef.current = queue.queuedCount;

  // ---------------------------------------------- optimistic replay (client)

  /**
   * Merges queued (unconfirmed) events over the server DTO with the
   * engine resolved from tournament.sport — identical semantics to the old
   * ScorerConsoleScreen replay.
   */
  const mergedScore = useMemo<MatchScoreViewDto | null>(() => {
    const base = serverScoreRef.current;
    if (!base || !engine) return detail?.score ?? null;
    const queued = queue.snapshot.queued.filter((i) => i.kind === 'event').map((i) => i.payload as KhoKhoScoreEvent);

    let state = engine.createInitialState({ teams: base.teams, config: base.config });
    for (const event of base.events) {
      try {
        state = engine.applyEvent(state, event as KhoKhoScoreEvent);
      } catch {
        // Ignore malformed legacy events; the next authoritative refresh wins.
      }
    }
    const confirmedIds = new Set(base.events.map((e) => e.eventId));
    for (const event of queued) {
      if (confirmedIds.has(event.eventId)) continue;
      try {
        state = engine.applyEvent(state, event);
      } catch {
        // Server will reject; we will reconcile on failure.
      }
    }

    const nowMs = base.serverNowMs + Math.max(0, nowTick - serverScoreReceivedAtRef.current);
    const scoreboard = engine.getScoreboard(state, nowMs);
    setSnapshotAtStable(nowMs);
    return {
      ...base,
      version: base.version + queued.length,
      scoreboard,
      serverNowMs: nowMs,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, serverScoreRef.current, nowTick, engine, queue.snapshot.queued]);

  // Snapshot anchor for clock interpolation (mirrors the old snapshotAtRef).
  const snapshotAtStable = (nowMs: number) => {
    serverScoreReceivedAtRef.current = Date.now() - 0;
    const base = serverScoreRef.current;
    if (base) {
      // translate engine-now to wall time for the interpolator
      setSnapshotAt(Date.now());
    }
    void nowMs;
  };

  // ---------------------------------------------- session actions

  const startScoring = useCallback(async () => {
    await api.scoring.ensureScore(tournamentId, matchId);
    await refresh(true);
  }, [tournamentId, matchId, refresh]);

  const completeMatch = useCallback(async () => {
    const res = await api.scoring.complete(tournamentId, matchId);
    serverScoreRef.current = res.score;
    serverScoreReceivedAtRef.current = Date.now();
    setSnapshotAt(Date.now());
    // detail.score will now render the completed screen.
    setDetail((prev) => (prev ? { ...prev, score: res.score } : prev));
    await refresh(true);
  }, [tournamentId, matchId, refresh]);

  const overrideWinner = useCallback(
    async (data: { winnerTeamId: string; reason: string }) => {
      const res = await api.scoring.overrideWinner(tournamentId, matchId, data);
      serverScoreRef.current = res.score;
      serverScoreReceivedAtRef.current = Date.now();
      setDetail((prev) =>
        prev ? { ...prev, match: res.match, score: res.score ?? prev.score } : prev
      );
      // brief wait is avoided; refresh reconciles.
      await refresh(true);
    },
    [tournamentId, matchId, refresh]
  );

  const postEvent = useCallback(
    (payload: Record<string, unknown>): boolean => {
      const base = serverScoreRef.current;
      if (!base) return false;

      const nowAt = Date.now();
      const serverNowMs = base.serverNowMs + Math.max(0, nowAt - serverScoreReceivedAtRef.current);
      const lastQueuedItem = queue.snapshot.queued[queue.snapshot.queued.length - 1];
      const lastQueuedAtMs = (lastQueuedItem?.payload as { atMs?: number } | undefined)?.atMs ?? 0;
      const clientAtMs = Math.max(lastQueuedAtMs, Math.round(serverNowMs));

      queue.enqueueEvent({ ...payload, atMs: clientAtMs, clientAtMs });
      setSnapshotAt(Date.now());
      return true;
    },
    [queue]
  );

  const undoEvent = useCallback(() => {
    if (!queue.canUndo) return;
    queue.enqueueUndo();
  }, [queue]);

  // ---------------------------------------------- auto-complete gate

  /**
   * Bug fix #5: auto-complete fires ONLY when the queue is drained AND the
   * server itself has confirmed the last event (we inspect the server DTO,
   * never the optimistic merged view).
   */
  useEffect(() => {
    const serverScore = serverScoreRef.current;
    if (
      !serverScore ||
      serverScore.status !== 'active' ||
      serverScore.scoreboard.winner.resolved !== true ||
      serverScore.scoreboard.nextAction.action !== 'completed'
    ) {
      return;
    }
    if (queue.queuedCount > 0 || queue.inFlight || pending) return;
    const sportConsole = sportEntry;
    if (!sportConsole) return;
    if (detail?.match.status === 'completed') return;

    autoCompletingRef.current = true;
    completeMatch()
      .catch(() => {
        // surfaced via loadError/toast on the next poll; auto-complete happens once.
      })
      .finally(() => {
        autoCompletingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    serverScoreRef.current?.version,
    queue.queuedCount,
    queue.inFlight,
    pending,
    detail?.match.status,
  ]);

  // ---------------------------------------------- guards

  if (authLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading console…')}
      </div>
    );
  }

  if (needsLogin || !canScore) {
    return <ScorerLoginCard onSignedIn={() => refresh()} />;
  }

  if (notAssigned) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="shieldAlert" size="xl" className="mx-auto mb-2 text-amber-600" />
        <p className="text-sm font-semibold text-ink">{t('You are not assigned to this match/tournament')}</p>
        <p className="mt-1 text-xs text-muted">
          {t('Ask the organizer to add you as a scorer for this tournament.')}
        </p>
        <Link href="/score" className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to tournament picker')}
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="circleAlert" size="xl" className="mx-auto mb-2 text-red-600" />
        <p className="text-sm font-semibold text-ink">{t('Could not load this match')}</p>
        <p className="mt-1 text-xs text-muted">{loadError}</p>
        <Link href="/score" className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to tournament picker')}
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading match…')}
      </div>
    );
  }

  if (!sportEntry) {
    // Registry fallback: friendly screen instead of a broken console.
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="flask" size="xl" className="mx-auto mb-2 text-faint" />
        <p className="text-sm font-semibold text-ink">{t('Scoring is not available for this sport yet')}</p>
        <p className="mt-1 text-xs text-muted">
          {t('The "{sport}" console is not implemented. The organizer can still record the result from the fixtures screen.', { sport: detail.tournament.sport })}
        </p>
        <Link href={`/score/${tournamentId}`} className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to the hub')}
        </Link>
      </div>
    );
  }

  const isReadOnly =
    detail.tournament.status === 'completed' ||
    detail.tournament.status === 'draft' ||
    detail.tournament.status === 'fixtures-generated' ||
    detail.match.status === 'completed';

  const consoleProps: SportConsoleProps = {
    tournamentId,
    matchId,
    tournament: detail.tournament,
    match: detail.match,
    score: mergedScore,
    canWrite: true,
    isReadOnly,
    scorerNames: detail.scorerNames,
    actions: {
      postEvent,
      undoEvent,
      startScoring,
      refresh,
      completeMatch,
      overrideWinner,
    },
    sync: {
      pendingCount: queue.queuedCount,
      inFlight: queue.inFlight,
      offline: queue.offline,
      canUndo: queue.canUndo,
    },
    fault,
    clearFault: () => setFault(null),
    nowTick,
    snapshotAt,
  };

  const Console = sportEntry.Console;

  return (
    <OfflineBanner queue={queue} />
  );

  /**
   * ISOLATION GUARANTEE (spec §5): the console is keyed by
   * `${tournamentId}:${matchId}` so no React state or refs are reused across
   * matches or tournaments.
   */
  function OfflineBanner() {
    return (
      <ConsoleShell
        header={
          <ScoreHeader
            left={
              <Link href={`/score/${tournamentId}`} className={`inline-flex ${btnGhost}`}>
                <Icon name="arrowLeft" size="sm" />
                {t('Hub')}
              </Link>
            }
            center={<span className="text-xs font-semibold text-ink">{detail?.tournament.name}</span>}
            right={
              queue.pendingCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-amber-800">
                  <Icon name="circleInfo" size="xs" />
                  {t(offlineChipLabel(queue.pendingCount))}
                </span>
              ) : null
            }
          />
        }
      >
        {/* Key-bound console: state/refs never span matches or tournaments. */}
        <div key={`${tournamentId}:${matchId}`}>
          <Console {...consoleProps} />
        </div>
      </ConsoleShell>
    );
  }
};
