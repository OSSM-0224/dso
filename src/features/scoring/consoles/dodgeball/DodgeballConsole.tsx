'use client';

/**
 * Dodgeball scorer console.
 *
 * Mirrors the Sepak Takraw console contract (`SportConsoleProps`): every action
 * is queued through the host and validated server-side by the dodgeball engine.
 * Players are identified by jersey number (1-99) — the engine's opaque
 * `playerId` — so the scorer never types a name.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/i18n/LanguageProvider';
import { ToastBanner } from '@/features/scoring/shared/ToastBanner';
import { dodgeballScoringEngine } from '@/shared/scoring/sports/dodgeball/engine';
import {
  type DodgeballCardType,
  type DodgeballDelayType,
  type DodgeballPhase,
  type DodgeballScoreEvent,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
  type DodgeballStatsRow,
  type DodgeballTeamState,
} from '@/shared/scoring/sports/dodgeball/types';
import type { MatchScoreViewDto, SanitizedScoreEvent } from '@/shared/types';
import type { SportConsoleProps } from '../registry';

const btnGhost =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45';
const btnPrimary =
  'flex items-center justify-center gap-1.5 rounded-[6px] bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity duration-200 disabled:opacity-45';
const btnDanger =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 disabled:opacity-45';
const inputClass =
  'w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-accent-strong focus:outline-none';
const selectClass =
  'w-full rounded-[6px] border border-hairline bg-surface px-2 py-2 text-xs text-ink focus:border-accent-strong focus:outline-none';

const PHASE_LABEL: Record<DodgeballPhase, string> = {
  awaiting_toss: 'Awaiting toss',
  awaiting_lineups: 'Awaiting lineups',
  awaiting_set_start: 'Set about to start',
  set_live: 'In play',
  set_paused: 'Clock stopped',
  awaiting_revival: 'Revival window',
  extra_time: 'Extra time',
  sudden_death: 'Sudden death',
  set_break: 'Set break',
  completed: 'Completed',
};

type SendEvent = (payload: Record<string, unknown>) => boolean;

const fmtClock = (ms: number | null): string => {
  if (ms === null) return '--:--';
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

function useElapsedMs(active: boolean, anchor: number | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active || !anchor) {
      setElapsed(0);
      return;
    }
    const update = () => setElapsed(Math.max(0, Date.now() - anchor));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [active, anchor]);
  return elapsed;
}

function replayStats(score: MatchScoreViewDto | null): DodgeballStatsRow[] {
  if (!score || score.scoreboard.sport !== 'dodgeball') return [];
  if (!('hitPoints' in score.config)) return [];
  try {
    let state = dodgeballScoringEngine.createInitialState({
      teams: score.teams.map((team) => ({ id: team.id, name: team.name })),
      config: score.config as DodgeballScoringConfig,
    });
    for (const event of score.events) {
      state = dodgeballScoringEngine.applyEvent(
        state,
        event as unknown as DodgeballScoreEvent,
      );
    }
    return dodgeballScoringEngine
      .getPlayerStats(state)
      .filter((row) => row.playerId !== null);
  } catch {
    return [];
  }
}

function describeEvent(
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string {
  const parsed = ev as unknown as DodgeballScoreEvent;
  switch (parsed.type) {
    case 'TOSS':
      return t('Toss: {team} chose the court', { team: teamName(parsed.winnerTeamId) });
    case 'LINEUP_SET':
      return t('Lineup set: {team}', { team: teamName(parsed.teamId) });
    case 'SUBSTITUTION':
      return t('Substitution: {team}', { team: teamName(parsed.teamId) });
    case 'SET_START':
      return t('Set {setNo} started', { setNo: parsed.setNo });
    case 'HIT':
      return t('{team} hit #{player}', {
        team: teamName(parsed.teamId),
        player: parsed.targetPlayerId,
      });
    case 'LINE_OUT':
      return t('{team} line-out point', { team: teamName(parsed.teamId) });
    case 'CATCH':
      return t('Catch by {team} (jersey {player})', {
        team: teamName(parsed.teamId),
        player: parsed.playerId,
      });
    case 'CARD':
      return t('{card} card: {team} #{player}', {
        card: parsed.cardType,
        team: teamName(parsed.teamId),
        player: parsed.playerId,
      });
    case 'INJURY':
      return t('Injury: {team} #{player}', {
        team: teamName(parsed.teamId),
        player: parsed.playerId,
      });
    case 'DELAY':
      return t('Delay penalty: {team}', { team: teamName(parsed.teamId) });
    case 'REVIVE':
      return t('Revival: {team}', { team: teamName(parsed.teamId) });
    case 'REVIVAL_FAILED':
      return t('Revival failed: {team}', { team: teamName(parsed.teamId) });
    case 'PAUSE':
      return t('Clock stopped');
    case 'RESUME':
      return t('Clock resumed');
    case 'SET_END':
      return t('Set {setNo} ended', { setNo: parsed.setNo });
    case 'EXTRA_TIME_START':
      return t('Extra time started');
    case 'SUDDEN_DEATH_START':
      return t('Sudden death started');
    case 'MANUAL_DECISION':
      return t('Manual decision: {team}', { team: teamName(parsed.winnerTeamId) });
    case 'VOID':
      return t('Earlier event withdrawn');
    default:
      return t('Match event');
  }
}

export const DodgeballConsole: React.FC<SportConsoleProps> = (props) => {
  const {
    tournament,
    match,
    score,
    isReadOnly,
    scorerNames,
    actions,
    sync,
    fault,
    clearFault,
    tournamentId,
    snapshotAt,
  } = props;
  const { t } = useI18n();

  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ tone: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideWinner, setOverrideWinner] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const sb = score && score.scoreboard.sport === 'dodgeball' ? score.scoreboard : null;
  const config = score && 'hitPoints' in score.config ? (score.config as DodgeballScoringConfig) : null;
  const stats = useMemo(() => replayStats(score), [score]);
  const clockActive = Boolean(sb?.time && !sb.time.paused && sb.time.period !== 'sudden_death');
  const elapsedMs = useElapsedMs(clockActive, snapshotAt);

  const teamAId = match.teamA?.id ?? '';
  const teamBId = match.teamB?.id ?? '';
  const teams = sb?.teams ?? [];
  const teamName = (id?: string | null): string => {
    if (!id) return '';
    const fromScore = teams.find((team) => team.id === id)?.name;
    if (fromScore) return fromScore;
    if (match.teamA?.id === id) return match.teamA.name;
    if (match.teamB?.id === id) return match.teamB.name;
    return id;
  };
  const teamAName = teamName(teamAId) || t('TBD');
  const teamBName = teamName(teamBId) || t('TBD');

  const send: SendEvent = (payload) => {
    const ok = actions.postEvent(payload);
    if (!ok) setToast({ tone: 'error', text: 'The score session is not ready yet.' });
    return ok;
  };

  const doUndo = () => {
    actions.undoEvent();
    setToast({ tone: 'info', text: 'Undo queued — it runs after the pending events.' });
  };

  const startScoring = async () => {
    setPending(true);
    try {
      await actions.startScoring();
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Could not start scoring' });
    } finally {
      setPending(false);
    }
  };

  const doComplete = async () => {
    setPending(true);
    try {
      await actions.completeMatch();
      setToast({ tone: 'success', text: 'Result recorded to the official bracket.' });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Completion failed' });
    } finally {
      setPending(false);
    }
  };

  const doOverride = async () => {
    if (!overrideWinner || overrideReason.trim().length < 5) return;
    setPending(true);
    try {
      await actions.overrideWinner({ winnerTeamId: overrideWinner, reason: overrideReason.trim() });
      setShowOverride(false);
      setToast({ tone: 'success', text: 'Winner overridden and recorded.' });
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Override failed' });
    } finally {
      setPending(false);
    }
  };

  const banner = fault ? (
    <ToastBanner
      tone="error"
      text={fault.droppedCount > 1
        ? t('{message} {count} queued events were removed — re-check the score before continuing.', {
            message: fault.message,
            count: fault.droppedCount,
          })
        : fault.message}
      onDismiss={clearFault}
    />
  ) : toast ? (
    <ToastBanner tone={toast.tone} text={t(toast.text)} onDismiss={() => setToast(null)} />
  ) : null;

  if (sb && score && score.status === 'completed') {
    const winnerId = score.winnerTeamIds?.[0] ?? sb.winner.winnerTeamId;
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
          <Icon name="trophy" size="xl" className="mx-auto mb-3 text-accent-strong" />
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{t('Match completed')}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">{teamName(winnerId) || t('Result recorded')}</h1>
          {sb.winner.label && <p className="mt-1 text-xs font-semibold text-accent-strong">{sb.winner.label}</p>}
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 items-center gap-2">
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">{sb.setWins[teamAId] ?? 0}</p>
            <p className="text-center text-[10px] uppercase tracking-wider text-faint">{t('Sets')}</p>
            <p className="text-center font-mono text-xl font-bold tabular-nums text-ink">{sb.setWins[teamBId] ?? 0}</p>
          </div>
          <p className="mt-4 text-[11px] text-muted">
            {t('Winner recorded to the official bracket (advancement, audit log and school notifications done).')}
          </p>
          {stats.length > 0 && <StatsTable stats={stats} teamName={teamName} />}
          <Link href={`/score/${tournamentId}`} className={`mt-4 inline-flex ${btnGhost}`}>
            <Icon name="arrowLeft" size="sm" />
            {t('Back to the hub')}
          </Link>
        </div>
      </div>
    );
  }

  if (!score || !sb || !config) {
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
          <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
            {tournament.name} · {match.roundName} · {t('Match #{number}', { number: match.matchNumber })}
          </p>
          <h1 className="mt-3 text-center font-serif text-xl font-semibold text-ink">
            {teamAName}
            <span className="mx-2 text-faint">{t('vs')}</span>
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
            {t('Start scoring session')}
          </button>
          <p className="mt-2 text-center text-[10px] text-faint">{t('First step: the toss')}</p>
        </div>
        <Link href={`/score/${tournamentId}`} className={`w-full ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to the hub')}
        </Link>
      </div>
    );
  }

  const action = sb.nextAction;
  let promptBody: React.ReactNode = null;

  if (action.action === 'prompt_toss') {
    promptBody = (
      <TossPanel
        teamAId={teamAId}
        teamBId={teamBId}
        teamAName={teamAName}
        teamBName={teamBName}
        pending={pending}
        onEvent={send}
      />
    );
  } else if (action.action === 'require_lineups') {
    promptBody = (
      <div className="space-y-3">
        {action.missingTeamIds.map((teamId) => {
          const state = sb.teamStates.find((team) => team.teamId === teamId);
          return (
            <LineupPanel
              key={teamId}
              teamId={teamId}
              teamName={teamName(teamId)}
              config={config}
              initialOnCourt={state?.onCourt ?? []}
              initialSubs={state?.subs ?? []}
              pending={pending}
              onEvent={send}
            />
          );
        })}
      </div>
    );
  } else if (action.action === 'start_set') {
    promptBody = (
      <div className="space-y-3">
        <StartSetPanel
          setNo={action.setNo}
          deciding={action.deciding}
          pending={pending}
          onEvent={send}
        />
        {action.setNo > 1 && (
          <div className="space-y-3">
            {[teamAId, teamBId].map((teamId) => {
              const state = sb.teamStates.find((team) => team.teamId === teamId);
              return state && state.subs.length > 0 ? (
                <SubstitutionPanel
                  key={teamId}
                  state={state}
                  pending={pending}
                  onEvent={send}
                />
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  } else if (action.action === 'require_revival' && sb.revival) {
    promptBody = (
      <RevivalPanel
        revival={sb.revival}
        teamName={teamName(sb.revival.teamId)}
        snapshotAt={snapshotAt}
        pending={pending}
        onEvent={send}
      />
    );
  } else if (action.action === 'set_paused') {
    promptBody = (
      <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5 text-center">
        <Icon name="pause" size="xl" className="mx-auto mb-2 text-amber-700" />
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-800">{t('Clock stopped')}</p>
        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
          {fmtClock(action.remainingMs)}
        </p>
        <button
          onClick={() => send({ type: 'RESUME' })}
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
          {t('Resume play')}
        </button>
      </div>
    );
  } else if (action.action === 'end_set') {
    promptBody = (
      <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t('Set time is over')}</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-ink">
          {sb.points[teamAId] ?? 0} – {sb.points[teamBId] ?? 0}
        </p>
        <button
          onClick={() => send({ type: 'SET_END', setNo: action.setNo, reason: 'TIMER' })}
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />}
          {t('End set {setNo}', { setNo: action.setNo })}
        </button>
      </div>
    );
  } else if (action.action === 'prompt_extra_time') {
    promptBody = (
      <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-800">{t('Scores are tied')}</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-ink">
          {sb.points[teamAId] ?? 0} – {sb.points[teamBId] ?? 0}
        </p>
        <button
          onClick={() => send({ type: 'EXTRA_TIME_START', setNo: action.setNo })}
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="stopwatch" size="sm" />}
          {t('Start 2-minute extra time')}
        </button>
      </div>
    );
  } else if (action.action === 'prompt_sudden_death') {
    promptBody = (
      <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-800">{t('Still tied after extra time')}</p>
        <button
          onClick={() => send({ type: 'SUDDEN_DEATH_START', setNo: action.setNo })}
          disabled={pending || isReadOnly}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="bolt" size="sm" />}
          {t('Start sudden death')}
        </button>
      </div>
    );
  } else if (action.action === 'record_events' || action.action === 'sudden_death') {
    promptBody = (
      <div className="space-y-3">
        {action.action === 'sudden_death' && (
          <p className="flex items-center justify-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <Icon name="bolt" size="sm" /> {t('Sudden death — the first point wins the set.')}
          </p>
        )}
        <MatchActionsPanel
          sb={sb}
          config={config}
          teamAId={teamAId}
          teamBId={teamBId}
          pending={pending}
          onEvent={send}
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => send({ type: 'PAUSE', reason: 'OFFICIAL' })}
            disabled={pending || isReadOnly || sb.time?.paused || sb.time?.period === 'sudden_death'}
            className={btnGhost}
          >
            <Icon name="pause" size="sm" /> {t('Stop clock')}
          </button>
          <button
            onClick={() => send({ type: 'RESUME' })}
            disabled={pending || isReadOnly || !sb.time?.paused}
            className={btnGhost}
          >
            <Icon name="play" size="sm" /> {t('Resume clock')}
          </button>
        </div>
      </div>
    );
  } else if (action.action === 'completed') {
    promptBody = (
      <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 p-5 text-center">
        <Icon name="trophy" size="xl" className="mx-auto mb-2 text-emerald-700" />
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-800">{t('Match decided')}</p>
        <p className="mt-1 font-serif text-xl font-semibold text-ink">{teamName(sb.winner.winnerTeamId)}</p>
        {sb.winner.label && <p className="text-xs font-semibold text-emerald-700">{sb.winner.label}</p>}
        <button onClick={doComplete} disabled={pending || isReadOnly} className={`mt-4 w-full ${btnPrimary}`}>
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />}
          {t('Complete match')}
        </button>
      </div>
    );
  }

  const recentEvents = [...score.events].sort((a, b) => b.atMs - a.atMs).slice(0, 8);
  const liveRemaining =
    sb.time?.remainingMs != null ? Math.max(0, sb.time.remainingMs - elapsedMs) : null;

  return (
    <div className="space-y-4">
      {banner}

      <div className="rounded-[12px] border border-hairline bg-surface p-4">
        <p className="rounded-full bg-canvas px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
          {tournament.name} · {match.roundName} · {t('Match #{number}', { number: match.matchNumber })}
        </p>
        <div className="mt-2 text-center font-serif text-[17px] font-semibold text-ink">
          {teamAName} <span className="text-faint">{t('vs')}</span> {teamBName}
        </div>
        <p className="mt-1 text-center text-[11px] text-muted">
          {t('Set {setNo}', { setNo: sb.setNo })} · {t(PHASE_LABEL[sb.phase])} · v{score.version}
          {scorerNames.length > 0 ? ` · ${t('scorers: {names}', { names: scorerNames.join(', ') })}` : ''}
        </p>
        <p className="mt-1 text-center font-mono text-lg font-bold tabular-nums text-ink">
          {sb.phase === 'sudden_death' ? t('SUDDEN DEATH') : fmtClock(liveRemaining)}
        </p>
      </div>

      {sync.offline && (
        <p className="flex items-center justify-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Icon name="circleInfo" size="sm" />
          {sync.pendingCount === 1
            ? t('Offline, 1 event waiting')
            : t('Offline, {count} events waiting', { count: sync.pendingCount })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[teamAId, teamBId].map((teamId) => {
          const state = sb.teamStates.find((team) => team.teamId === teamId);
          const leading =
            (sb.points[teamId] ?? 0) >
            Math.max(...[teamAId, teamBId].filter((id) => id !== teamId).map((id) => sb.points[id] ?? 0));
          return (
            <div
              key={teamId}
              className={`rounded-[12px] border p-4 ${
                leading && sb.points[teamId] > 0
                  ? 'border-accent-strong bg-accent-soft/30'
                  : 'border-hairline bg-surface'
              }`}
            >
              <p className="truncate text-xs font-semibold text-ink">{teamName(teamId)}</p>
              <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-ink">{sb.points[teamId] ?? 0}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t('Set wins: {count}', { count: sb.setWins[teamId] ?? 0 })}
              </p>
              <p className="mt-1 text-[10px] text-muted">
                {t('{active} on court · {out} out', {
                  active: state?.activeCount ?? 0,
                  out: state?.outPlayerIds.length ?? 0,
                })}
              </p>
              {state && state.outPlayerIds.length > 0 && (
                <p className="mt-1 truncate text-[10px] text-red-700">
                  {t('Out: {players}', { players: state.outPlayerIds.map((id) => `#${id}`).join(', ') })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {promptBody}

      {sb.sets.length > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t('Sets')}</p>
          <ul className="space-y-1.5">
            {sb.sets.map((set) => (
              <li key={set.setNo} className="flex items-center justify-between gap-2 text-xs text-ink">
                <span className="w-12 shrink-0 text-muted">{t('Set {setNo}', { setNo: set.setNo })}</span>
                <span className="flex-1 text-center font-mono tabular-nums">
                  {set.points[teamAId] ?? 0} – {set.points[teamBId] ?? 0}
                </span>
                <span className="w-28 shrink-0 text-right text-[10px] font-semibold text-muted">
                  {set.completed
                    ? teamName(set.winnerTeamId)
                    : set.suddenDeath
                      ? t('Sudden death')
                      : set.extraTime
                        ? t('Extra time')
                        : t('In play')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.length > 0 && <StatsTable stats={stats} teamName={teamName} />}

      {showOverride && (
        <div className="rounded-[12px] border border-amber-300 bg-amber-50/70 p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
            <Icon name="gavel" size="xs" /> {t('Override winner (emergency)')}
          </p>
          <p className="mt-1 text-xs text-amber-900">
            {t('Bypasses the event flow and records the result immediately. Reason is mandatory and audited.')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[teamAId, teamBId].map((id, idx) => (
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
            placeholder={t('Reason (required, min 5 characters)')}
            className="mt-2 w-full rounded-[6px] border border-amber-200 bg-white px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={doOverride}
            disabled={pending || !overrideWinner || overrideReason.trim().length < 5}
            className={`mt-2 w-full ${btnPrimary}`}
          >
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="gavel" size="sm" />}
            {t('Declare winner & finish')}
          </button>
          <button onClick={() => setShowOverride(false)} className={`mt-2 w-full ${btnGhost}`}>
            {t('Cancel')}
          </button>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div className="rounded-[12px] border border-hairline bg-surface p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t('Recent events')}</p>
          <ul className="space-y-1.5">
            {recentEvents.map((ev) => (
              <li key={ev.eventId} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span className="truncate">{describeEvent(ev, teamName, t)}</span>
                <span className="shrink-0 font-mono tabular-nums">{Math.max(0, Math.round(ev.atMs / 1000))}s</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2">
          {!isReadOnly && (
            <button
              onClick={doUndo}
              disabled={pending || !sync.canUndo}
              className={btnGhost}
              title={!sync.canUndo ? t('Wait for the pending events to sync first') : undefined}
            >
              {sync.inFlight ? <Icon name="spinner" size="sm" spin /> : <Icon name="rotate" size="sm" />}
              {t('Undo last event')}
            </button>
          )}
          {score.status === 'active' && !showOverride && sb.winner.resolved ? (
            <button onClick={doComplete} disabled={pending || isReadOnly} className={btnPrimary}>
              {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="flag" size="sm" />}
              {t('Complete match')}
            </button>
          ) : !showOverride ? (
            <button onClick={() => setShowOverride(true)} disabled={pending || isReadOnly} className={btnGhost}>
              <Icon name="gavel" size="sm" />
              {t('Override winner')}
            </button>
          ) : (
            <button disabled className={btnGhost}>
              <Icon name="gavel" size="sm" />
              {t('Override open…')}
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-faint">
          {sync.pendingCount > 0
            ? t('Syncing {count} event(s)…', { count: sync.pendingCount })
            : t('Server-validated events only')}
        </p>
      </div>
    </div>
  );
};

const TossPanel: React.FC<{
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ teamAId, teamBId, teamAName, teamBName, pending, onEvent }) => {
  const { t } = useI18n();
  const [winnerTeamId, setWinnerTeamId] = useState('');

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        <Icon name="trophy" size="xs" /> {t('Opening toss')}
      </p>
      <p className="mt-1 text-[10px] text-muted">
        {t('The toss winner chooses the court. The other team starts with the ball.')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[teamAId, teamBId].map((id, idx) => (
          <button
            key={id}
            onClick={() => setWinnerTeamId(id)}
            className={`rounded-[6px] border px-3 py-3 text-sm font-semibold transition-colors ${
              winnerTeamId === id
                ? 'border-accent-strong bg-accent-soft text-accent-strong'
                : 'border-hairline bg-surface text-ink hover:border-faint'
            }`}
          >
            {idx === 0 ? teamAName : teamBName}
          </button>
        ))}
      </div>
      <button
        onClick={() => onEvent({ type: 'TOSS', winnerTeamId, choice: 'COURT' })}
        disabled={pending || !winnerTeamId}
        className={`mt-3 w-full ${btnPrimary}`}
      >
        {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="check" size="sm" />}
        {t('Record toss')}
      </button>
    </div>
  );
};

const LineupPanel: React.FC<{
  teamId: string;
  teamName: string;
  config: DodgeballScoringConfig;
  initialOnCourt: string[];
  initialSubs: string[];
  pending: boolean;
  onEvent: SendEvent;
}> = ({ teamId, teamName, config, initialOnCourt, initialSubs, pending, onEvent }) => {
  const { t } = useI18n();
  const [onCourt, setOnCourt] = useState<string[]>(() => {
    const base = [...initialOnCourt];
    while (base.length < config.playersOnCourt) base.push('');
    return base.slice(0, config.playersOnCourt);
  });
  const [subsText, setSubsText] = useState(initialSubs.join(', '));
  const [error, setError] = useState('');

  const clean = (value: string) => value.trim().replace(/^#/, '').trim();
  const validJersey = (value: string) => {
    if (!/^\d+$/.test(value)) return false;
    const number = Number(value);
    return number >= config.jerseyMin && number <= config.jerseyMax;
  };

  const submit = () => {
    const ids = onCourt.map(clean).filter(Boolean);
    if (ids.length < config.minPlayersToStart) {
      setError(
        t('Enter at least {min} on-court jersey numbers.', { min: config.minPlayersToStart }),
      );
      return;
    }
    if (ids.some((id) => !validJersey(id))) {
      setError(
        t('Jersey numbers must be between {min} and {max}.', {
          min: config.jerseyMin,
          max: config.jerseyMax,
        }),
      );
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setError(t('Each on-court player must have a different jersey number.'));
      return;
    }
    const subs = subsText.split(/[,\s]+/).map(clean).filter(Boolean);
    if (subs.some((sub) => !validJersey(sub))) {
      setError(
        t('Substitute jersey numbers must be between {min} and {max}.', {
          min: config.jerseyMin,
          max: config.jerseyMax,
        }),
      );
      return;
    }
    if (new Set(subs).size !== subs.length || subs.some((sub) => ids.includes(sub))) {
      setError(t('Substitute jersey numbers must be distinct and not on court.'));
      return;
    }
    setError('');
    onEvent({ type: 'LINEUP_SET', teamId, onCourt: ids, subs });
  };

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        <Icon name="users" size="xs" /> {t('Lineup: {team}', { team: teamName })}
      </p>
      <p className="mt-1 text-[10px] text-muted">
        {t('Enter jersey numbers only — up to {max} on court, at least {min}.', {
          max: config.playersOnCourt,
          min: config.minPlayersToStart,
        })}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {onCourt.map((value, index) => (
          <label key={index} className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
              {t('Player {n}', { n: index + 1 })}
            </span>
            <input
              value={value}
              onChange={(e) =>
                setOnCourt((current) =>
                  current.map((entry, i) => (i === index ? e.target.value : entry)),
                )
              }
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              placeholder={t('Jersey no.')}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
          {t('Substitute jersey numbers (comma-separated, up to {max})', {
            max: config.maxSubstitutes,
          })}
        </span>
        <input
          value={subsText}
          onChange={(e) => setSubsText(e.target.value)}
          autoComplete="off"
          placeholder={t('e.g. 7, 8, 11, 23')}
          className={inputClass}
        />
      </label>
      {error && <p className="mt-2 text-[11px] font-semibold text-red-700">{error}</p>}
      <button onClick={submit} disabled={pending} className={`mt-3 w-full ${btnPrimary}`}>
        {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="check" size="sm" />}
        {t('Save lineup')}
      </button>
    </div>
  );
};

const StartSetPanel: React.FC<{
  setNo: number;
  deciding: boolean;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ setNo, deciding, pending, onEvent }) => {
  const { t } = useI18n();
  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        {deciding ? t('Deciding set') : t('Next set')}
      </p>
      <p className="mt-1 font-serif text-xl font-semibold text-ink">{t('Set {setNo}', { setNo })}</p>
      <p className="mt-1 text-[10px] text-muted">
        {t('Substitutions are allowed only before the set starts.')}
      </p>
      <button
        onClick={() => onEvent({ type: 'SET_START', setNo })}
        disabled={pending}
        className={`mt-4 w-full ${btnPrimary}`}
      >
        {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
        {t('Start set {setNo}', { setNo })}
      </button>
    </div>
  );
};

const SubstitutionPanel: React.FC<{
  state: DodgeballTeamState;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ state, pending, onEvent }) => {
  const { t } = useI18n();
  const [outPlayer, setOutPlayer] = useState('');
  const [inPlayer, setInPlayer] = useState('');
  const outSelected = state.onCourt.includes(outPlayer) ? outPlayer : '';
  const inSelected = state.subs.includes(inPlayer) ? inPlayer : '';

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        {t('{team} · substitution', { team: state.teamName })}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select value={outSelected} onChange={(e) => setOutPlayer(e.target.value)} className={selectClass}>
          <option value="">{t('Outgoing player')}</option>
          {state.onCourt.map((playerId) => (
            <option key={playerId} value={playerId}>
              #{playerId}
            </option>
          ))}
        </select>
        <select value={inSelected} onChange={(e) => setInPlayer(e.target.value)} className={selectClass}>
          <option value="">{t('Incoming sub')}</option>
          {state.subs.map((playerId) => (
            <option key={playerId} value={playerId}>
              #{playerId}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={() =>
          onEvent({ type: 'SUBSTITUTION', teamId: state.teamId, outPlayerId: outSelected, inPlayerId: inSelected })
        }
        disabled={pending || !outSelected || !inSelected}
        className={`mt-2 w-full ${btnGhost}`}
      >
        <Icon name="swap" size="sm" /> {t('Substitute')}
      </button>
    </div>
  );
};

const RevivalPanel: React.FC<{
  revival: NonNullable<DodgeballScoreboard['revival']>;
  teamName: string;
  snapshotAt?: number;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ revival, teamName, snapshotAt, pending, onEvent }) => {
  const { t } = useI18n();
  const elapsedMs = useElapsedMs(true, snapshotAt);
  const remainingMs = Math.max(0, revival.remainingMs - elapsedMs);

  return (
    <div className="rounded-[12px] border border-red-300 bg-red-50 p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-red-700">
        <Icon name="clock" size="xs" /> {t('All out — revival window')}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{teamName}</p>
      <p className="mt-1 text-xs text-red-900">
        {t('Jerseys {players} must re-enter before the 5-second window closes.', {
          players: revival.outPlayerIds.map((id) => `#${id}`).join(', '),
        })}
      </p>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-red-800">{fmtClock(remainingMs)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            onEvent({
              type: 'REVIVE',
              teamId: revival.teamId,
              playerIds: revival.outPlayerIds,
              reason: 'REVIVAL',
            })
          }
          disabled={pending || revival.outPlayerIds.length === 0}
          className={btnPrimary}
        >
          <Icon name="check" size="sm" /> {t('All back in')}
        </button>
        <button
          onClick={() => onEvent({ type: 'REVIVAL_FAILED', teamId: revival.teamId })}
          disabled={pending}
          className={btnDanger}
        >
          <Icon name="xmark" size="sm" /> {t('Revival failed')}
        </button>
      </div>
    </div>
  );
};

const MatchActionsPanel: React.FC<{
  sb: DodgeballScoreboard;
  config: DodgeballScoringConfig;
  teamAId: string;
  teamBId: string;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ sb, config, teamAId, teamBId, pending, onEvent }) => {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {[teamAId, teamBId].map((teamId) => (
        <TeamActionCard
          key={teamId}
          sb={sb}
          config={config}
          teamId={teamId}
          rivalId={teamId === teamAId ? teamBId : teamAId}
          pending={pending}
          onEvent={onEvent}
        />
      ))}
      <p className="text-[10px] text-muted md:col-span-2">
        {t('Hit / line-out points go to the selected team. A catch credits the catcher and puts the thrower out.')}
      </p>
    </div>
  );
};

const TeamActionCard: React.FC<{
  sb: DodgeballScoreboard;
  config: DodgeballScoringConfig;
  teamId: string;
  rivalId: string;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ sb, config, teamId, rivalId, pending, onEvent }) => {
  const { t } = useI18n();
  const state = sb.teamStates.find((team) => team.teamId === teamId);
  const rival = sb.teamStates.find((team) => team.teamId === rivalId);
  const [ownPlayer, setOwnPlayer] = useState('');
  const [rivalPlayer, setRivalPlayer] = useState('');
  const [revivePlayer, setRevivePlayer] = useState('');
  const [delayType, setDelayType] = useState<DodgeballDelayType>('FIVE_SECOND');

  if (!state || !rival) return null;

  const ownActive = state.activePlayerIds;
  const rivalActive = rival.activePlayerIds;
  const ownOut = state.outPlayerIds;
  const teamLabel = state.teamName;

  // The scoreboard is refreshed after every event, so a jersey can disappear
  // from a dropdown while its number is still held in local state. Derive the
  // effective value from the live scoreboard on every render: a stale jersey
  // must never be posted (the engine rejects it with a 409) and its buttons
  // must disable immediately.
  const ownSelected = ownActive.includes(ownPlayer) ? ownPlayer : '';
  const rivalSelected = rivalActive.includes(rivalPlayer) ? rivalPlayer : '';
  const revivableOut = ownOut.filter(
    (playerId) => !state.disqualifiedPlayerIds.includes(playerId),
  );
  const reviveSelected = revivableOut.includes(revivePlayer) ? revivePlayer : '';

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4">
      <p className="truncate text-sm font-semibold text-ink">{teamLabel}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {ownActive.map((playerId) => (
          <span
            key={playerId}
            className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-ink"
          >
            #{playerId}
          </span>
        ))}
        {ownActive.length === 0 && <span className="text-[11px] text-red-700">{t('No players on court')}</span>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
            {t('Own player')}
          </span>
          <select value={ownSelected} onChange={(e) => setOwnPlayer(e.target.value)} className={selectClass}>
            <option value="">{t('Optional')}</option>
            {ownActive.map((playerId) => (
              <option key={playerId} value={playerId}>
                #{playerId}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
            {t('Opponent player')}
          </span>
          <select value={rivalSelected} onChange={(e) => setRivalPlayer(e.target.value)} className={selectClass}>
            <option value="">{t('Select')}</option>
            {rivalActive.map((playerId) => (
              <option key={playerId} value={playerId}>
                #{playerId}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() =>
            onEvent({
              type: 'HIT',
              teamId,
              ...(ownSelected ? { playerId: ownSelected } : {}),
              targetPlayerId: rivalSelected,
            })
          }
          disabled={pending || !rivalSelected}
          className={btnPrimary}
        >
          <Icon name="bolt" size="sm" /> {t('Hit')}
        </button>
        <button
          onClick={() =>
            onEvent({
              type: 'LINE_OUT',
              teamId,
              ...(ownSelected ? { playerId: ownSelected } : {}),
              targetPlayerId: rivalSelected,
            })
          }
          disabled={pending || !rivalSelected}
          className={btnGhost}
        >
          <Icon name="triangleExclamation" size="sm" /> {t('Line out')}
        </button>
        <button
          onClick={() =>
            onEvent({
              type: 'CATCH',
              teamId,
              playerId: ownSelected,
              throwerTeamId: rivalId,
              throwerPlayerId: rivalSelected,
              ...(reviveSelected ? { revivePlayerId: reviveSelected } : {}),
            })
          }
          disabled={pending || !ownSelected || !rivalSelected}
          className={btnPrimary}
        >
          <Icon name="shield" size="sm" /> {t('Catch')}
        </button>
        <button
          onClick={() => onEvent({ type: 'CARD', cardType: 'YELLOW', teamId, playerId: ownSelected })}
          disabled={pending || !ownSelected}
          className={btnGhost}
        >
          <Icon name="flag" size="sm" /> {t('Yellow card')}
        </button>
        <button
          onClick={() => onEvent({ type: 'CARD', cardType: 'RED', teamId, playerId: ownSelected })}
          disabled={pending || !ownSelected}
          className={btnDanger}
        >
          <Icon name="flag" size="sm" /> {t('Red card')}
        </button>
        <button
          onClick={() => onEvent({ type: 'INJURY', teamId, playerId: ownSelected })}
          disabled={pending || !ownSelected}
          className={btnGhost}
        >
          <Icon name="userPlus" size="sm" /> {t('Injury out')}
        </button>
      </div>

      {revivableOut.length > 0 && (
        <label className="mt-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
            {t('Catch revival target')}
          </span>
          <select value={reviveSelected} onChange={(e) => setRevivePlayer(e.target.value)} className={selectClass}>
            <option value="">{t('Automatic (first out)')}</option>
            {revivableOut.map((playerId) => (
              <option key={playerId} value={playerId}>
                #{playerId}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">{t('Delay')}</p>
        <div className="mt-1 flex gap-2">
          <select
            value={delayType}
            onChange={(e) => setDelayType(e.target.value as DodgeballDelayType)}
            className={selectClass}
          >
            <option value="FIVE_SECOND">{t('5-second delay')}</option>
            <option value="THREE_SECOND">{t('3-second delay')}</option>
          </select>
          <button
            onClick={() =>
              onEvent({
                type: 'DELAY',
                delayType,
                teamId,
                ...(ownSelected ? { playerId: ownSelected } : {}),
              })
            }
            disabled={pending}
            className={btnGhost}
          >
            <Icon name="stopwatch" size="sm" /> {t('Delay')}
          </button>
        </div>
        <p className="mt-1 text-[9px] text-faint">
          {t('A delay awards {points} point(s) to the opponent.', { points: config.delayPenaltyPoints })}
        </p>
      </div>
    </div>
  );
};

const StatsTable: React.FC<{
  stats: DodgeballStatsRow[];
  teamName: (id?: string | null) => string;
}> = ({ stats, teamName }) => {
  const { t } = useI18n();
  const columns = dodgeballScoringEngine.statColumns();
  const teamIds = Array.from(new Set(stats.map((row) => row.teamId).filter((id): id is string => Boolean(id))));

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t('Player stats (by jersey)')}</p>
      <div className="space-y-3">
        {teamIds.map((teamId) => {
          const rows = stats.filter((row) => row.teamId === teamId);
          if (rows.length === 0) return null;
          return (
            <div key={teamId}>
              <p className="mb-1 truncate text-[11px] font-semibold text-ink">{teamName(teamId)}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-left text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-faint">
                      <th className="pb-1 pr-2 font-semibold">{t('Jersey')}</th>
                      {columns.map((column) => (
                        <th key={column.key} className="pb-1 px-1 text-right font-semibold">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.teamId}:${row.playerId}`} className="border-t border-hairline/60">
                        <td className="py-1 pr-2 font-mono font-semibold text-ink">#{row.playerId}</td>
                        {columns.map((column) => (
                          <td key={column.key} className="py-1 px-1 text-right font-mono tabular-nums text-ink">
                            {row.values[column.key] ?? 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
