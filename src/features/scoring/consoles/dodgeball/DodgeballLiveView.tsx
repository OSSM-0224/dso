'use client';

/**
 * Dodgeball LiveView (hub cards + school/public live panels).
 * Reader-facing only: renders the sanitized scoreboard (points, set wins,
 * clock, active/out jerseys, revival window, sets and winner). No scorer
 * identity and no attribution data ever reach this card.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { dodgeballScoringEngine } from '@/shared/scoring/sports/dodgeball/engine.ts';
import {
  type DodgeballPhase,
  type DodgeballScoreEvent,
  type DodgeballScoreboard,
  type DodgeballScoringConfig,
  type DodgeballStatsRow,
  DEFAULT_DODGEBALL_SCORING_CONFIG,
} from '@/shared/scoring/sports/dodgeball/types.ts';
import type { MatchScoreViewDto, SanitizedScoreEvent } from '@/shared/types.ts';
import type { SportLiveViewProps } from '../registry.ts';

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

const fmtClock = (ms: number | null): string => {
  if (ms === null) return '--:--';
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

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

const describeEvent = (
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string => {
  const e = ev as unknown as DodgeballScoreEvent;
  switch (e.type) {
    case 'TOSS':
      return t('Toss registered');
    case 'LINEUP_SET':
      return t('Lineup confirmed: {team}', { team: teamName(e.teamId) });
    case 'SUBSTITUTION':
      return t('Substitution: {team}', { team: teamName(e.teamId) });
    case 'SET_START':
      return t('Set {setNo} under way', { setNo: e.setNo });
    case 'HIT':
      return t('{team} hit #{player}', { team: teamName(e.teamId), player: e.targetPlayerId });
    case 'LINE_OUT':
      return t('{team} line-out point', { team: teamName(e.teamId) });
    case 'CATCH':
      return t('Catch by {team} (#{player})', { team: teamName(e.teamId), player: e.playerId });
    case 'CARD':
      return t('{card} card: {team}', { card: e.cardType, team: teamName(e.teamId) });
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

const StatsTable: React.FC<{
  stats: DodgeballStatsRow[];
  teamName: (id?: string | null) => string;
}> = ({ stats, teamName }) => {
  const { t } = useI18n();
  const columns = dodgeballScoringEngine.statColumns();
  const teamIds = Array.from(
    new Set(stats.map((row) => row.teamId).filter((id): id is string => Boolean(id))),
  );

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {t('Player stats (by jersey)')}
      </p>
      <div className="space-y-3">
        {teamIds.map((teamId) => {
          const rows = stats.filter((row) => row.teamId === teamId);
          if (rows.length === 0) return null;
          return (
            <div key={teamId}>
              <p className="mb-1 truncate text-[11px] font-semibold text-slate-700">{teamName(teamId)}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[300px] text-left text-[11px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-slate-400">
                      <th className="pb-1 pr-2 font-semibold">{t('Jersey')}</th>
                      {columns.map((column) => (
                        <th key={column.key} className="px-1 pb-1 text-right font-semibold">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.teamId}:${row.playerId}`} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-mono font-semibold text-slate-700">#{row.playerId}</td>
                        {columns.map((column) => (
                          <td key={column.key} className="px-1 py-1 text-right font-mono tabular-nums text-slate-700">
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

export const DodgeballLiveView: React.FC<SportLiveViewProps> = ({
  match,
  score,
  snapshotAt,
  stale = false,
  title,
}) => {
  const { t } = useI18n();
  const stats = useMemo(() => replayStats(score), [score]);
  const sb: DodgeballScoreboard | null =
    score && score.scoreboard.sport === 'dodgeball' ? score.scoreboard : null;
  const clockActive = Boolean(sb?.time && !sb.time.paused && sb.time.period !== 'sudden_death');
  const elapsedMs = useElapsedMs(clockActive, snapshotAt);

  if (!match) return null;
  if (!score) {
    return (
      <div className="flex items-center justify-between text-xs text-ink">
        <div className="truncate">
          {match.teamA?.name || 'TBD'} <span className="text-muted">vs</span> {match.teamB?.name || 'TBD'}
        </div>
        {match.status ? <span className="uppercase text-muted">{match.status}</span> : null}
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
  const teamAColor =
    config?.teamAColor ?? DEFAULT_DODGEBALL_SCORING_CONFIG.teamAColor ?? '#2563EB';
  const teamBColor =
    config?.teamBColor ?? DEFAULT_DODGEBALL_SCORING_CONFIG.teamBColor ?? '#DC2626';
  const teamColor = (id: string): string =>
    id === match.teamA?.id ? teamAColor : teamBColor;

  const completed = score.status === 'completed';
  const winnerIds = new Set(score.winnerTeamIds ?? []);
  if (completed && winnerIds.size === 0 && sb.winner.winnerTeamId) {
    winnerIds.add(sb.winner.winnerTeamId);
  }

  const leader = sb.teams.reduce(
    (best, team) => {
      const points = sb.points[team.id] ?? 0;
      return points > best.points ? { teamId: team.id, points } : best;
    },
    { teamId: '', points: 0 },
  );
  const hasLead =
    !completed &&
    sb.teams.length > 1 &&
    leader.points > 0 &&
    sb.teams.some((team) => team.id !== leader.teamId && (sb.points[team.id] ?? 0) < leader.points);

  const winnerName = sb.winner.winnerTeamId ? teamName(sb.winner.winnerTeamId) : '';
  const recentEvents = [...score.events].sort((a, b) => b.atMs - a.atMs).slice(0, 3);

  const liveRemaining =
    sb.time?.remainingMs != null ? Math.max(0, sb.time.remainingMs - elapsedMs) : null;

  const winnerStrip = (
    <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900">
      <Icon name="trophy" size="sm" />
      {sb.winner.resolved
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
          <span className="text-[10px] font-semibold text-slate-400">{t(PHASE_LABEL[sb.phase])}</span>
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
          const color = teamColor(team.id);
          return (
            <div key={team.id} className={`px-4 py-4 ${dimmed ? 'opacity-60' : ''}`}>
              <p
                className="truncate text-sm font-bold"
                style={{ color }}
              >
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
              <p
                className="mt-1 font-mono text-3xl font-black tabular-nums"
                style={{ color }}
              >
                {sb.points[team.id] ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t('{count} set wins', { count: sb.setWins[team.id] ?? 0 })}
              </p>
              {state && (
                <>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {t('{active} on court · {out} out', {
                      active: state.activeCount,
                      out: state.outPlayerIds.length,
                    })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {state.activePlayerIds.map((playerId) => (
                      <span
                        key={playerId}
                        className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700"
                      >
                        #{playerId}
                      </span>
                    ))}
                    {state.outPlayerIds.map((playerId) => (
                      <span
                        key={`out-${playerId}`}
                        className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-600 line-through"
                      >
                        #{playerId}
                      </span>
                    ))}
                  </div>
                </>
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
                : t('Set {setNo}', { setNo: sb.setNo })}
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-slate-800">
            {sb.phase === 'sudden_death' ? t('NEXT POINT') : fmtClock(liveRemaining)}
          </span>
        </div>
      )}

      {sb.revival && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-200 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-800">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size="sm" />
            {t('Revival: {team} — {players}', {
              team: sb.revival.teamName,
              players: sb.revival.outPlayerIds.map((id) => `#${id}`).join(', '),
            })}
          </span>
          <span className="font-mono tabular-nums">{fmtClock(sb.revival.remainingMs)}</span>
        </div>
      )}

      {sb.sets.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('Sets')}</p>
          <ul className="space-y-1">
            {sb.sets.map((set) => (
              <li key={set.setNo} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="w-14 shrink-0 text-slate-500">{t('Set {setNo}', { setNo: set.setNo })}</span>
                <span className="flex-1 text-center font-mono font-semibold tabular-nums text-slate-700">
                  {sb.teams.map((team) => set.points[team.id] ?? 0).join(' – ')}
                </span>
                <span className="w-28 shrink-0 text-right text-[10px] font-semibold text-slate-500">
                  {set.completed
                    ? set.winnerTeamId
                      ? teamName(set.winnerTeamId)
                      : t('Completed')
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

      {completed && winnerStrip}

      {recentEvents.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-4 py-2.5">
          {recentEvents.map((ev) => (
            <li key={ev.eventId} className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span className="truncate font-medium text-slate-600">{describeEvent(ev, teamName, t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
