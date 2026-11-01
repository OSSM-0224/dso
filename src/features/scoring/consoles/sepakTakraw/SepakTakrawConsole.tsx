'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/i18n/LanguageProvider';
import { ToastBanner } from '@/features/scoring/shared/ToastBanner';
import type { SanitizedScoreEvent } from '@/shared/types';
import {
  SEPAK_TAKRAW_FAULTS,
  SEPAK_TAKRAW_ROLE_LABELS,
  type SepakTakrawFaultType,
  type SepakTakrawLineupSlot,
  type SepakTakrawPointType,
  type SepakTakrawScoreEvent,
  type SepakTakrawScoreboard,
  type SepakTakrawScoringConfig,
} from '@/shared/scoring/sports/sepakTakraw/types';
import type { SportConsoleProps } from '../registry';

const btnGhost =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45';
const btnPrimary =
  'flex items-center justify-center gap-1.5 rounded-[6px] bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity duration-200 disabled:opacity-45';
const btnAccent =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-soft bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-strong transition-colors duration-200 disabled:opacity-45';
const btnDanger =
  'flex items-center justify-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors duration-200 disabled:opacity-45';
const inputClass =
  'w-full rounded-[6px] border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-accent-strong focus:outline-none';
const selectClass =
  'w-full rounded-[6px] border border-hairline bg-surface px-2 py-2 text-xs text-ink focus:border-accent-strong focus:outline-none';

type DerivedLineup = { onCourt: SepakTakrawLineupSlot[]; subs: string[] };
type SendEvent = (payload: Record<string, unknown>) => boolean;

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

function deriveLineups(events: SanitizedScoreEvent[]): Record<string, DerivedLineup> {
  const voided = new Set<string>();
  for (const ev of events) {
    if (ev.type !== 'VOID') continue;
    const parsed = ev as unknown as SepakTakrawScoreEvent;
    if (parsed.type === 'VOID') voided.add(parsed.targetEventId);
  }

  const lineups: Record<string, DerivedLineup> = {};
  for (const ev of events) {
    if (voided.has(ev.eventId)) continue;
    const parsed = ev as unknown as SepakTakrawScoreEvent;
    switch (parsed.type) {
      case 'LINEUP_SET':
        lineups[parsed.teamId] = {
          onCourt: parsed.onCourt.map((slot) => ({ ...slot })),
          subs: [...parsed.subs],
        };
        break;
      case 'ROLE_SWAP': {
        const lineup = lineups[parsed.teamId];
        if (!lineup) break;
        const first = lineup.onCourt.find((slot) => slot.playerId === parsed.playerId);
        const second = lineup.onCourt.find((slot) => slot.playerId === parsed.withPlayerId);
        if (first && second) {
          const role = first.role;
          first.role = second.role;
          second.role = role;
        }
        break;
      }
      case 'SUBSTITUTION': {
        const lineup = lineups[parsed.teamId];
        if (!lineup) break;
        const slot = lineup.onCourt.find((entry) => entry.playerId === parsed.outPlayerId);
        const subIndex = lineup.subs.indexOf(parsed.inPlayerId);
        if (slot && subIndex >= 0) {
          slot.playerId = parsed.inPlayerId;
          lineup.subs.splice(subIndex, 1);
          lineup.subs.push(parsed.outPlayerId);
        }
        break;
      }
      default:
        break;
    }
  }
  return lineups;
}

