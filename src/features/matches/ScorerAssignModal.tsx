'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { api } from '@/lib/api.ts';
import { MatchDoc, ScorerCandidate } from '@/shared/types.ts';

/**
 * Phase 5 — assign (or replace) the scorer roster of one match from the admin
 * published-fixture list. Loads scorer candidate accounts (GET /api/admin/scorers)
 * and the current assignment (GET /api/scoring/matches/:id when the tournament
 * is already scoreable), then PUTs /api/admin/matches/:id/scorers.
 */
interface ScorerAssignModalProps {
  match: MatchDoc;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ScorerAssignModal: React.FC<ScorerAssignModalProps> = ({
  match,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<ScorerCandidate[] | null>(null);
  const [currentNames, setCurrentNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    setSavedMsg(null);

    const load = async () => {
      try {
        const res = await api.admin.scorers.list();
        if (cancelled) return;
        setCandidates(res);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load scorer accounts');
      }

      // Current assignment comes from the scoring console detail endpoint
      // (legacy alias resolves the match's tournament). It 403/404s for
      // draft tournaments — that's fine, assignment itself is still possible.
      try {
        const detail = await api.scoring.legacy.getMatch(match.id);
        if (cancelled) return;
        setCurrentNames(detail.scorerNames || []);
        setSelected(new Set(detail.scorerIds || []));
      } catch {
        if (!cancelled) {
          setCurrentNames([]);
          setSelected(new Set());
          setNotice(
            'Current assignment could not be loaded (tournament may not be published yet). Saving will replace whatever roster exists.'
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, match.id]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const res = await api.admin.matches.setScorers(match.id, Array.from(selected));
      setSavedMsg(
        res.scorerNames.length > 0
          ? t('Saved. Scorers: {names}', { names: res.scorerNames.join(', ') })
          : 'Saved. No scorers assigned — admins and organizers can still score this match from the console.'
      );
      onSaved();
      setTimeout(() => setSavedMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save scorer assignment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-full overflow-y-auto flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between p-4 sm:p-6 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{t("Assign Scorers")}</h3>
            <p className="text-xs text-slate-500 truncate">
              {t("Match #{number} · {round} · {teamA} vs {teamB}", {
                number: match.matchNumber,
                round: match.roundName,
                teamA: match.teamA?.name || t('TBD'),
                teamB: match.teamB?.name || t('TBD'),
              })}
            </p>
          </div>
          <button
            aria-label={t("Close")}
            onClick={onClose}
            className="shrink-0 -mr-1 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>

        <div className="p-4 sm:p-6 pt-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              {t(error)}
            </div>
          )}
          {savedMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200">
              {t(savedMsg)}
            </div>
          )}
          {notice && (
            <div className="p-3 bg-amber-50 text-amber-800 text-[11px] rounded-lg border border-amber-200">
              {t(notice)}
            </div>
          )}

          <p className="text-[11px] text-slate-500 leading-snug">
            {t("Assigned scorers may clock in and score")}{' '}
            <strong>{t("only this match")}</strong> {t("from")}{' '}
            <span className="font-mono text-[10px] bg-slate-100 px-1 rounded">/score</span>.{' '}
            {t("Admins and organizers can score every match without assignment.")}
          </p>

          {/* Current roster */}
          {currentNames.length > 0 && !isLoading && (
            <div className="text-[11px] text-slate-600">
              {t("Currently assigned:")}{' '}
              <span className="font-semibold">{currentNames.join(', ')}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-6 text-center text-xs text-slate-500">{t("Loading scorer accounts…")}</div>
          ) : candidates && candidates.length > 0 ? (
            <div className="space-y-2">
              {candidates.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="shrink-0 text-indigo-600 accent-indigo-600"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {c.name}
                        </div>
                        {c.identifier && (
                          <div className="text-[11px] text-slate-500 truncate font-mono">
                            {c.identifier}
                          </div>
                        )}
                      </div>
                    </div>
                    {checked && (
                      <span className="shrink-0 text-[10px] font-bold uppercase text-indigo-700">
                        {t("Assigned")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            !error && (
              <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                {t("No active scorer accounts exist yet.")}
                <div className="mt-1 text-[10px] text-slate-400">
                  {t("Developers: run")} <span className="font-mono">npm run seed:temp-logins</span>{' '}
                  {t("to create demo scorers (SCORER / SCORER2).")}
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 p-4 flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isLoading}
            className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md disabled:opacity-50"
          >
            {t("Close")}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !candidates}
            className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? t('Saving…') : t('Save Scorer Assignment')}
          </button>
        </div>
      </div>
    </div>
  );
};
