'use client';

/**
 * Tournament picker (/score) — the top level of the tournament-scoped
 * scoring module. Scorers see the tournaments they are rostered on;
 * admins/organizers see every scoreable tournament. Each card opens the
 * tournament's own scoring hub (/score/:tournamentId) — one console hub per
 * tournament, never a global match list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api.ts';
import type { ScoringTournamentSummary } from '@/shared/types.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from './ScorerLoginCard.tsx';
import { getSportConsoleMeta } from './consoles/registry.ts';

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  ongoing: {
    label: 'Ongoing',
    className: 'border-accent-soft bg-accent-soft text-accent-strong',
  },
  published: {
    label: 'Published',
    className: 'border-hairline bg-surface text-ink',
  },
  completed: {
    label: 'Completed',
    className: 'border-hairline bg-canvas text-faint',
  },
};

export const ScorerTournamentsPicker: React.FC = () => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore, role } = useAuth();

  const [tournaments, setTournaments] = useState<ScoringTournamentSummary[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notAssigned, setNotAssigned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!canScore) return;
    setError(null);
    try {
      const list = await api.scoring.scoringTournaments();
      setTournaments(list);
      setNeedsLogin(false);
      setNotAssigned(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not assigned to this match/i.test(message)) {
        setNotAssigned(true);
      } else if (/Authentication required|Access denied|401|403/i.test(message)) {
        setNeedsLogin(true);
      } else {
        setError(message);
      }
    }
  }, [canScore]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load, reloadKey]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading console…')}
      </div>
    );
  }

  if (needsLogin || !canScore) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-[20px] font-semibold text-ink">{t('Tournament picker')}</h1>
        <ScorerLoginCard onSignedIn={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  const list = tournaments || [];
  const isStaff = role === 'admin' || role === 'organizer';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[20px] font-semibold text-ink">{t('Tournament picker')}</h1>
          <p className="text-xs text-muted">
            {tournaments
              ? list.length === 1
                ? t('{count} tournament with live scoring', { count: list.length })
                : t('{count} tournaments with live scoring', { count: list.length })
              : t('Loading…')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && (
            <Link
              href="/score/organizer"
              className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-faint"
            >
              <Icon name="clipboardList" size="sm" className="text-muted" />
              {t('Organizer overview')}
            </Link>
          )}
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-faint"
          >
            <Icon name="refresh" size="sm" className="text-muted" />
            {t('Refresh')}
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-[6px] bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <Icon name="circleAlert" size="sm" />
          {error}
        </p>
      )}

      {notAssigned && (
        <p className="flex items-start gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <Icon name="shieldAlert" size="sm" className="mt-0.5 shrink-0" />
          {t('You are not assigned to this match/tournament. Ask the organizer to assign you as a scorer.')}
        </p>
      )}

      {tournaments && list.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-hairline bg-surface/60 px-5 py-10 text-center">
          <Icon name="trophy" size="xl" className="mx-auto mb-3 text-faint" />
          <p className="text-sm font-semibold text-ink">{t('No live-scoring tournaments right now')}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            {t('Tournaments appear here once published or ongoing — scorers additionally need to be assigned to the tournament roster.')}
          </p>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((tournament) => {
          const chip = STATUS_CHIP[tournament.status] ?? {
            label: tournament.status,
            className: 'border-hairline bg-surface text-ink',
          };
            const consoleEntry = getSportConsoleMeta(tournament.sport);
          return (
            <li key={tournament.id}>
              <Link
                href={`/score/${tournament.id}`}
                className="block rounded-[12px] border border-hairline bg-surface p-4 transition-shadow duration-200 hover:shadow-raise"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${chip.className}`}>
                    {t(chip.label)}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                    {tournament.sport}
                  </span>
                </div>

                <p className="font-serif text-[16px] font-semibold text-ink">{tournament.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {tournament.ageGroup} · {tournament.gender}
                  {consoleEntry ? ` · ${consoleEntry.configSummary(tournament)}` : ''}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="bolt" size="xs" className="text-accent-strong" />
                    {t('{count} live', { count: tournament.liveMatchCount })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="calendar" size="xs" />
                    {t('{count} today', { count: tournament.todayMatchCount })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="clipboardList" size="xs" />
                    {t('{count} scoreable', { count: tournament.scoreableMatchCount })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="userPlus" size="xs" />
                    {tournament.scorerCount === 1
                      ? t('1 scorer assigned')
                      : t('{count} scorers assigned', { count: tournament.scorerCount })}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-strong">
                    {t('Open hub')}
                    <Icon name="chevronRight" size="xs" />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
