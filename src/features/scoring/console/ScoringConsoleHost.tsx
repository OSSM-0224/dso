'use client';

/**
 * Thin tournament-scoped console host:
 *   /score/[tournamentId]/[matchId] -> <ScoringConsoleHost ... />
 *
 * Responsibilities:
 *  - load the match detail (the server verifies match ∈ tournament and
 *    returns 404/403 otherwise);
 *  - resolve the sport Console from the registry via `tournament.sport`
 *    (never hard-coded kho-kho) and show a friendly screen for unregistered
 *    sports;
 *  - own the ordered score event queue (undo ordering, retry/backoff, 4xx
 *    cascade — bug fixes #1/#3) and merge queued events over the server DTO
 *    with `getScoringEngine(tournament.sport)` for the optimistic replay;
 *  - key every queue/state to `${tournamentId}:${matchId}` so nothing spans
 *    matches or tournaments (bug fix #2 — hook + page `key`), with the
 *    beforeunload/pending guard from the hook (bug fix #4);
 *  - auto-complete ONLY when the queue is drained and the SERVER DTO
 *    confirmed the last event — never optimistic state (bug fix #5);
 *  - dedicated "not assigned" screen on 403; login card only on 401.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api.ts';
import type { MatchScoreViewDto, ScoringMatchDetail } from '@/shared/types.ts';
import type { KhoKhoScoreEvent, ScoringSport } from '@/shared/scoring/types.ts';
import { getScoringEngine } from '@/shared/scoring/engine.ts';
import type { ScoringEngine } from '@/shared/scoring/engine.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from '@/features/scoring/ScorerLoginCard.tsx';
import { useScoreEventQueue, type ScoreQueueApi } from '@/features/scoring/shared/useScoreEventQueue.ts';
import { newScoreEventId, offlineChipLabel } from '@/features/scoring/shared/scoreEventQueue.ts';
import { ConsoleShell } from '@/features/scoring/shared/ConsoleShell.tsx';
import { ScoreHeader } from '@/features/scoring/shared/ScoreHeader.tsx';
import {
  getSportConsole,
  type SportConsoleProps,
  type SportConsoleRegistryEntry,
} from '@/features/scoring/consoles/registryComponents.ts';

const btnGhost =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45';

/** Only these tournament statuses accept new scoring traffic. */
const SCOREABLE_TOURNAMENT_STATUSES = ['published', 'ongoing'];

