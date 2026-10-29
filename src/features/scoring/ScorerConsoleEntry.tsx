'use client';

/**
 * Scoring console entry (/score): scoreable matches for the signed-in staff
 * member (admins/organizers see every scoreable match; scorers only their
 * assigned ones). Falls back to the inline login gate when not authorized.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext.tsx';
import { api } from '@/lib/api.ts';
import type { ScoringMatchListItem } from '@/shared/types.ts';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { ScorerLoginCard } from './ScorerLoginCard.tsx';

const timeLabel = (iso: string | null) => {
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

export const ScorerConsoleEntry: React.FC = () => {
  const { t } = useI18n();
  const { isLoading: authLoading, canScore, loginStaff } = useAuth();
  const [matches, setMatches] = useState<ScoringMatchListItem[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (!canScore) return;
    setError(null);
    try {
      const list = await api.scoring.myMatches();
      setMatches(list);
      setNeedsLogin(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/Authentication required|Access denied|401|403/i.test(message)) {
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
        {t("Loading console…")}
      </div>
    );
  }

  if (needsLogin || !canScore) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-[20px] font-semibold text-ink">{t("Live scoring console")}</h1>
        <ScorerLoginCard onSignedIn={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  const list = matches || [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-[20px] font-semibold text-ink">{t("Your matches")}</h1>
          <p className="text-xs text-muted">
            {matches
              ? list.length === 1
                ? t("{count} scoreable match", { count: list.length })
                : t("{count} scoreable matches", { count: list.length })
              : t("Loading…")}
          </p>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-faint"
        >
          <Icon name="refresh" size="sm" className="text-muted" />
          {t("Refresh")}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 rounded-[6px] bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <Icon name="circleAlert" size="sm" />
          {error}
        </p>
      )}

      {matches && list.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-hairline bg-surface/60 px-5 py-10 text-center">
          <Icon name="calendarCheck" size="xl" className="mx-auto mb-3 text-faint" />
          <p className="text-sm font-semibold text-ink">{t("No live-scoring matches right now")}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            {t("Matches appear here when their tournament is published or ongoing, both teams are decided, and (for scorers) you have been assigned to the match.")}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {list.map((m) => (          <li key={m.matchId}>
            <Link
              href={`/score/${m.matchId}`}
              className="block rounded-[12px] border border-hairline bg-surface p-4 transition-shadow duration-200 hover:shadow-raise"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">
                  {m.roundName} · {t("Match #{number}", { number: m.matchNumber })}
                </span>
                {m.hasScore ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-accent-strong">
                    <Icon name="bolt" size="xs" />
                    {t("Live · v{version}", { version: m.scoreVersion })}
                  </span>
                ) : (
                  <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                    {t("Not started")}
                  </span>
                )}
              </div>

              <div className="font-serif text-[16px] font-semibold text-ink">
                {m.teamA?.name || t("TBD")} <span className="text-faint">{t("vs")}</span> {m.teamB?.name || t("TBD")}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{m.tournamentName} · {m.ageGroup} · {m.gender}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                {timeLabel(m.scheduledAt) && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="calendar" size="xs" />
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
                <span className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-strong">
                  {t("Open console")}
                  <Icon name="chevronRight" size="xs" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
