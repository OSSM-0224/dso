'use client';

/**
 * DSO dodgeball LiveView (hub cards + school/public live panels).
 * Reader-facing only: team set wins, current-set points, the 1:30 clock,
 * anonymous Player 1-6 slots, the three balls per team, the revival window,
 * set history and the winner. No scorer identity, jersey numbers, individual
 * player points or team colours are shown.
 */
import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import {
  type DodgeballPhase,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
} from '@/shared/scoring/sports/dodgeball/types.ts';
import type { SanitizedScoreEvent } from '@/shared/types.ts';
import type { SportLiveViewProps } from '../registry.ts';

const PHASE_LABEL: Record<DodgeballPhase, string> = {
  awaiting_toss: 'Ready for set 1',
  awaiting_lineups: 'Ready for set 1',
  awaiting_set_start: 'Ready for set 1',
  set_live: 'In play',
  set_paused: 'Clock stopped',
  awaiting_revival: 'Revival window',
  extra_time: 'Extra time',
  sudden_death: 'Sudden death',
  set_break: 'Set break',
  completed: 'Completed',
};

const fmtClock = (ms: number | null): string => {
  if (ms === null) return '--:--';
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const playerLabel = (playerId?: string | null): string => {
  if (!playerId) return '';
  const slot = /^p(\d+)$/i.exec(playerId);
  return slot ? `P${slot[1]}` : `#${playerId}`;
};

const describeEvent = (
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string => {
  const e = ev as unknown as Record<string, any>;
  switch (e.type) {
    case 'TEAM_POINT':
      return t('{team} team point', { team: teamName(e.teamId) });
    case 'TOSS':
      return t('Toss registered');
    case 'LINEUP_SET':
      return t('Lineup confirmed: {team}', { team: teamName(e.teamId) });
    case 'SUBSTITUTION':
      return t('Substitution: {team}', { team: teamName(e.teamId) });
    case 'SET_START':
      return t('Set {setNo} under way', { setNo: e.setNo });
    case 'HIT':
      return t('{team} hit {player}', {
        team: teamName(e.teamId),
        player: playerLabel(e.targetPlayerId),
      });
    case 'LINE_OUT':
      return t('{team} line-out point', { team: teamName(e.teamId) });
    case 'CATCH':
      return t('Catch by {team} ({player})', {
        team: teamName(e.teamId),
        player: playerLabel(e.playerId),
      });
    case 'CARD':
      return t('{card} card: {team}', {
        card: e.cardType,
        team: teamName(e.teamId),
      });
    case 'INJURY':
      return t('Injury: {team}', { team: teamName(e.teamId) });
    case 'DELAY':
      return t('Delay penalty: {team}', { team: teamName(e.teamId) });
    case 'REVIVE':
      return t('Revival: {team}', { team: teamName(e.teamId) });
    case 'REVIVAL_FAILED':
      return t('Revival failed: {team}', { team: teamName(e.teamId) });
    case 'PAUSE':
      return t('Clock stopped');
    case 'RESUME':
      return t('Clock resumed');
    case 'SET_END':
      return t('Set {setNo} ended', { setNo: e.setNo });
    case 'EXTRA_TIME_START':
      return t('Extra time started');
    case 'SUDDEN_DEATH_START':
      return t('Sudden death started');
    case 'MANUAL_DECISION':
      return t('Referee decision recorded');
    case 'VOID':
      return t('Earlier event withdrawn');
    default:
      return t('Match event');
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
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [active, anchor]);
  return elapsed;
}

export const DodgeballLiveView: React.FC<SportLiveViewProps> = ({
  match,
  score,
  snapshotAt,
  stale = false,
  title,
}) => {
  const { t } = useI18n();
  const sb: DodgeballScoreboard | null =
    score && score.scoreboard.sport === 'dodgeball' ? score.scoreboard : null;
  const clockActive = Boolean(
    sb?.time && !sb.time.paused && sb.time.period !== 'sudden_death',
  );
  const elapsedMs = useElapsedMs(clockActive, snapshotAt);

  if (!match) return null;
  if (!score) {
    return (
      <div className="flex items-center justify-between text-xs text-ink">
        <div className="truncate">
          {match.teamA?.name || 'TBD'} <span className="text-muted">vs</span>{' '}
          {match.teamB?.name || 'TBD'}
        </div>
        {match.status ? (
          <span className="uppercase text-muted">{match.status}</span>
        ) : null}
      </div>
    );
  }

  if (!sb) return null;

  const teamName = (id?: string | null): string =>
    (id ? sb.teams.find((team) => team.id === id)?.name : null) ?? '';

  const config =
    score && 'hitPoints' in score.config
      ? (score.config as DodgeballScoringConfig)
      : null;

  const completed = score.status === 'completed';
  const winnerIds = new Set(score.winnerTeamIds ?? []);
  if (completed && winnerIds.size === 0 && sb.winner.winnerTeamId) {
    winnerIds.add(sb.winner.winnerTeamId);
  }

  const leader = sb.teams.reduce(
    (best, team) => {
      const setWins = sb.setWins[team.id] ?? 0;
      return setWins > best.setWins
        ? { teamId: team.id, setWins }
        : best;
    },
    { teamId: '', setWins: 0 },
  );
  const hasLead =
    !completed &&
    sb.teams.length > 1 &&
    leader.setWins > 0 &&
    sb.teams.some(
      (team) =>
        team.id !== leader.teamId &&
        (sb.setWins[team.id] ?? 0) < leader.setWins,
    );

  const winnerName = sb.winner.winnerTeamId
    ? teamName(sb.winner.winnerTeamId)
    : '';
  const recentEvents = [...score.events]
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, 3);

  const liveRemaining =
    sb.time?.remainingMs != null
      ? Math.max(0, sb.time.remainingMs - elapsedMs)
      : null;

  const winnerStrip = (
    <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900">
      <Icon name="trophy" size="sm" />
      {sb.winner.kind === 'draw'
        ? t('Match drawn')
        : sb.winner.resolved
          ? `${winnerName || t('Winner')} · ${sb.winner.label}`
          : sb.winner.label || t('Result decided')}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {title && (
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {title}
            </span>
          )}
          {stale && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-amber-700">
              <Icon name="circleInfo" size="sm" /> {t('reconnecting…')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400">
            {t(PHASE_LABEL[sb.phase])}
          </span>
          {completed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              <Icon name="flag" size="sm" /> {t('Final')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t('Live')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-100">
        {sb.teams.map((team) => {
          const winner = winnerIds.has(team.id);
          const leading = hasLead && leader.teamId === team.id;
          const dimmed = completed && winnerIds.size > 0 && !winner;
          const state = sb.teamStates.find((entry) => entry.teamId === team.id);
          return (
            <div
              key={team.id}
              className={`px-4 py-4 ${dimmed ? 'opacity-60' : ''}`}
            >
              <p className="truncate text-sm font-bold text-slate-800">
                {team.name}
              </p>
              {winner ? (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <Icon name="trophy" size="sm" /> {t('Winner')}
                </p>
              ) : leading ? (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  <Icon name="bolt" size="sm" /> {t('Leading')}
                </p>
              ) : null}
              <p className="mt-1 font-mono text-3xl font-black tabular-nums text-slate-800">
                {sb.points[team.id] ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t('Set points')}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {t('Set wins: {wins}', {
                  wins: sb.setWins[team.id] ?? 0,
                })}
              </p>
              {state && (
                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Icon name="bolt" size="sm" />
                  {t('Balls: {count}', {
                    count: state.balls ?? config?.ballsPerTeam ?? 3,
                  })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {sb.time && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {sb.phase === 'sudden_death'
              ? t('Sudden death — first point wins')
              : sb.time.period === 'extra_time'
                ? t('Extra time')
                : t('Set {setNo} · 1:30', { setNo: sb.setNo })}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-800">
            {sb.phase === 'sudden_death'
              ? t('NEXT POINT')
              : fmtClock(liveRemaining)}
          </span>
        </div>
      )}

      {sb.revival && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-800">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size="sm" />
            {t('Revival: {team} — {players}', {
              team: sb.revival.teamName,
              players: sb.revival.outPlayerIds.map(playerLabel).join(', '),
            })}
          </span>
          <span className="font-mono tabular-nums">
            {fmtClock(sb.revival.remainingMs)}
          </span>
        </div>
      )}

      {sb.sets.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('Sets')}
          </p>
          <ul className="space-y-1">
            {sb.sets.map((set) => (
              <li
                key={set.setNo}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="w-14 shrink-0 text-slate-500">
                  {t('Set {setNo}', { setNo: set.setNo })}
                </span>
                <span className="flex-1 text-center font-mono font-semibold tabular-nums text-slate-700">
                  {sb.teams.map((team) => set.points[team.id] ?? 0).join(' – ')}
                </span>
                <span className="w-28 shrink-0 text-right text-[10px] font-semibold text-slate-500">
                  {set.completed
                    ? set.winnerTeamId
                      ? teamName(set.winnerTeamId)
                      : t('Draw')
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

      {completed && winnerStrip}

      {recentEvents.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-4 py-2.5">
          {recentEvents.map((ev) => (
            <li
              key={ev.eventId}
              className="flex items-center gap-2 text-[11px] text-slate-500"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span className="truncate font-medium text-slate-600">
                {describeEvent(ev, teamName, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