export const ScoringConsoleHost: React.FC<{ tournamentId: string; matchId: string }> = ({
  tournamentId,
  matchId,
}) => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore } = useAuth();

  // Tournament/match metadata + authoritative score source of truth.
  const [detail, setDetail] = useState<ScoringMatchDetail | null>(null);
  const [serverScore, setServerScore] = useState<MatchScoreViewDto | null>(null);
  const serverScoreRef = useRef<MatchScoreViewDto | null>(null);
  const serverReceivedAtRef = useRef<number>(Date.now());
  const [snapshotAt, setSnapshotAt] = useState<number>(() => Date.now());
  const autoCompletingRef = useRef(false);

  const [needsLogin, setNeedsLogin] = useState(false);
  const [notAssigned, setNotAssigned] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [fault, setFault] = useState<{ message: string; droppedCount: number } | null>(null);

  const pollingRef = useRef(false);
  const pendingCountRef = useRef(0);

  // Registry resolution precedes any engine work: unregistered sports get the
  // friendly fallback screen instead of a broken console.
  const sport: string = detail?.tournament.sport ?? '';
  const sportEntry: SportConsoleRegistryEntry | null = useMemo(
    () => (sport ? getSportConsole(sport) : null),
    [sport]
  );
  // Client replay engine — resolved from tournament.sport (spec §3).
  const engine: ScoringEngine | null = useMemo(() => {
    try {
      return sportEntry ? getScoringEngine(sport as ScoringSport) : null;
    } catch {
      return null;
    }
  }, [sportEntry, sport]);

  // ------------------------------------------------ load / poll / apply

  /** Applies a server DTO as the authoritative snapshot. */
  const applyServerScore = useCallback((score: MatchScoreViewDto | null) => {
    serverScoreRef.current = score;
    serverReceivedAtRef.current = Date.now();
    setSnapshotAt(Date.now());
    setServerScore(score);
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoadError(null);
      try {
        const d = await api.scoring.getMatch(tournamentId, matchId);
        // The raw DTO (detail.score) is the server-confirmed snapshot; the
        // optimistic merge lives only in the memoized view below.
        applyServerScore(d.score);
        setDetail(d);
        setNeedsLogin(false);
        setNotAssigned(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not assigned to this match/i.test(message)) {
          setNotAssigned(true);
        } else if (/Authentication required|Access denied|401|403/i.test(message)) {
          setNeedsLogin(true);
        } else if (!silent) {
          setLoadError(message);
        }
      }
    },
    [tournamentId, matchId, applyServerScore]
  );

  useEffect(() => {
    if (authLoading || !canScore) return;
    refresh();
  }, [authLoading, canScore, refresh]);

  // Light polling keeps the console truthful when a second scorer acts.
  useEffect(() => {
    if (!canScore) return;
    const id = window.setInterval(() => {
      if (pendingCountRef.current > 0 || pollingRef.current || document.hidden) return;
      pollingRef.current = true;
      refresh(true).finally(() => {
        pollingRef.current = false;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [canScore, refresh]);

  // Clock interpolation tick (250ms, mirrors the old console).
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // ------------------------------------------------ queue wiring

  const queue: ScoreQueueApi = useScoreEventQueue({
    tournamentId,
    matchId,
    sendEvent: (event, eventId) =>
      api.scoring.appendEvent(tournamentId, matchId, {
        ...(event as Record<string, unknown>),
        eventId,
      }),
    sendUndo: () => api.scoring.undo(tournamentId, matchId),
    onReconcile: () => refresh(true),
    onRejected: (message, droppedCount) => setFault({ message, droppedCount }),
    // Undo is only meaningful against an ACTIVE server session.
    getCanUndo: () => serverScoreRef.current?.status === 'active',
  });
  pendingCountRef.current = queue.queuedCount;

  // --------------------------------------------- optimistic replay (client)

  /**
   * Merges queued (unconfirmed) events over the server DTO with the engine
   * resolved from `tournament.sport` — identical semantics to the old
   * ScorerConsoleScreen replay. Items already confirmed inside the base DTO
   * (event dedupe on retry) are skipped.
   */
  const viewScore = useMemo<MatchScoreViewDto | null>(() => {
    if (!serverScore) return null;
    if (!engine) return serverScore;
    const queuedPayloads = queue.snapshot.queued
      .filter((item) => item.kind === 'event')
      .map((item) => item.payload as KhoKhoScoreEvent);
    if (queuedPayloads.length === 0) return serverScore;

    let state = engine.createInitialState({
      teams: serverScore.teams,
      config: serverScore.config,
    });

    // The server DTO is trusted; a malformed legacy event should not blank
    // the entire optimistic view.
    for (const event of serverScore.events) {
      try {
        state = engine.applyEvent(state, event as KhoKhoScoreEvent);
      } catch {
        // Ignore: the next authoritative refresh will reconcile.
      }
    }

    const confirmedIds = new Set(serverScore.events.map((event) => event.eventId));
    const unconfirmed = queuedPayloads.filter((event) => !confirmedIds.has(event.eventId));
    for (const event of unconfirmed) {
      try {
        state = engine.applyEvent(state, event);
      } catch {
        // Ignore: the server will reject and we will reconcile on failure.
      }
    }

    const nowMs =
      serverScore.serverNowMs + Math.max(0, nowTick - serverReceivedAtRef.current);
    return {
      ...serverScore,
      version: serverScore.version + unconfirmed.length,
      scoreboard: engine.getScoreboard(state, nowMs),
      serverNowMs: nowMs,
    };
  }, [serverScore, engine, queue.snapshot, nowTick]);

  const scoreRef = useRef<MatchScoreViewDto | null>(null);
  scoreRef.current = viewScore;

  // ------------------------------------------------ session actions

  const startScoring = useCallback(async () => {
    setPending(true);
    try {
      await api.scoring.ensureScore(tournamentId, matchId);
      await refresh(true);
    } catch (err) {
      setFault({ message: err instanceof Error ? err.message : 'Could not start scoring', droppedCount: 0 });
    } finally {
      setPending(false);
    }
  }, [tournamentId, matchId, refresh]);

  const completeMatch = useCallback(async () => {
    setPending(true);
    try {
      const res = await api.scoring.complete(tournamentId, matchId);
      applyServerScore(res.score);
      setFault({ message: 'Result recorded to the official bracket.', droppedCount: -1 });
    } finally {
      setPending(false);
    }
  }, [tournamentId, matchId, applyServerScore]);

  const overrideWinner = useCallback(
    async (data: { winnerTeamId: string; reason: string }) => {
      setPending(true);
      try {
        const res = await api.scoring.overrideWinner(tournamentId, matchId, data);
        applyServerScore(res.score ?? null);
        await refresh(true);
      } finally {
        setPending(false);
      }
    },
    [tournamentId, matchId, applyServerScore, refresh]
  );

  /** Queue a scoring event through the ordered queue (returns false if not ready). */
  const postEvent = useCallback(
    (payload: Record<string, unknown>): boolean => {
      const base = serverScoreRef.current;
      if (!base) return false;

      const nowAt = Date.now();
      const serverNowMs = base.serverNowMs + Math.max(0, nowAt - serverReceivedAtRef.current);
      const lastQueued = queue.snapshot.queued[queue.snapshot.queued.length - 1];
      const lastQueuedAtMs = (lastQueued?.payload as { atMs?: number } | undefined)?.atMs ?? 0;
      const clientAtMs = Math.max(lastQueuedAtMs, Math.round(serverNowMs));

      const eventId = newScoreEventId();
      const event = {
        ...payload,
        eventId,
        atMs: clientAtMs,
        clientAtMs,
      } as unknown as KhoKhoScoreEvent;

      queue.enqueueEvent(event, eventId);
      // The optimistic merged view recomputes from queue.snapshot (memo).
      setSnapshotAt(Date.now());
      return true;
    },
    [queue]
  );

  /** Undo the last actionable event through the SAME ordered queue (bug fix #1). */
  const undoEvent = useCallback(() => {
    if (!queue.canUndo) return;
    queue.enqueueUndo();
    setSnapshotAt(Date.now());
  }, [queue]);

  // --------------------------------------------- auto-complete gate

  /**
   * Bug fix #5: fires ONLY when the queue is drained AND the server DTO has
   * confirmed the last event (evaluated on the authoritative serverScore,
   * never the optimistic merged view).
   */
  useEffect(() => {
    if (
      !serverScore ||
      serverScore.status !== 'active' ||
      serverScore.scoreboard.nextAction.action !== 'completed'
    ) {
      return;
    }
    if (queue.queuedCount > 0 || queue.inFlight || pending) return;
    if (detail?.match.status === 'completed') return;
    if (autoCompletingRef.current) return;

    autoCompletingRef.current = true;
    completeMatch()
      .catch(() => {
        // Surfaced by the next poll; completion is retried once the winner
        // prompt is visible again.
      })
      .finally(() => {
        autoCompletingRef.current = false;
      });
  }, [
    serverScore?.version,
    serverScore?.scoreboard.nextAction,
    queue.queuedCount,
    queue.inFlight,
    pending,
    detail?.match.status,
    completeMatch,
  ]);

  // ------------------------------------------------ loading guards

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
        <p className="text-sm font-semibold text-ink">
          {t('You are not assigned to this match/tournament. Ask the organizer to assign you as a scorer.')}
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
    // Registry fallback (spec §6): friendly screen instead of a broken console.
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="flag" size="xl" className="mx-auto mb-2 text-faint" />
        <p className="text-sm font-semibold text-ink">{t('Scoring is not available for this sport yet.')}</p>
        <p className="mt-1 text-xs text-muted">
          {t('The {sport} console is not implemented. The organizer can still record the result from the fixtures screen.', {
            sport: detail.tournament.sport,
          })}
        </p>
        <Link href={`/score/${tournamentId}`} className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to the hub')}
        </Link>
      </div>
    );
  }

  const isReadOnly = !SCOREABLE_TOURNAMENT_STATUSES.includes(detail.tournament.status);

  /**
   * ISOLATION GUARANTEE (spec §5): every piece of interactive state mounts
   * under `key={`${tournamentId}:${matchId}`}` — React remounts the console
   * when navigating between matches or tournaments, so no state or refs are
   * ever reused across keys (the queue is additionally rekeyed).
   */
  const consoleProps: SportConsoleProps = {
    tournamentId,
    matchId,
    tournament: detail.tournament,
    match: detail.match,
    score: viewScore,
    canWrite: !isReadOnly,
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
    <ConsoleShell
      header={
        <ScoreHeader
          left={
            <Link href={`/score/${tournamentId}`} className={`inline-flex ${btnGhost}`}>
              <Icon name="arrowLeft" size="sm" />
              {t('Hub')}
            </Link>
          }
          center={<span className="text-xs font-semibold text-ink">{detail.tournament.name}</span>}
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
      footer={
        queue.isBlocked ? (
          <p className="text-center text-[10px] text-faint">
            {queue.pendingCount > 0 ? t('Syncing {count} event(s)…', { count: queue.pendingCount }) : ''}
          </p>
        ) : null
      }
    >
      <div key={`${tournamentId}:${matchId}`}>
        <Console {...consoleProps} />
      </div>
    </ConsoleShell>
  );
};
