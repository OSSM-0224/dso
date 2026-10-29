'use client';

/**
 * Single-match LIVE SCORER console (/score/[matchId]). Every visible prompt is
 * driven by the server-built scoreboard (`nextAction`), and every clock value
 * is server-authoritative: the client only interpolates the remaining/paused
 * time between polls. Pause shows a large "CLOCK STOPPED" banner with the
 * 2-minute resume reminder (PAUSE_REMINDER_MS).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api.ts';
import type { MatchScoreViewDto } from '@/shared/types.ts';
import type {
  KhoKhoNextAction,
  KhoKhoScoreEvent,
  KhoKhoTurnSummary,
} from '@/shared/scoring/types.ts';
import { PAUSE_REMINDER_MS } from '@/shared/scoring/types.ts';
import { getScoringEngine } from '@/shared/scoring/engine.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from './ScorerLoginCard.tsx';

type ScoringDetail = Awaited<ReturnType<typeof api.scoring.getMatch>>;

const fmtClock = (ms: number) => {
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtTimeString = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const newEventId = () => `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const DISMISSAL_ACTIONS: Array<{ label: string; type: 'TAG' | 'OUT_OF_BOUNDS' | 'LATE_ENTRY' }> = [
  { label: 'Tagged out', type: 'TAG' },
  { label: 'Out of bounds', type: 'OUT_OF_BOUNDS' },
  { label: 'Late entry', type: 'LATE_ENTRY' },
];

const btnGhost =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45';
const btnPrimary =
  'flex items-center justify-center gap-1.5 rounded-[6px] bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity duration-200 disabled:opacity-45';
const btnAccent =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-soft bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-strong transition-colors duration-200 disabled:opacity-45';

export const ScorerConsoleScreen: React.FC<{ matchId: string }> = ({ matchId }) => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore, user } = useAuth();

  const [detail, setDetail] = useState<ScoringDetail | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ tone: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [queuedEvents, setQueuedEvents] = useState<KhoKhoScoreEvent[]>([]);
  const snapshotAtRef = useRef<number>(Date.now());
  const autoCompletingRef = useRef(false);
  const queueRef = useRef<KhoKhoScoreEvent[]>([]);
  const flushingRef = useRef(false);
  const serverScoreRef = useRef<MatchScoreViewDto | null>(null);
  const serverScoreReceivedAtRef = useRef<number>(Date.now());

  const [showOverride, setShowOverride] = useState(false);
  const [overrideWinner, setOverrideWinner] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState('');
  const [manualWinner, setManualWinner] = useState<string>('');
  const [manualReason, setManualReason] = useState('');
  const [suddenElapsed, setSuddenElapsed] = useState<Record<string, string>>({});
  const [showEarlyEnd, setShowEarlyEnd] = useState(false);
  const [earlyEndReason, setEarlyEndReason] = useState('');

  // ---------------- data ----------------

  const replayScore = useCallback(
    (
      base: MatchScoreViewDto,
      pending: KhoKhoScoreEvent[],
      nowAt = Date.now()
    ): MatchScoreViewDto => {
      const localEngine = getScoringEngine('kho-kho');
      let state = localEngine.createInitialState({
        teams: base.teams,
        config: base.config,
      });

      // The server DTO is trusted; a malformed legacy event should not blank
      // the entire optimistic view.
      for (const event of base.events) {
        try {
          state = localEngine.applyEvent(state, event as KhoKhoScoreEvent);
        } catch {
          // Ignore: the next authoritative refresh will reconcile.
        }
      }

      const confirmedIds = new Set(base.events.map((event) => event.eventId));
      const unconfirmed = pending.filter((event) => !confirmedIds.has(event.eventId));
      for (const event of unconfirmed) {
        try {
          state = localEngine.applyEvent(state, event);
        } catch {
          // Ignore: the server will reject and we will reconcile on failure.
        }
      }

      const nowMs =
        base.serverNowMs + Math.max(0, nowAt - serverScoreReceivedAtRef.current);
      return {
        ...base,
        version: base.version + unconfirmed.length,
        scoreboard: localEngine.getScoreboard(state, nowMs),
        serverNowMs: nowMs,
      };
    },
    []
  );

  const showScore = useCallback(
    (base: MatchScoreViewDto, pending: KhoKhoScoreEvent[]) => {
      const score = pending.length > 0 ? replayScore(base, pending) : base;
      snapshotAtRef.current = Date.now();
      setDetail((prev) => (prev ? { ...prev, score } : prev));
    },
    [replayScore]
  );

  const applyScore = useCallback(
    (score: MatchScoreViewDto | null) => {
      serverScoreRef.current = score;
      serverScoreReceivedAtRef.current = Date.now();
      if (!score) {
        snapshotAtRef.current = Date.now();
        setDetail((prev) => (prev ? { ...prev, score: null } : prev));
        return;
      }
      showScore(score, queueRef.current);
    },
    [showScore]
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoadError(null);
      }
      try {
        const d = await api.scoring.getMatch(matchId);
        serverScoreRef.current = d.score;
        serverScoreReceivedAtRef.current = Date.now();
        const nextScore =
          d.score && queueRef.current.length > 0
            ? replayScore(d.score, queueRef.current)
            : d.score;
        snapshotAtRef.current = Date.now();
        setDetail({ ...d, score: nextScore });
        setNeedsLogin(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/Authentication required|Access denied|401|403/i.test(message)) {
          setNeedsLogin(true);
        } else if (!silent) {
          setLoadError(message);
        }
      }
    },
    [matchId, replayScore]
  );

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setPending(true);
    try {
      while (queueRef.current.length > 0) {
        const event = queueRef.current[0];
        try {
          const dto = await api.scoring.appendEvent(
            matchId,
            event as unknown as Record<string, unknown>
          );
          queueRef.current = queueRef.current.filter(
            (queued) => queued.eventId !== event.eventId
          );
          setQueuedEvents(queueRef.current);
          applyScore(dto);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Event rejected';
          queueRef.current = queueRef.current.filter(
            (queued) => queued.eventId !== event.eventId
          );
          setQueuedEvents(queueRef.current);
          setToast({ tone: 'error', text: message.replace(/^[A-Z_]+:\s*/, '') });
          await refresh(true);
        }
      }
    } finally {
      flushingRef.current = false;
      setPending(false);
    }
  }, [matchId, applyScore, refresh]);

  useEffect(() => {
    if (authLoading || !canScore) return;
    refresh();
  }, [authLoading, canScore, refresh]);

  // Light polling keeps the console truthful when a second scorer acts.
  useEffect(() => {
    if (!canScore) return;
    const id = window.setInterval(() => {
      if (pending || document.hidden) return;
      refresh(true);
    }, 5000);
    return () => window.clearInterval(id);
  }, [canScore, refresh, pending]);

  // Clock interpolation tick.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ---------------- actions ----------------

  const postEvent = useCallback(
    async (payload: Record<string, unknown>) => {
      const base = serverScoreRef.current;
      if (!base) {
        setToast({ tone: 'error', text: 'The score session is still loading. Try again.' });
        return false;
      }

      const nowAt = Date.now();
      const serverNowMs =
        base.serverNowMs + Math.max(0, nowAt - serverScoreReceivedAtRef.current);
      const lastQueued = queueRef.current[queueRef.current.length - 1];
      const clientAtMs = Math.max(
        lastQueued?.atMs ?? 0,
        Math.round(serverNowMs)
      );

      const event = {
        ...payload,
        eventId: newEventId(),
        atMs: clientAtMs,
        clientAtMs,
      } as unknown as KhoKhoScoreEvent;

      queueRef.current = [...queueRef.current, event];
      setQueuedEvents(queueRef.current);
      showScore(base, queueRef.current);
      void flushQueue();
      return true;
    },
    [flushQueue, showScore]
  );

  const doUndo = useCallback(async () => {
    setPending(true);
    try {
      const dto = await api.scoring.undo(matchId);
      applyScore(dto);
      setToast({ tone: 'info', text: 'Last event undone (kept in the audit trail).' });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Undo failed' });
    } finally {
      setPending(false);
    }
  }, [matchId, applyScore]);

  const startScoring = useCallback(async () => {
    setPending(true);
    try {
      await api.scoring.ensureScore(matchId);
      await refresh(true);
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start scoring' });
    } finally {
      setPending(false);
    }
  }, [matchId, refresh]);

  const doComplete = useCallback(async () => {
    setPending(true);
    try {
      const res = await api.scoring.complete(matchId);
      applyScore(res.score);
      setToast({ tone: 'success', text: 'Result recorded to the official bracket.' });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Completion failed' });
    } finally {
      setPending(false);
    }
  }, [matchId, applyScore]);

  const doOverride = useCallback(async () => {
    if (!overrideWinner || overrideReason.trim().length < 5) return;
    setPending(true);
    try {
      const res = await api.scoring.overrideWinner(matchId, {
        winnerTeamId: overrideWinner,
        reason: overrideReason.trim(),
      });
      applyScore(res.score);
      setShowOverride(false);
      setToast({ tone: 'success', text: 'Winner overridden and recorded.' });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Override failed' });
    } finally {
      setPending(false);
    }
  }, [matchId, overrideWinner, overrideReason, applyScore]);

  // ---------------- derived ----------------

  const score = detail?.score ?? null;
  const sb = score?.scoreboard ?? null;
  const action = sb?.nextAction as KhoKhoNextAction | undefined;
  const turn = sb?.currentTurn ?? null;

  const clock = useMemo(() => {
    const drift = Math.max(0, nowTick - snapshotAtRef.current);
    if (!action) return { remainingMs: null, pausedForMs: null, remind: false };
    if (action.action === 'turn_running') {
      return { remainingMs: Math.max(0, action.remainingMs - drift), pausedForMs: null, remind: false };
    }
    if (action.action === 'turn_paused') {
      const pausedFor = action.pausedForMs + drift;
      return {
        remainingMs: Math.max(0, action.remainingMs),
        pausedForMs: pausedFor,
        remind: pausedFor >= PAUSE_REMINDER_MS,
      };
    }
    if (action.action === 'end_turn_available') {
      return { remainingMs: Math.max(0, action.remainingMs - drift), pausedForMs: null, remind: false };
    }
    return { remainingMs: null, pausedForMs: null, remind: false };
  }, [action, nowTick]);

  const teamsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; schoolName?: string }>();
    for (const t of score?.teams ?? []) map.set(t.id, t);
    return map;
  }, [score]);

  const turnEndHint = useMemo(() => {
    if (!turn) return null;
    if (turn.allOut) return { reason: 'all_out' as const, label: 'All defenders out — close turn' };
    if (
      clock.remainingMs === 0 &&
      (action?.action === 'end_turn_available' || action?.action === 'turn_running')
    ) {
      return { reason: 'timer_expired' as const, label: 'Time expired — close turn' };
    }
    return null;
  }, [turn, clock.remainingMs, action]);

  // Auto-complete once the engine resolves the winner.
  useEffect(() => {
    if (!sb || !score) return;
    if (score.status !== 'active' || sb.nextAction.action !== 'completed') return;
    if (autoCompletingRef.current || pending) return;
    autoCompletingRef.current = true;
    doComplete().finally(() => {
      autoCompletingRef.current = false;
    });
  }, [sb, score, pending, doComplete]);

  // ---------------- guards ----------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t("Loading console…")}
      </div>
    );
  }

  if (needsLogin || !canScore) {
    return <ScorerLoginCard onSignedIn={() => refresh()} />;
  }

  if (loadError) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="circleAlert" size="xl" className="mx-auto mb-2 text-red-600" />
        <p className="text-sm font-semibold text-ink">{t("Could not load this match")}</p>
        <p className="mt-1 text-xs text-muted">{loadError}</p>
        <Link href="/score" className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t("Back to my matches")}
        </Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t("Loading match…")}
      </div>
    );
  }

  const { match, tournament, scorerNames } = detail;
  const teamAName = teamsById.get(match.teamA?.id ?? '')?.name ?? match.teamA?.name ?? t("TBD");
  const teamBName = teamsById.get(match.teamB?.id ?? '')?.name ?? match.teamB?.name ?? t("TBD");

  const banner = toast ? (
    <div
      className={`flex items-start gap-2 rounded-[6px] px-3 py-2 text-xs font-medium ${
        toast.tone === 'error'
          ? 'bg-red-50 text-red-700'
          : toast.tone === 'success'
            ? 'bg-emerald-50 text-emerald-800'
            : 'bg-canvas text-ink'
      }`}
    >
      <Icon name={toast.tone === 'error' ? 'circleAlert' : toast.tone === 'success' ? 'circleCheck' : 'circleInfo'} size="sm" className="mt-0.5 shrink-0" />
      <span>{t(toast.text)}</span>
    </div>
  ) : null;

  const totals = sb?.teams ?? [];
  const totalA = totals.find((t) => t.id === match.teamA?.id)?.totalPoints ?? 0;
  const totalB = totals.find((t) => t.id === match.teamB?.id)?.totalPoints ?? 0;

  const TotalsStrip = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[12px] border border-hairline bg-surface p-4">
      <div className="text-center">
        <p className="truncate text-xs font-semibold text-ink">{teamAName}</p>
        <p className="font-mono text-4xl font-bold tabular-nums text-ink">{totalA}</p>
      </div>
      <span className="font-serif text-sm text-faint">{t("vs")}</span>
      <div className="text-center">
        <p className="truncate text-xs font-semibold text-ink">{teamBName}</p>
        <p className="font-mono text-4xl font-bold tabular-nums text-ink">{totalB}</p>
      </div>
    </div>
  );

  // ---------------- match finished ----------------

  if (score && score.status === 'completed') {
    const winnerId = score.winnerTeamIds?.[0];
    const winnerLabel = sb?.winner.label || '';
    const winnerName = winnerId ? teamsById.get(winnerId)?.name : null;
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
          <Icon name="flag" size="xl" className="mx-auto mb-3 text-accent-strong" />
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{t("Match completed")}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">{winnerName || t("Result recorded")}</h1>
          {winnerLabel && <p className="mt-1 text-xs font-semibold text-accent-strong">{winnerLabel}</p>}
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 items-center gap-2">
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">{totalA}</p>
            <p className="text-center text-[10px] uppercase tracking-wider text-faint">{t("Final")}</p>
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">{totalB}</p>
          </div>
          <p className="mt-4 text-[11px] text-muted">
            {t("Winner recorded to the official bracket (advancement, audit log and school notifications done).")}
          </p>
          <Link href="/score" className={`mt-4 inline-flex ${btnGhost}`}>
            <Icon name="arrowLeft" size="sm" />
            {t("Back to my matches")}
          </Link>
        </div>
      </div>
    );
  }

  // ---------------- no score session yet ----------------

  if (!score || !sb) {
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
        <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
            {tournament.name} · {match.roundName} · {t("Match #{number}", { number: match.matchNumber })}
          </p>
          <h1 className="mt-3 text-center font-serif text-xl font-semibold text-ink">
            {teamAName}
            <span className="mx-2 text-faint">{t("vs")}</span>
            {teamBName}
          </h1>
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
            {match.venue && (
              <span className="inline-flex items-center gap-1">
                <Icon name="location" size="xs" /> {match.venue}
              </span>
            )}
            {fmtTimeString(match.scheduledAt) && (
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" size="xs" /> {fmtTimeString(match.scheduledAt)}
              </span>
            )}
            {scorerNames.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="userPlus" size="xs" /> {scorerNames.join(', ')}
              </span>
            )}
          </div>

          <button onClick={startScoring} disabled={pending} className={`mt-5 w-full ${btnPrimary}`}>
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
            {t("Start scoring session")}
          </button>
          <p className="mt-2 text-center text-[10px] text-faint">{t("First step: the toss")}</p>
        </div>
        <Link href="/score" className={`w-full ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t("Back to my matches")}
        </Link>
      </div>
    );
  }

  // ---------------- pre-match toss panel ----------------

  let promptBody: React.ReactNode = null;

  if (action?.action === 'prompt_toss' || action?.action === 'prompt_extra_toss') {
    const stage = action.action === 'prompt_extra_toss' ? 'extra_innings' : 'first_innings';
    promptBody = <TossPanel stage={stage} round={action.action === 'prompt_extra_toss' ? action.round : undefined} onEvent={postEvent} pending={pending} teams={[teamAName, teamBName]} teamAId={match.teamA?.id || ''} teamBId={match.teamB?.id || ''} />;
  } else if (action?.action === 'start_turn') {
    promptBody = (
      <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
          {action.stage} · {t("Turn {turn}", { turn: action.turn })}
        </p>
        <p className="mt-1 text-sm text-muted">{t("To chase:")}</p>
        <p className="font-serif text-xl font-semibold text-ink">{action.chaserTeamName}</p>
        <button
          onClick={() =>
            postEvent({
              type: 'TURN_START',
              innings: action.innings,
              turn: action.turn,
              chaserTeamId: action.chaserTeamId,
            })
          }
          disabled={pending}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
          {t("Start turn ({turnLabel})", { turnLabel: action.turnLabel })}
        </button>
      </div>
    );
  } else if (action?.action === 'turn_running' || action?.action === 'turn_paused' || action?.action === 'end_turn_available') {
    promptBody = (
      <TurnPanel
        action={action}
        turn={turn}
        clockRemaining={clock.remainingMs}
        pausedForMs={clock.pausedForMs}
        remind={clock.remind}
        chaserName={turn ? teamsById.get(turn.chaserTeamId)?.name : undefined}
        onEvent={postEvent}
        pending={pending}
        showEarlyEnd={showEarlyEnd}
        setShowEarlyEnd={setShowEarlyEnd}
        earlyEndReason={earlyEndReason}
        setEarlyEndReason={setEarlyEndReason}
        turnEndHint={turnEndHint}
      />
    );
  } else if (action?.action === 'prompt_follow_on') {
    promptBody = (
      <div className="rounded-[12px] border border-amber-200 bg-amber-50/60 p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
          <Icon name="swap" size="xs" /> {t("Follow-on decision")}
        </p>
        <p className="mt-2 text-sm text-ink">
          <span className="font-semibold">{action.leaderTeamName}</span> {t("leads by")}{' '}
          <span className="font-mono font-bold">{action.leadPoints}</span> {t("pts (threshold {threshold}).", { threshold: action.threshold })}{' '}
          {t("They may enforce a follow-on — the trailing team then chases first in the second innings.")}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => postEvent({ type: 'FOLLOW_ON_DECISION', optedByTeamId: action.leaderTeamId, opted: true })}
            disabled={pending}
            className={btnPrimary}
          >
            <Icon name="check" size="sm" /> {t("Enforce follow-on")}
          </button>
          <button
            onClick={() => postEvent({ type: 'FOLLOW_ON_DECISION', optedByTeamId: action.leaderTeamId, opted: false })}
            disabled={pending}
            className={btnGhost}
          >
            {t("Decline — default order")}
          </button>
        </div>
      </div>
    );
  } else if (action?.action === 'record_min_time') {
    promptBody = (
      <div className="space-y-3">
        <div className="rounded-[12px] border border-hairline bg-surface p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
            <Icon name="stopwatch" size="xs" /> {t("Sudden death attempts")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("Tie unresolved — record each team's attempt. A score beats a failed attempt; two similar results are separated by the smaller elapsed time.")}
          </p>
        </div>
        {action.pendingTeamIds.map((teamId) => {
          const name = teamsById.get(teamId)?.name ?? teamId;
          const raw = suddenElapsed[teamId] ?? '';
          const seconds = Number.parseFloat(raw);
          const elapsedMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
          return (
            <div key={teamId} className="rounded-[12px] border border-hairline bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{name}</p>
              <label className="mt-2 block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                  {t("Attempt time (seconds)")}
                </span>
                <input
                  value={raw}
                  onChange={(e) => setSuddenElapsed((m) => ({ ...m, [teamId]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={t("e.g. 7.4")}
                  className="w-32 rounded-[6px] border border-hairline bg-canvas px-3 py-2 font-mono text-sm tabular-nums text-ink focus:border-accent-strong focus:outline-none"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    elapsedMs
                      ? postEvent({ type: 'MIN_TIME_RESULT', teamId, scored: true, elapsedMs })
                      : setToast({ tone: 'error', text: 'Enter a valid attempt time (seconds) to record a score.' })
                  }
                  disabled={pending}
                  className={btnAccent}
                >
                  <Icon name="circleCheck" size="sm" /> {t("Scored")}
                </button>
                <button
                  onClick={() => postEvent({ type: 'MIN_TIME_RESULT', teamId, scored: false })}
                  disabled={pending}
                  className={btnGhost}
                >
                  <Icon name="xmark" size="sm" /> {t("Failed")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (action?.action === 'prompt_manual_decision') {    promptBody = (
      <div className="rounded-[12px] border border-hairline bg-surface p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
          <Icon name="gavel" size="xs" /> {t("Manual decision required")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("The engine cannot resolve this match (e.g. both sudden-death attempts failed or equal). Pick the winner and provide the official reason — this is audited.")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([match.teamA?.id || '', match.teamB?.id || ''] as string[]).map((id, idx) => (
            <button
              key={id}
              onClick={() => setManualWinner(id)}
              className={`rounded-[6px] border px-3 py-2.5 text-sm font-semibold ${
                manualWinner === id
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-hairline bg-surface text-ink'
              }`}
            >
              {idx === 0 ? teamAName : teamBName}
            </button>
          ))}
        </div>
        <textarea
          value={manualReason}
          onChange={(e) => setManualReason(e.target.value)}
          rows={3}
          placeholder={t("Reason for the manual decision (required)")}
          className="mt-3 w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-accent-strong focus:outline-none"
        />
        <button
          onClick={() =>
            postEvent({ type: 'MANUAL_DECISION', winnerTeamId: manualWinner, reason: manualReason.trim() })
          }
          disabled={pending || !manualWinner || manualReason.trim().length < 5}
          className={`mt-3 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="gavel" size="sm" />}
          {t("Record manual decision")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banner}

      <div className="rounded-[12px] border border-hairline bg-surface p-4">
        <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
          {tournament.name} · {match.roundName} · {t("Match #{number}", { number: match.matchNumber })}
        </p>
        <div className="mt-2 text-center font-serif text-[17px] font-semibold text-ink">
          {teamAName} <span className="text-faint">{t("vs")}</span> {teamBName}
        </div>
        <p className="mt-1 text-center text-[11px] text-muted">
          {sb.phase.replace(/_/g, ' ')} · v{score.version} {scorerNames.length > 0 ? `· ${t("scorers: {names}", { names: scorerNames.join(', ') })}` : ''}
        </p>
      </div>

      {TotalsStrip}
      {promptBody}

      {sb.completedTurns.length > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t("Completed turns")}</p>
          <ul className="space-y-1.5">
            {sb.completedTurns.map((t, i) => (
              <li key={`${t.slot}-${i}`} className="flex items-center justify-between gap-2 text-xs text-ink">
                <span className="shrink-0 text-muted">{t.turnLabel}</span>
                <span className="truncate">{teamsById.get(t.chaserTeamId)?.name ?? t.chaserTeamName}</span>
                <span className="flex items-center gap-2 font-mono tabular-nums">
                  <span>+{t.points}</span>
                  {t.allOut && <span className="text-[10px] font-bold text-accent-strong">{t("ALL OUT")}</span>}
                  <span className="text-faint">{t.status === 'ended' ? fmtClock(t.runningElapsedMs || 0) : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showOverride && (
        <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
            <Icon name="gavel" size="xs" /> {t("Override winner (emergency)")}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {t("Bypasses the event flow and records the result immediately. Reason is mandatory and audited.")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([match.teamA?.id || '', match.teamB?.id || ''] as string[]).map((id, idx) => (
              <button
                key={id}
                onClick={() => setOverrideWinner(id)}
                className={`rounded-[6px] border px-3 py-2 text-xs font-semibold ${
                  overrideWinner === id
                    ? 'border-amber-600 bg-amber-100 text-amber-900'
                    : 'border-amber-200 bg-white text-ink'
                }`}
              >
                {idx === 0 ? teamAName : teamBName}
              </button>
            ))}
          </div>
          <textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
            placeholder={t("Reason (required, min 5 characters)")}
            className="mt-2 w-full rounded-[6px] border border-amber-200 bg-white px-3 py-2 text-sm text-ink"
          />
          <button onClick={doOverride} disabled={pending || !overrideWinner || overrideReason.trim().length < 5} className={`mt-2 w-full ${btnPrimary}`}>
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="gavel" size="sm" />}
            {t("Declare winner & finish")}
          </button>
          <button onClick={() => setShowOverride(false)} className={`mt-2 w-full ${btnGhost}`}>
            {t("Cancel")}
          </button>
        </div>
      )}

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={doUndo} disabled={pending} className={btnGhost}>
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="rotate" size="sm" />}
            {t("Undo last event")}
          </button>
          {score.status === 'active' && !showOverride && sb.winner.resolved ? (
            <button onClick={doComplete} disabled={pending} className={btnPrimary}>
              {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />}
              {t("Complete match")}
            </button>
          ) : !showOverride ? (
            <button onClick={() => setShowOverride(true)} disabled={pending} className={btnGhost}>
              <Icon name="gavel" size="sm" />
              {t("Override winner")}
            </button>
          ) : (
            <button disabled className={btnGhost}>
              <Icon name="gavel" size="sm" />
              {t("Override open…")}
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-faint">
          {queuedEvents.length > 0
            ? t("Syncing {count} event(s)…", { count: queuedEvents.length })
            : t("Signed in as {name} · server-validated events only", { name: user?.name || t("scorer") })}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------

const TossPanel: React.FC<{
  stage: 'first_innings' | 'extra_innings';
  round?: number;
  teams: [string, string] | string[];
  teamAId: string;
  teamBId: string;
  pending: boolean;
  onEvent: (payload: Record<string, unknown>) => Promise<boolean>;
}> = ({ stage, round, teams, teamAId, teamBId, pending, onEvent }) => {
  const { t } = useI18n();
  const [winnerTeamId, setWinnerTeamId] = useState<string>('');

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        <Icon name="trophy" size="xs" /> {stage === 'extra_innings' ? t("Extra innings toss (round {round})", { round: round ?? '' }).trim() : t("First-innings toss")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {([teamAId, teamBId] as string[]).map((id, idx) => (
          <button
            key={id}
            onClick={() => setWinnerTeamId(id)}
            className={`rounded-[6px] border px-3 py-3 text-sm font-semibold transition-colors ${
              winnerTeamId === id
                ? 'border-accent-strong bg-accent-soft text-accent-strong'
                : 'border-hairline bg-surface text-ink hover:border-faint'
            }`}
          >
            {teams[idx]}
          </button>
        ))}
      </div>
      {winnerTeamId && (
        <div className="mt-3">
          <p className="mb-2 text-center text-[11px] text-muted">{t("Toss won — what do they elect?")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onEvent({ type: 'TOSS', stage, winnerTeamId, decision: 'DEFEND' })}
              disabled={pending}
              className={btnPrimary}
            >
              {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="shield" size="sm" />}
              {t("Defend first")}
            </button>
            <button
              onClick={() => onEvent({ type: 'TOSS', stage, winnerTeamId, decision: 'CHASE' })}
              disabled={pending}
              className={btnGhost}
            >
              <Icon name="bolt" size="sm" />
              {t("Chase first")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const TurnPanel: React.FC<{
  action: KhoKhoNextAction;
  turn: KhoKhoTurnSummary | null;
  clockRemaining: number | null;
  pausedForMs: number | null;
  remind: boolean;
  chaserName?: string;
  onEvent: (payload: Record<string, unknown>) => Promise<boolean>;
  pending: boolean;
  showEarlyEnd: boolean;
  setShowEarlyEnd: (v: boolean) => void;
  earlyEndReason: string;
  setEarlyEndReason: (v: string) => void;
  turnEndHint: { reason: 'all_out' | 'timer_expired'; label: string } | null;
}> = ({ action, turn, clockRemaining, pausedForMs, remind, chaserName, onEvent, pending, showEarlyEnd, setShowEarlyEnd, earlyEndReason, setEarlyEndReason, turnEndHint }) => {
  const { t } = useI18n();
  const paused = action.action === 'turn_paused';

  return (
    <div className={`rounded-[12px] border p-5 ${paused ? 'border-amber-300 bg-amber-50/70' : 'border-hairline bg-surface'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{turn?.turnLabel}</p>
          <p className="text-sm font-semibold text-ink">
            {chaserName ? t("{name} chasing", { name: chaserName }) : t("In progress")}
            {turn?.batchDisplay ? ` · ${turn.batchDisplay}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-faint">{t("Turn score")}</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-ink">{turn?.points ?? 0}</p>
        </div>
      </div>

      {/* Clock */}
      {paused ? (
        <div className="mt-4 rounded-[10px] border border-amber-400 bg-amber-100 p-4 text-center">
          <p className="flex items-center justify-center gap-2 font-mono text-2xl font-black uppercase tracking-[0.15em] text-amber-700">
            <Icon name="pause" size="md" spin={false} /> {t("Clock stopped")}
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-800">
            {t("Stopped for {time} — the turn timer is NOT running.", { time: fmtClock(pausedForMs ?? 0) })}
          </p>
          {remind && (
            <p className="mt-2 animate-pulse rounded-[6px] bg-amber-200 px-2 py-1 text-[11px] font-bold text-amber-900">
              {t("2 minutes on pause — resume the clock so the turn stays within its scheduled window!")}
            </p>
          )}
          <button
            onClick={() => onEvent({ type: 'TURN_RESUME' })}
            disabled={pending}
            className={`mt-3 w-full ${btnPrimary}`}
          >
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
            {t("Resume clock")}
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-[10px] border border-hairline bg-canvas p-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.1em] text-faint">{t("Turn timer")}</p>
          <p
            className={`font-mono text-5xl font-black tabular-nums ${clockRemaining !== null && clockRemaining <= 10000 ? 'text-red-600' : 'text-ink'}`}
          >
            {clockRemaining === null ? '--:--' : fmtClock(clockRemaining)}
          </p>
          {action.action === 'end_turn_available' && action.reasonHint === 'timer_expired' && (
            <p className="mt-1 text-xs font-semibold text-red-600">{t("Time expired — close the turn")}</p>
          )}
        </div>
      )}

      {/* Event buttons */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!paused &&
          DISMISSAL_ACTIONS.map((d) => (
            <button
              key={d.type}
              onClick={() => onEvent({ type: 'DISMISSAL', dismissalType: d.type })}
              disabled={pending}
              className={btnAccent}
            >
              <Icon name="bolt" size="sm" /> {t(d.label)} (+1)
            </button>
          ))}
        {!paused && (
          <button onClick={() => onEvent({ type: 'FOUL_LOG' })} disabled={pending} className={btnGhost}>
            <Icon name="pen" size="sm" /> {t("Log foul")}
          </button>
        )}
        {!paused && (
          <button onClick={() => onEvent({ type: 'TURN_PAUSE' })} disabled={pending} className={`${btnGhost} text-amber-700`}>
            <Icon name="pause" size="sm" /> {t("Pause clock")}
          </button>
        )}
      </div>

      {/* End turn */}
      <div className="mt-3 border-t border-hairline pt-3">
        {!paused && turnEndHint && !showEarlyEnd && (
          <button
            onClick={() => onEvent({ type: 'TURN_END', reason: turnEndHint.reason })}
            disabled={pending}
            className={`w-full ${btnPrimary}`}
          >
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />}
            {t(turnEndHint.label)}
          </button>
        )}
        {!paused && !showEarlyEnd && !turnEndHint && (
          <button onClick={() => setShowEarlyEnd(true)} disabled={pending} className={`w-full ${btnGhost}`}>
            <Icon name="flag" size="sm" /> {t("End turn early (manual)")}
          </button>
        )}
        {!paused && showEarlyEnd && (
          <div className="space-y-2">
            <textarea
              value={earlyEndReason}
              onChange={(e) => setEarlyEndReason(e.target.value)}
              rows={2}
              placeholder={t("Reason for ending the turn early (required)")}
              className="w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onEvent({ type: 'TURN_END', reason: 'manual', reasonText: earlyEndReason.trim() });
                  setShowEarlyEnd(false);
                }}
                disabled={pending || earlyEndReason.trim().length < 5}
                className={btnPrimary}
              >
                {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />} {t("End turn")}
              </button>
              <button onClick={() => setShowEarlyEnd(false)} className={btnGhost}>
                {t("Cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
