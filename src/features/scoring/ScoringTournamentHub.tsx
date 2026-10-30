'use client';

/**
 * Tournament scoring hub (/score/:tournamentId) — one hub PER TOURNAMENT,
 * sourced exclusively from GET /api/scoring/tournaments/:id/matches.
 * Matches never mix across tournaments (spec §4). Completed tournaments are
 * rendered read-only (no console entry into live scoring).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api.ts';
import type { ScoringMatchListItem, ScoringTournamentSummary } from '@/shared/types.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from './ScorerLoginCard.tsx';
import { getSportConsoleMeta } from './consoles/registry.ts';

const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint';

const timeLabel = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const sameDay = (iso: string | null): boolean => {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  } catch {
    return false;
  }
};

type GroupKey = 'live' | 'today' | 'upcoming' | 'done';

const GROUP_ORDER: GroupKey[] = ['live', 'today', 'upcoming', 'done'];

export const ScoringTournamentHub: React.FC<{ tournamentId: string }> = ({ tournamentId }) => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore } = useAuth();
  const router = useRouter();

  const [tournament, setTournament] = useState<ScoringTournamentSummary | null>(null);
  const [matches, setMatches] = useState<ScoringMatchListItem[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notAssigned, setNotAssigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingLegacy, setResolvingLegacy] = useState(false);
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!canScore) return;
    setError(null);
    try {
      const { tournament: t2, matches: list } = await api.scoring.tournamentMatches(tournamentId);
      setTournament(t2);
      setMatches(list);
      setNeedsLogin(false);
      setNotAssigned(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not assigned to this match/i.test(message)) {
        setNotAssigned(true);
        return;
      }
      if (/Authentication required|Access denied|401|403/i.test(message)) {
        setNeedsLogin(true);
        return;
      }
      // LEGACY LINK (/score/:matchId — Next 16 removed that dynamic segment
      // as ambiguous). A bare deep link now lands here as `tournamentId`; on
      // "not found", try resolving it as a legacy match id through the
      // scorer's own match list and upgrade to the tournament-scoped console.
      if (/not found/i.test(message)) {
        setResolvingLegacy(true);
        try {
          const mine = await api.scoring.myMatches();
          const legacy = mine.find((m) => m.matchId === tournamentId);
          if (legacy) {
            router.replace(`/score/${legacy.tournamentId}/${legacy.matchId}`);
            return;
          }
        } catch {
          // fall through to the plain error screen
        }
        setResolvingLegacy(false);
      }
      setError(message);
    }
  }, [canScore, tournamentId, router]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load, reloadKey]);

  const groups = useMemo(() => {
    const map: Record<GroupKey, ScoringMatchListItem[]> = {
      live: [],
      today: [],
      upcoming: [],
      done: [],
    };
    for (const match of matches ?? []) {
      const isDone = match.tournamentStatus === 'completed';
      const isScheduled = match.scheduledAt && sameDay(match.scheduledAt);
      if (match.hasScore && match.scoreVersion > 0 && !isDone) {
        map.live.push(match);
      } else if (isDone || (!isScheduled && match.hasScore)) {
        map.done.push(match);
      } else if (isScheduled) {
        map.today.push(match);
      } else if (!match.scheduledAt && !match.hasScore) {
        // Undecided or unscheduled: keep the "upcoming" queue scannable.
        map.upcoming.push(match);
      } else {
        map.upcoming.push(match);
      }
    }
    return map;
  }, [matches]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading console…')}
      </div>
    );
  }

  if (needsLogin || !canScore) {
    return <ScorerLoginCard onSignedIn={() => setReloadKey((k) => k + 1)} />;
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

  if (resolvingLegacy) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Opening the scoring console…')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[12px] border border-hairline bg-surface p-6 text-center">
        <Icon name="circleAlert" size="xl" className="mx-auto mb-2 text-red-600" />
        <p className="text-sm font-semibold text-ink">{t('Could not load this tournament')}</p>
        <p className="mt-1 text-xs text-muted">{error}</p>
        <Link href="/score" className={`mt-4 inline-flex ${btnGhost}`}>
          <Icon name="arrowLeft" size="sm" />
          {t('Back to tournament picker')}
        </Link>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading tournament…')}
      </div>
    );
  }

  const isReadOnly = tournament.isReadOnly;
  const consoleEntry = getSportConsoleMeta(tournament.sport);
  const rounds = Array.from(new Set((matches ?? []).map((m) => m.roundName)));

  const GROUP_TITLE: Record<GroupKey, string> = {
    live: t('Live'),
    today: t('Today'),
    upcoming: t('Upcoming'),
    done: t('Completed'),
  };

  return (
    <div className="space-y-5">
      {/* Header — per-tournament identity + config summary from the registry. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/score" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-strong">
              <Icon name="arrowLeft" size="xs" />
              {t('Tournament picker')}
            </Link>
            {isReadOnly && (
              <span className="rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
                {t('Read-only')}
              </span>
            )}
          </div>
          <h1 className="mt-1 font-serif text-[20px] font-semibold text-ink">{tournament.name}</h1>
          <p className="text-xs text-muted">
            {tournament.sport} · {tournament.ageGroup} · {tournament.gender}
            {consoleEntry ? ` · ${consoleEntry.configSummary(tournament)}` : ''}
            {` · ${tournament.scorerCount === 1 ? t('1 scorer assigned') : t('{count} scorers assigned', { count: tournament.scorerCount })}`}
          </p>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-faint"
        >
          <Icon name="refresh" size="sm" className="text-muted" />
          {t('Refresh')}
        </button>
      </div>

      {/* Round filter (scannable hubs for big draws). */}
      {rounds.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setRoundFilter('all')}
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${
              roundFilter === 'all'
                ? 'border-accent-strong bg-accent-soft text-accent-strong'
                : 'border-hairline bg-surface text-muted'
            }`}
          >
            {t('All rounds')}
          </button>
          {rounds.map((round) => (
            <button
              key={round}
              onClick={() => setRoundFilter(round)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${
                roundFilter === round
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-hairline bg-surface text-muted'
              }`}
            >
              {round}
            </button>
          ))}
        </div>
      )}

      {matches && matches.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-hairline bg-surface/60 px-5 py-10 text-center">
          <Icon name="calendarCheck" size="xl" className="mx-auto mb-3 text-faint" />
          <p className="text-sm font-semibold text-ink">{t('No scoreable matches in this hub')}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            {t('Matches appear when both teams are decided and the tournament is published/ongoing.')}
          </p>
        </div>
      )}

      {GROUP_ORDER.map((key) => {
        const group = groups[key]
          .filter((m) => roundFilter === 'all' || m.roundName === roundFilter);
        if (group.length === 0) return null;
        return (
          <section key={key} className="space-y-3">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-[0.06em] text-faint">
              {GROUP_TITLE[key]} · {group.length}
            </h2>
            <ul className="space-y-3">
              {group.map((m) => (
                <li key={m.matchId}>
                  {isReadOnly || key === 'done' ? (
                    <MatchCardSummary match={m} />
                  ) : (
                    <Link
                      href={`/score/${tournamentId}/${m.matchId}`}
                      className="block rounded-[12px] border border-hairline bg-surface p-4 transition-shadow duration-200 hover:shadow-raise"
                    >
                      <MatchCardBody match={m} actionable />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );

  function MatchCardSummary({ match: m }: { match: ScoringMatchListItem }) {
    return (
      <div className="block rounded-[12px] border border-hairline bg-canvas p-4 opacity-80">
        <MatchCardBody match={m} actionable={false} />
        <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
          {t('Result recorded — read-only')}
        </p>
      </div>
    );
  }

  function MatchCardBody({
    match: m,
    actionable,
  }: {
    match: ScoringMatchListItem;
    actionable: boolean;
  }) {
    return (
      <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
            {m.roundName} · {t('Match #{number}', { number: m.matchNumber })}
          </span>
          {m.hasScore ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-accent-strong">
              <Icon name="bolt" size="xs" />
              {t('Live · v{version}', { version: m.scoreVersion })}
            </span>
          ) : (
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
              {t('Not started')}
            </span>
          )}
        </div>

        <div className="font-serif text-[16px] font-semibold text-ink">
          {m.teamA?.name || t('TBD')} <span className="text-faint">{t('vs')}</span> {m.teamB?.name || t('TBD')}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          {timeLabel(m.scheduledAt) && (
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" size="xs" />
              {timeLabel(m.scheduledAt)}
            </span>
          )}
          {m.venue && (
            <span className="inline-flex items-center gap-1">
              <Icon name="location" size="xs" />
              {m.venue}
            </span>
          )}
          {m.scorerNames.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="userPlus" size="xs" />
              {m.scorerNames.join(', ')}
            </span>
          )}
          {actionable && (
            <span className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-strong">
              {t('Open console')}
              <Icon name="chevronRight" size="xs" />
            </span>
          )}
        </div>
      </>
    );
  }
};
