'use client';

/**
 * Sepak Takraw LiveView (hub cards + school/public live panels).
 * Reader-facing only: renders the sanitized scoreboard (points, set wins,
 * serving rotation, deuce, timeouts, sets history, winner). No scorer
 * identity and no attribution data ever reach this card.
 */
import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import type { SanitizedScoreEvent } from '@/shared/types.ts';
import type {
  SepakTakrawPhase,
  SepakTakrawScoreEvent,
  SepakTakrawScoreboard,
} from '@/shared/scoring/sports/sepakTakraw/types.ts';
import type { SportLiveViewProps } from '../registry.ts';

const PHASE_LABEL: Record<SepakTakrawPhase, string> = {
  awaiting_toss: 'Awaiting toss',
  awaiting_lineups: 'Awaiting lineups',
  awaiting_set_start: 'Set about to start',
  set_live: 'In play',
  set_break: 'Set break',
  completed: 'Completed',
};

const pointLabel = (
  pointType: string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string => {
  switch (pointType) {
    case 'ACE':
      return t('Ace');
    case 'ATTACK':
      return t('Attack');
    case 'BLOCK':
      return t('Block');
    default:
      return t('Point');
  }
};

/** Human one-liner for the events ticker (attribution-free). */
const describeEvent = (
  ev: SanitizedScoreEvent,
  teamName: (id?: string | null) => string,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string => {
  const e = ev as unknown as SepakTakrawScoreEvent;
  switch (e.type) {
    case 'TOSS':
      return t('Toss registered');
    case 'LINEUP_SET':
      return t('Lineup confirmed: {team}', { team: teamName(e.teamId) });
    case 'ROLE_SWAP':
      return t('Role swap: {team}', { team: teamName(e.teamId) });
    case 'SUBSTITUTION':
      return t('Substitution: {team}', { team: teamName(e.teamId) });
    case 'SET_START':
      return t('Set {setNo} under way', { setNo: e.setNo });
    case 'POINT':
      return t('{team} point ({pointType})', {
        team: teamName(e.scoringTeamId),
        pointType: pointLabel(e.pointType, t),
      });
    case 'FAULT':
      return t('Fault: {team}', { team: teamName(e.faultyTeamId) });
    case 'TIMEOUT':
      return t('Timeout: {team}', { team: teamName(e.teamId) });
    case 'SIDE_CHANGE_CONFIRMED':
      return t('Teams changed sides');
    case 'MANUAL_DECISION':
      return t('Referee decision recorded');
    case 'PLAYER_ATTRIBUTION':
      return t('Correction recorded');
    case 'VOID':
      return t('Earlier event withdrawn');
    default:
      return t('Match event');
  }
};

export const SepakTakrawLiveView: React.FC<SportLiveViewProps> = ({
  match,
  score,
  stale = false,
  title,
}) => {
  const { t } = useI18n();

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

  const sb: SepakTakrawScoreboard | null =
    score.scoreboard.sport === 'sepak-takraw' ? score.scoreboard : null;
  if (!sb) return null;

  const teamName = (id?: string | null): string =>
    (id ? sb.teams.find((team) => team.id === id)?.name : null) ?? '';

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

  const timeoutsPerSet = 'timeoutsPerSet' in score.config ? score.config.timeoutsPerSet : null;
  const sideChangeAt = 'sideChangeDecidingSetAt' in score.config ? score.config.sideChangeDecidingSetAt : null;

  const winnerName = sb.winner.winnerTeamId ? teamName(sb.winner.winnerTeamId) : '';
  const recentEvents = [...score.events].sort((a, b) => b.atMs - a.atMs).slice(0, 3);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {title && (
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {title}
            </span>
          )}
          {stale && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
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
          const serving = sb.serving?.teamId === team.id;
          return (
            <div key={team.id} className={`px-4 py-4 ${dimmed ? 'opacity-60' : ''}`}>
              <p className={`truncate text-sm font-bold ${winner ? 'text-emerald-700' : 'text-slate-800'}`}>
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
              <p className={`mt-1 font-mono text-3xl font-black tabular-nums ${winner ? 'text-emerald-800' : 'text-slate-900'}`}>
                {sb.points[team.id] ?? 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t('{count} set wins', { count: sb.setWins[team.id] ?? 0 })}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {serving && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {t('Serving')} {sb.serving?.serveCount}/{sb.serving?.maxServes}
                  </span>
                )}
                {timeoutsPerSet !== null && sb.phase === 'set_live' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    <Icon name="stopwatch" size="xs" />
                    {t('Timeouts {used}/{limit}', {
                      used: sb.timeoutsUsed[team.id] ?? 0,
                      limit: timeoutsPerSet,
                    })}
                  </span>
                )}
              </div>
              {serving && sb.serving?.playerId && (
                <p className="mt-1 truncate text-[10px] text-slate-500">
                  {t('Tekong: {player}', { player: sb.serving.playerId })}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {sb.deuce && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
          <Icon name="bolt" size="sm" />
          {t('Deuce — serve changes after every rally.')}
        </div>
      )}

      {sb.sideChangePending && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
          <Icon name="swap" size="sm" />
          {sideChangeAt !== null
            ? t('Deciding set: teams change sides at {threshold} points.', { threshold: sideChangeAt })
            : t('Deciding set: teams are changing sides.')}
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
                    : t('In play')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {completed && (
        <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900">
          <Icon name="trophy" size="sm" />
          {sb.winner.resolved
            ? `${winnerName || t('Winner')} · ${sb.winner.label}`
            : sb.winner.label || t('Result decided')}
        </div>
      )}

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
