'use client';

/**
 * Presentational live-score card for participants and the public view
 * (Phase 4). Renders the sanitized MatchScoreViewDto only — no scorer
 * attribution ever reaches readers. Clock values are server-authoritative;
 * the card only interpolates remaining/paused time between polls using the
 * hook's `snapshotAt` anchor, mirroring the scorer console.
 */
import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { MatchScoreViewDto, SanitizedScoreEvent } from '@/shared/types.ts';
import { KhoKhoMatchPhase, KhoKhoScoreEvent, PAUSE_REMINDER_MS } from '@/shared/scoring/types.ts';

const fmtClock = (ms: number) => {
  const clamped = Math.max(0, Math.round(ms));
  const m = Math.floor(clamped / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const PHASE_LABEL: Record<KhoKhoMatchPhase, string> = {
  awaiting_toss: 'Awaiting toss',
  turn_live: 'In play',
  turn_paused: 'Clock stopped',
  turn_break: 'Turn break',
  follow_on_prompt: 'Follow-on decision',
  awaiting_extra_toss: 'Extra innings toss',
  min_time: 'Sudden death',
  awaiting_manual_decision: 'Referee decision pending',
  completed: 'Completed',
};

/** Human one-liner for the events ticker (attribution-free). */
const describeEvent = (
  ev: SanitizedScoreEvent,
  t: (phrase: string, vars?: Record<string, string | number>) => string,
): string => {
  const e = ev as unknown as KhoKhoScoreEvent;
  switch (e.type) {
    case 'TOSS':
      return t('Toss registered');
    case 'TURN_START':
      return e.turn ? t('Turn {turn} under way', { turn: e.turn }) : t('New turn under way');
    case 'TURN_PAUSE':
      return t('Clock stopped');
    case 'TURN_RESUME':
      return t('Clock resumed');
    case 'TURN_END':
      return e.reason === 'all_out'
        ? t('Turn ended — line all out')
        : e.reason === 'manual'
          ? t('Turn ended early')
          : t('Turn timer expired');
    case 'DISMISSAL':
      return e.dismissalType === 'TAG'
        ? t('Defender tagged out (+1)')
        : e.dismissalType === 'OUT_OF_BOUNDS'
          ? t('Out of bounds (+1)')
          : t('Late entry (+1)');
    case 'FOUL_LOG':
      return e.note ? t('Foul logged: {note}', { note: e.note }) : t('Foul logged');
    case 'FOLLOW_ON_DECISION':
      return e.opted ? t('Follow-on enforced') : t('Follow-on declined');
    case 'MIN_TIME_RESULT':
      return t('Sudden-death attempt recorded');
    case 'MANUAL_DECISION':
      return t('Manual decision recorded');
    case 'VOID':
      return t('Earlier event withdrawn');
    default:
      return t('Match event');
  }
};

interface LiveScoreCardProps {
  score: MatchScoreViewDto;
  /** Client timestamp of the snapshot; used for clock interpolation. */
  snapshotAt?: number;
  /** Small caption above the teams (e.g. "Match #3 · Quarter-final"). */
  title?: string;
  /** True when the last poll failed — keeps stale data but flags it. */
  stale?: boolean;
  className?: string;
}

export const LiveScoreCard: React.FC<LiveScoreCardProps> = ({
  score,
  snapshotAt = 0,
  title,
  stale = false,
  className = "",
}) => {
  const { t } = useI18n();
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sb = score.scoreboard;
  const drift = snapshotAt > 0 ? Math.max(0, nowTick - snapshotAt) : 0;
  const na = sb.nextAction;
  const isLikeKhoKho = sb.sport === 'kho-kho';

  const winnerIds = new Set(score.winnerTeamIds ?? []);
  const completed = score.status === 'completed';

  const naTurn =
    na.action === 'turn_running' || na.action === 'turn_paused' || na.action === 'end_turn_available'
      ? na
      : null;
  const clock =
    naTurn && naTurn.action !== 'turn_paused' ? Math.max(0, naTurn.remainingMs - drift) : naTurn ? Math.max(0, naTurn.remainingMs) : null;
  const pausedFor = naTurn && naTurn.action === 'turn_paused' ? naTurn.pausedForMs + drift : 0;

  const lead = sb.teams.reduce(
    (best, t) => (t.totalPoints > best.points ? { team: t, points: t.totalPoints } : best),
    { team: null as (typeof sb.teams)[number] | null, points: 0 },
  );
  const hasLead = !completed && lead.team && lead.points > 0 && sb.teams.length > 1;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {title && (
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {title}
            </span>
          )}
          {stale && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
              <Icon name="circleInfo" size="sm" /> {t("reconnecting…")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400">{t(PHASE_LABEL[sb.phase])}</span>
          {completed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              <Icon name="flag" size="sm" /> {t("Final")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t("Live")}
            </span>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-2 divide-x divide-slate-100">
        {sb.teams.map((team) => {
          const winner = winnerIds.has(String(team.id));
          const leader = hasLead && lead.team?.id === team.id;
          const dimmed = completed && winnerIds.size > 0 && !winner;
          return (
            <div key={String(team.id)} className={`px-4 py-4 ${dimmed ? 'opacity-60' : ''}`}>
              <p className={`truncate text-sm font-bold ${winner ? 'text-emerald-700' : 'text-slate-800'}`}>
                {team.name}
              </p>
              {winner && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  <Icon name="trophy" size="sm" /> {t("Winner")}
                </p>
              )}
              {!winner && leader && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  <Icon name="bolt" size="sm" /> {t("Leading")}
                </p>
              )}
              <p className={`mt-1 font-mono text-3xl font-black tabular-nums ${winner ? 'text-emerald-800' : 'text-slate-900'}`}>
                {team.totalPoints}
              </p>
            </div>
          );
        })}
      </div>

      {/* Turn strip / status strip */}
      {!completed && isLikeKhoKho && (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          {sb.currentTurn && (naTurn || sb.currentTurn.status !== 'live' || na.action === 'start_turn') ? (
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-5">
              <div className="sm:col-span-2 min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">
                  {sb.currentTurn.turnLabel}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {t("Chasing: {team}", { team: sb.currentTurn.chaserTeamName })}
                  {sb.currentTurn.batchDisplay ? ` · ${sb.currentTurn.batchDisplay}` : ''}
                </p>
              </div>
              <div className="sm:col-span-1">
                <p className="font-mono text-xs font-semibold text-slate-700">
                  {sb.currentTurn.points > 0
                    ? sb.currentTurn.points === 1
                      ? t("{count} pt", { count: sb.currentTurn.points })
                      : t("{count} pts", { count: sb.currentTurn.points })
                    : t("No points yet")}
                </p>
                <p className="text-[11px] text-slate-400">
                  {sb.currentTurn.fouls === 1
                    ? t("{dismissals} out · {fouls} foul", { dismissals: sb.currentTurn.dismissals, fouls: sb.currentTurn.fouls })
                    : t("{dismissals} out · {fouls} fouls", { dismissals: sb.currentTurn.dismissals, fouls: sb.currentTurn.fouls })}
                </p>
              </div>
              <div className="sm:col-span-2 flex items-center justify-start sm:justify-end gap-2">
                {naTurn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-base font-extrabold tabular-nums text-white">
                    <Icon name="stopwatch" size="sm" className="text-emerald-300" />
                    {fmtClock(clock ?? 0)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                    <Icon name="pause" size="sm" /> {sb.currentTurn.status === 'paused' ? t("Clock stopped") : t("Awaiting kickoff")}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-slate-500">
              {na.action === 'prompt_toss'
                ? t("Toss is about to take place — scoring starts shortly.")
                : na.action === 'prompt_extra_toss'
                  ? t("Extra innings round {round} — toss under way.", { round: na.round })
                  : na.action === 'record_min_time'
                    ? t("Sudden death — teams are being timed.")
                    : na.action === 'prompt_manual_decision'
                      ? t("Referee is deciding the winner.")
                      : na.action === 'prompt_follow_on'
                        ? t("{team} leads by {points} — follow-on decision pending.", { team: na.leaderTeamName, points: na.leadPoints })
                        : na.action === 'start_turn'
                          ? t("{turn} — {team} to chase.", { turn: na.turnLabel, team: na.chaserTeamName })
                          : t("Match is being set up.")}
            </p>
          )}
        </div>
      )}

      {/* Clock-stopped banner (public copy of the scorer console rule) */}
      {pausedFor > 0 && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800">
          <Icon name="pause" size="sm" />
          {t("CLOCK STOPPED — waiting for the scorer to resume")}
          {pausedFor >= PAUSE_REMINDER_MS && (
            <span className="text-amber-600">{t("({min} min)", { min: Math.floor(pausedFor / 60000) })}</span>
          )}
        </div>
      )}

      {/* Completed banner */}
      {completed && (
        <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900">
          <Icon name="trophy" size="sm" />
          {sb.winner.resolved
            ? `${sb.winner.winnerTeamId ? sb.teams.find((team) => team.id === sb.winner.winnerTeamId)?.name ?? t("Winner") : t("Winner")} · ${sb.winner.label}`
            : sb.winner.label || t("Result decided")}
        </div>
      )}

      {/* Events ticker (no attribution, last few) */}
      {score.events.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-4 py-2.5">
          {[...score.events]
            .sort((a, b) => b.atMs - a.atMs)
            .slice(0, 3)
            .map((ev) => (
              <li key={ev.eventId} className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <span className="truncate font-medium text-slate-600">{describeEvent(ev, t)}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};
