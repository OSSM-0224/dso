'use client';

/**
 * Tournament "Scorers" tab (admin/organizer) — manages the TOURNAMENT-level
 * scorer roster. Every scorer on this roster may score all scoreable matches
 * of the tournament (tournament-scoped authorization, spec §2); per-match
 * overrides may still narrow via the existing match assignment modal.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '@/lib/api.ts';
import type { TournamentScorerRoster } from '@/shared/types.ts';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';

export const TournamentScorersTab: React.FC<{ tournamentId: string }> = ({ tournamentId }) => {
  const { t } = useI18n();
  const [roster, setRoster] = useState<TournamentScorerRoster | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.admin.scorers.getTournamentScorers(tournamentId);
      setRoster(data);
      setSelected(new Set(data.scorerIds));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (roster?.candidates ?? []).filter(
      (c) => !query || c.name.toLowerCase().includes(query) || (c.identifier ?? '').toLowerCase().includes(query)
    );
  }, [roster, search]);

  const dirty = useMemo(() => {
    if (!roster) return false;
    const current = new Set(roster.scorerIds);
    if (current.size !== selected.size) return true;
    for (const id of selected) if (!current.has(id)) return true;
    return false;
  }, [roster, selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await api.admin.scorers.setTournamentScorers(tournamentId, Array.from(selected));
      setRoster((prev) => (prev ? { ...prev, scorerIds: res.scorerIds, scorerNames: res.scorerNames } : prev));
      setSavedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
        <div className="text-xs text-slate-500">{t('Loading scorer roster...')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current tournament-level assignment (saved state) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-bold text-slate-900">
          {t('Tournament scorer roster')}
          <span className="ml-2 text-xs font-medium text-slate-400">
            {t('{count} assigned', { count: roster?.scorerIds.length ?? 0 })}
          </span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {t('Scorers on this roster may open the console of every scoreable match in this tournament.')}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(roster?.scorerIds.length ?? 0) === 0 && (
            <span className="text-xs text-slate-400">{t('No scorers assigned yet.')}</span>
          )}
          {(roster?.scorerIds ?? []).map((id, idx) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
            >
              <Icon name="userPlus" size="xs" />
              {roster?.scorerNames[idx] ?? id}
            </span>
          ))}
        </div>
      </div>

      {/* Assignment editor */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">{t('Assign scorers')}</h2>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search scorers…')}
              className="w-56 pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:border-indigo-500 focus:outline-none"
            />
            <Icon name="search" size="sm" className="absolute left-2 top-1.5 text-slate-400" />
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            <Icon name="circleAlert" size="sm" />
            {error}
          </p>
        )}
        {savedAt && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            <Icon name="circleCheck" size="sm" />
            {t('Roster saved.')}
          </p>
        )}

        <ul className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="py-6 text-center text-xs text-slate-400">
              {t('No scorer accounts available — create staff accounts in the admin panel.')}
            </li>
          )}
          {candidates.map((candidate) => {
            const isChecked = selected.has(candidate.id);
            return (
              <li key={candidate.id}>
                <label
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                    isChecked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(candidate.id)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="truncate text-xs font-semibold text-slate-800">{candidate.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {candidate.identifier ?? candidate.id}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center justify-end gap-2">
          {dirty && (
            <span className="text-[11px] font-semibold text-amber-700">{t('Unsaved changes')}</span>
          )}
          <button
            onClick={load}
            disabled={isSaving || !dirty}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {t('Revert')}
          </button>
          <button
            onClick={save}
            disabled={isSaving || !dirty}
            className="px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-40"
          >
            {isSaving ? t('Saving…') : t('Save roster ({count})', { count: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
};