function describeEvent(
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string {
  const parsed = ev as unknown as SepakTakrawScoreEvent;
  switch (parsed.type) {
    case 'TOSS':
      return t('Toss: {team} chose {choice}', {
        team: teamName(parsed.winnerTeamId),
        choice: parsed.choice === 'SERVE' ? t('serve') : t('receive'),
      });
    case 'LINEUP_SET':
      return t('Lineup set: {team}', { team: teamName(parsed.teamId) });
    case 'ROLE_SWAP':
      return t('Role swap: {team}', { team: teamName(parsed.teamId) });
    case 'SUBSTITUTION':
      return t('Substitution: {team}', { team: teamName(parsed.teamId) });
    case 'SET_START':
      return t('Set {setNo} started', { setNo: parsed.setNo });
    case 'POINT':
      return t('Point: {team} ({pointType})', {
        team: teamName(parsed.scoringTeamId),
        pointType: parsed.pointType,
      });
    case 'FAULT':
      return t('Fault: {team} ({faultType})', {
        team: teamName(parsed.faultyTeamId),
        faultType: parsed.faultType,
      });
    case 'TIMEOUT':
      return t('Timeout: {team}', { team: teamName(parsed.teamId) });
    case 'SIDE_CHANGE_CONFIRMED':
      return t('Side change confirmed (set {setNo})', { setNo: parsed.setNo });
    case 'MANUAL_DECISION':
      return t('Manual decision: {team}', { team: teamName(parsed.winnerTeamId) });
    case 'PLAYER_ATTRIBUTION':
      return t('Player attribution updated');
    case 'VOID':
      return t('Earlier event withdrawn');
    default:
      return t('Match event');
  }
}

export const SepakTakrawConsole: React.FC<SportConsoleProps> = (props) => {
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

  const sb = score && score.scoreboard.sport === 'sepak-takraw' ? score.scoreboard : null;
  const config = score && 'setPoints' in score.config ? score.config : null;
  const lineups = useMemo(() => deriveLineups(score?.events ?? []), [score?.events]);

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
          <Link href={`/score/${tournamentId}`} className={`mt-4 inline-flex ${btnGhost}`}>
            <Icon name="arrowLeft" size="sm" />
            {t('Back to the hub')}
          </Link>
        </div>
      </div>
    );
  }

  if (!score || !sb) {
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
        setNo={action.setNo}
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
        {action.missingTeamIds.map((teamId) => (
          <LineupPanel
            key={teamId}
            teamId={teamId}
            teamName={teamName(teamId)}
            pending={pending}
            onEvent={send}
          />
        ))}
      </div>
    );
  } else if (action.action === 'start_set') {
    promptBody = (
      <StartSetPanel
        setNo={action.setNo}
        deciding={action.deciding}
        pending={pending}
        onEvent={send}
      />
    );
  } else if (action.action === 'rally_ready' || action.action === 'side_change_pending') {
    promptBody = (
      <div className="space-y-3">
        {sb.sideChangePending && (
          <SideChangeBanner
            threshold={config?.sideChangeDecidingSetAt ?? 8}
            setNo={sb.setNo}
            pending={pending}
            onEvent={send}
          />
        )}
        {config && (
          <RallyPanel
            sb={sb}
            config={config}
            teamAId={teamAId}
            teamBId={teamBId}
            teamAName={teamAName}
            teamBName={teamBName}
            lineups={lineups}
            pending={pending}
            onEvent={send}
          />
        )}
      </div>
    );
  } else if (action.action === 'set_complete') {
    promptBody = (
      <div className="rounded-[12px] border border-hairline bg-surface p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">{t('Set complete')}</p>
        <p className="mt-1 text-sm text-ink">
          {t('Set {setNo} won by {team}', { setNo: action.setNo, team: teamName(action.winnerTeamId) })}
        </p>
        <button
          onClick={() => send({ type: 'SET_START', setNo: sb.setNo })}
          disabled={pending}
          className={`mt-4 w-full ${btnPrimary}`}
        >
          {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="play" size="sm" />}
          {t('Start set {setNo}', { setNo: sb.setNo })}
        </button>
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
          {t('Set {setNo}', { setNo: sb.setNo })} · {sb.phase.replace(/_/g, ' ')} · v{score.version}
          {scorerNames.length > 0 ? ` · ${t('scorers: {names}', { names: scorerNames.join(', ') })}` : ''}
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
          const serving = sb.serving?.teamId === teamId;
          return (
            <div
              key={teamId}
              className={`rounded-[12px] border p-4 ${
                serving ? 'border-accent-strong bg-accent-soft/30' : 'border-hairline bg-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs font-semibold text-ink">{teamName(teamId)}</p>
                {serving && (
                  <span className="shrink-0 rounded-full bg-accent-strong px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    {t('Serving')} {sb.serving?.serveCount}/{sb.serving?.maxServes}
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-ink">{sb.points[teamId] ?? 0}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t('Set wins: {count}', { count: sb.setWins[teamId] ?? 0 })}
              </p>
              {serving && sb.serving?.playerId && (
                <p className="mt-1 truncate text-[10px] text-muted">
                  {t('Tekong: {player}', { player: sb.serving.playerId })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {sb.deuce && (
        <p className="flex items-center justify-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Icon name="bolt" size="sm" /> {t('Deuce — serve changes after every rally.')}
        </p>
      )}

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
                  {set.completed ? teamName(set.winnerTeamId) : t('In play')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sb.phase === 'set_live' && (lineups[teamAId] || lineups[teamBId]) && (
        <div className="space-y-3">
          {[teamAId, teamBId].map((teamId) => (
            <PlayerChangesCard
              key={teamId}
              teamId={teamId}
              teamName={teamName(teamId)}
              lineup={lineups[teamId]}
              pending={pending}
              onEvent={send}
            />
          ))}
        </div>
      )}

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
  setNo: number;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ setNo, teamAId, teamBId, teamAName, teamBName, pending, onEvent }) => {
  const { t } = useI18n();
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [choice, setChoice] = useState<'SERVE' | 'RECEIVE'>('SERVE');
  const deciding = setNo > 1;

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        <Icon name="trophy" size="xs" />
        {deciding ? t('Deciding-set toss (set {setNo})', { setNo }) : t('Opening toss')}
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
      {winnerTeamId && (
        <div className="mt-3">
          <p className="mb-2 text-center text-[11px] text-muted">{t('Toss won — choose to serve or receive.')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChoice('SERVE')}
              className={`rounded-[6px] border px-3 py-2 text-xs font-semibold ${
                choice === 'SERVE'
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-hairline bg-surface text-ink'
              }`}
            >
              {t('Serve first')}
            </button>
            <button
              onClick={() => setChoice('RECEIVE')}
              className={`rounded-[6px] border px-3 py-2 text-xs font-semibold ${
                choice === 'RECEIVE'
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-hairline bg-surface text-ink'
              }`}
            >
              {t('Receive first')}
            </button>
          </div>
          <button
            onClick={() => onEvent({ type: 'TOSS', winnerTeamId, choice, forSetNo: setNo })}
            disabled={pending}
            className={`mt-3 w-full ${btnPrimary}`}
          >
            {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="check" size="sm" />}
            {t('Record toss')}
          </button>
        </div>
      )}
    </div>
  );
};

const LineupPanel: React.FC<{
  teamId: string;
  teamName: string;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ teamId, teamName, pending, onEvent }) => {
  const { t } = useI18n();
  const [tekong, setTekong] = useState('');
  const [feeder, setFeeder] = useState('');
  const [striker, setStriker] = useState('');
  const [subsText, setSubsText] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const ids = [tekong.trim(), feeder.trim(), striker.trim()];
    if (ids.some((id) => !id)) {
      setError(t('Enter all three on-court players.'));
      return;
    }
    if (new Set(ids).size !== ids.length) {
      setError(t('Player names/ids must be distinct.'));
      return;
    }
    const subs = subsText.split(',').map((part) => part.trim()).filter(Boolean);
    if (new Set(subs).size !== subs.length || subs.some((sub) => ids.includes(sub))) {
      setError(t('Substitutes must be distinct and not on court.'));
      return;
    }
    setError('');
    onEvent({
      type: 'LINEUP_SET',
      teamId,
      onCourt: [
        { playerId: ids[0], role: 'TEKONG' },
        { playerId: ids[1], role: 'FEEDER' },
        { playerId: ids[2], role: 'STRIKER' },
      ],
      subs,
    });
  };

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        <Icon name="users" size="xs" /> {t('Lineup: {team}', { team: teamName })}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Tekong</span>
          <input value={tekong} onChange={(e) => setTekong(e.target.value)} placeholder={t('Player name or ID')} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Feeder</span>
          <input value={feeder} onChange={(e) => setFeeder(e.target.value)} placeholder={t('Player name or ID')} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">Striker</span>
          <input value={striker} onChange={(e) => setStriker(e.target.value)} placeholder={t('Player name or ID')} className={inputClass} />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
          {t('Substitutes (comma-separated, optional)')}
        </span>
        <input value={subsText} onChange={(e) => setSubsText(e.target.value)} placeholder={t('e.g. Riya, Aman')} className={inputClass} />
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

const SideChangeBanner: React.FC<{
  threshold: number;
  setNo: number;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ threshold, setNo, pending, onEvent }) => {
  const { t } = useI18n();
  return (
    <div className="rounded-[12px] border border-amber-200 bg-amber-50/70 p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
        <Icon name="swap" size="xs" /> {t('Side change')}
      </p>
      <p className="mt-1 text-xs text-amber-900">
        {t('A team reached {threshold} points in the deciding set. Confirm once the teams have switched sides.', {
          threshold,
        })}
      </p>
      <button
        onClick={() => onEvent({ type: 'SIDE_CHANGE_CONFIRMED', setNo })}
        disabled={pending}
        className={`mt-3 w-full ${btnPrimary}`}
      >
        {pending ? <Icon name="spinner" size="sm" spin /> : <Icon name="check" size="sm" />}
        {t('Confirm side change')}
      </button>
    </div>
  );
};

const RallyPanel: React.FC<{
  sb: SepakTakrawScoreboard;
  config: SepakTakrawScoringConfig;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  lineups: Record<string, DerivedLineup>;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ sb, config, teamAId, teamBId, teamAName, teamBName, lineups, pending, onEvent }) => {
  const { t } = useI18n();
  const [selectedPlayer, setSelectedPlayer] = useState<Record<string, string>>({});
  const [faultType, setFaultType] = useState<Record<string, SepakTakrawFaultType>>({});
  const servingTeamId = sb.serving?.teamId ?? '';
  const teams = [
    { id: teamAId, name: teamAName },
    { id: teamBId, name: teamBName },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {teams.map((team) => {
        const serving = servingTeamId === team.id;
        const players = lineups[team.id]?.onCourt ?? [];
        const player = selectedPlayer[team.id] ?? '';
        const faultOptions = SEPAK_TAKRAW_FAULTS.filter(
          (fault) =>
            (fault.category !== 'service' || serving) &&
            !(fault.type === 'BALL_TOUCHING_NET_ON_SERVE' && config.letServeAllowed),
        );
        const selectedFault = faultType[team.id] ?? faultOptions[0]?.type ?? '';
        const timeoutsUsed = sb.timeoutsUsed[team.id] ?? 0;

        const postPoint = (pointType: SepakTakrawPointType) => {
          const payload: Record<string, unknown> = {
            type: 'POINT',
            pointType,
            scoringTeamId: team.id,
          };
          if (pointType === 'ACE') {
            if (sb.serving?.playerId) payload.playerId = sb.serving.playerId;
          } else if (pointType !== 'OTHER' && player) {
            payload.playerId = player;
          }
          onEvent(payload);
        };

        return (
          <div
            key={team.id}
            className={`rounded-[12px] border p-4 ${
              serving ? 'border-accent-strong bg-accent-soft/30' : 'border-hairline bg-surface'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-ink">{team.name}</p>
              {serving && (
                <span className="shrink-0 rounded-full bg-accent-strong px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  {t('Serving')}
                </span>
              )}
            </div>

            {players.length > 0 && (
              <label className="mt-3 block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                  {t('Attribute to (optional)')}
                </span>
                <select
                  value={player}
                  onChange={(e) => setSelectedPlayer((map) => ({ ...map, [team.id]: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">{t('Unassigned')}</option>
                  {players.map((slot) => (
                    <option key={slot.playerId} value={slot.playerId}>
                      {slot.playerId} · {SEPAK_TAKRAW_ROLE_LABELS[slot.role]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => postPoint('ACE')}
                disabled={pending || !serving}
                className={serving ? btnAccent : btnGhost}
                title={!serving ? t('Only the serving team can score an ace.') : undefined}
              >
                <Icon name="bolt" size="sm" /> {t('Ace')}
              </button>
              <button onClick={() => postPoint('ATTACK')} disabled={pending} className={btnPrimary}>
                <Icon name="bolt" size="sm" /> {t('Attack')}
              </button>
              <button onClick={() => postPoint('BLOCK')} disabled={pending} className={btnPrimary}>
                <Icon name="shield" size="sm" /> {t('Block')}
              </button>
              <button onClick={() => postPoint('OTHER')} disabled={pending} className={btnGhost}>
                <Icon name="plus" size="sm" /> {t('Other point')}
              </button>
            </div>

            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                {t('Fault by {team}', { team: team.name })}
              </p>
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedFault}
                  onChange={(e) =>
                    setFaultType((map) => ({ ...map, [team.id]: e.target.value as SepakTakrawFaultType }))
                  }
                  className={selectClass}
                >
                  {faultOptions.map((fault) => (
                    <option key={fault.type} value={fault.type}>
                      {t(fault.label)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    onEvent({
                      type: 'FAULT',
                      faultType: selectedFault,
                      faultyTeamId: team.id,
                      ...(player ? { playerId: player } : {}),
                    })
                  }
                  disabled={pending || !selectedFault}
                  className={btnDanger}
                >
                  <Icon name="triangleExclamation" size="sm" /> {t('Fault')}
                </button>
              </div>
            </div>

            <button
              onClick={() => onEvent({ type: 'TIMEOUT', teamId: team.id, setNo: sb.setNo })}
              disabled={pending || timeoutsUsed >= config.timeoutsPerSet}
              className={`mt-2 w-full ${btnGhost}`}
            >
              <Icon name="stopwatch" size="sm" />
              {t('Timeout ({used}/{limit})', { used: timeoutsUsed, limit: config.timeoutsPerSet })}
            </button>
          </div>
        );
      })}
    </div>
  );
};

const PlayerChangesCard: React.FC<{
  teamId: string;
  teamName: string;
  lineup: DerivedLineup | undefined;
  pending: boolean;
  onEvent: SendEvent;
}> = ({ teamId, teamName, lineup, pending, onEvent }) => {
  const { t } = useI18n();
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');
  const [outPlayer, setOutPlayer] = useState('');
  const [inPlayer, setInPlayer] = useState('');

  if (!lineup) return null;

  return (
    <div className="rounded-[12px] border border-hairline bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
        {t('{team} · on court', { team: teamName })}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {lineup.onCourt.map((slot) => (
          <li
            key={slot.playerId}
            className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink"
          >
            <span className="font-mono font-bold text-accent-strong">{SEPAK_TAKRAW_ROLE_LABELS[slot.role]}</span>
            {slot.playerId}
          </li>
        ))}
      </ul>
      {lineup.subs.length > 0 && (
        <p className="mt-1 text-[10px] text-muted">{t('Subs: {players}', { players: lineup.subs.join(', ') })}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className={selectClass}>
          <option value="">{t('Player A')}</option>
          {lineup.onCourt.map((slot) => (
            <option key={slot.playerId} value={slot.playerId}>
              {slot.playerId}
            </option>
          ))}
        </select>
        <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className={selectClass}>
          <option value="">{t('Player B')}</option>
          {lineup.onCourt.map((slot) => (
            <option key={slot.playerId} value={slot.playerId}>
              {slot.playerId}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={() => onEvent({ type: 'ROLE_SWAP', teamId, playerId: swapA, withPlayerId: swapB })}
        disabled={pending || !swapA || !swapB || swapA === swapB}
        className={`mt-2 w-full ${btnGhost}`}
      >
        <Icon name="swap" size="sm" /> {t('Swap roles')}
      </button>

      {lineup.subs.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={outPlayer} onChange={(e) => setOutPlayer(e.target.value)} className={selectClass}>
              <option value="">{t('Outgoing player')}</option>
              {lineup.onCourt.map((slot) => (
                <option key={slot.playerId} value={slot.playerId}>
                  {slot.playerId}
                </option>
              ))}
            </select>
            <select value={inPlayer} onChange={(e) => setInPlayer(e.target.value)} className={selectClass}>
              <option value="">{t('Incoming sub')}</option>
              {lineup.subs.map((playerId) => (
                <option key={playerId} value={playerId}>
                  {playerId}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => onEvent({ type: 'SUBSTITUTION', teamId, outPlayerId: outPlayer, inPlayerId: inPlayer })}
            disabled={pending || !outPlayer || !inPlayer}
            className={`mt-2 w-full ${btnGhost}`}
          >
            <Icon name="swap" size="sm" /> {t('Substitute')}
          </button>
        </div>
      )}
    </div>
  );
};
