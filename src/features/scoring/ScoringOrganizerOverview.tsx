'use client';

/**
 * STAFF-ONLY organizer overview (/score/organizer) — every scoreable
 * tournament with its live/today matches, grouped per tournament. Uses the
 * dedicated organiser endpoint, NOT the scorer's console.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api.ts';
import type { OrganizerOverviewGroup } from '@/shared/types.ts';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';

const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint';

export const ScoringOrganizerOverview: React.FC = () => {
  const { t } = useI18n();
  const { isLoading: authLoading, canWrite } = useAuth();

  const [groups, setGroups] = useState<OrganizerOverviewGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!canWrite) return;
    setError(null);
    try {
      setGroups(await api.scoring.organizerOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [canWrite]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load, reloadKey]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Icon name="spinner" size="md" spin />
        {t('Loading overview…')}
      </div>
    );
  }

  if (!canWrite) {
    return (
      <p className="flex items-center gap-1.5 rounded-[6px] bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        <Icon name="shieldAlert" size="sm" />
        {t('Organizer overview is restricted to admins and organizers.')}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/score" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-strong">
            <Icon name="arrowLeft" size="xs" />
            {t('Tournament picker')}
          </Link>
          <h1 className="mt-1 font-serif text-[20px] font-semibold text-ink">{t('Organizer overview')}</h1>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-faint"
        >
          <Icon name="refresh" size="sm" className="text-muted" />
          {t('Refresh')}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-[6px] bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <Icon name="circleAlert" size="sm" />
          {error}
        </p>
      )}

      {groups === null && !error && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Icon name="spinner" size="md" spin />
          {t('Loading…')}
        </div>
      )}

      {groups && groups.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-hairline bg-surface/60 px-5 py-10 text-center">
          <Icon name="trophy" size="xl" className="mx-auto mb-3 text-faint" />
          <p className="text-sm font-semibold text-ink">{t('No scoreable tournaments')}</p>
        </div>
      )}

      <ul className="space-y-4">
        {(groups ?? []).map((group) => (
          <li key={group.tournament.id} className="rounded-[12px] border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/score/${group.tournament.id}`}
                className="font-serif text-[16px] font-semibold text-ink underline-offset-4 hover:underline"
              >
                {group.tournament.name}
              </Link>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
                {group.tournament.sport} · {group.tournament.ageGroup} · {group.tournament.gender} ·{' '}
                {group.tournament.status}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {t('{count} live', { count: group.tournament.liveMatchCount })} ·{' '}
              {t('{count} today', { count: group.tournament.todayMatchCount })} ·{' '}
              {t('{count} scoreable', { count: group.tournament.scoreableMatchCount })}
            </p>
            <ul className="mt-3 space-y-1.5">
              {group.matches.map((m) => (
                <li
                  key={m.matchId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-canvas px-3 py-2 text-xs text-ink"
                >
                  <span className="text-muted">
                    {m.roundName} · {t('Match #{number}', { number: m.matchNumber })}
                  </span>
                  <span className="font-medium">
                    {m.teamA?.name || t('TBD')} <span className="text-faint">{t('vs')}</span>{' '}
                    {m.teamB?.name || t('TBD')}
                  </span>
                  {m.hasScore ? (
                    <span className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.04em] text-accent-strong">
                      <Icon name="bolt" size="xs" />
                      {t('Live · v{version}', { version: m.scoreVersion })}
                    </span>
                  ) : (
                    <span className="text-faint">{t('Waiting')}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {groups && groups.length > 0 && (
        <Link
          href="/score"
          className="mx-auto mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-accent-strong"
        >
          {t('Back to scoring')}
        </Link>
      )}
    </div>
  );
};
