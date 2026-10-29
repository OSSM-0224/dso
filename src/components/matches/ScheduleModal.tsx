'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { MatchDoc } from '@/shared/types.ts';

interface ScheduleModalProps {
  match: MatchDoc;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (schedule: { scheduledAt?: string | null; venue?: string | null }) => Promise<void>;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  match,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const { t } = useI18n();
  const [scheduledAt, setScheduledAt] = useState<string>(
    match.scheduledAt ? new Date(match.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [venue, setVenue] = useState<string>(
    match.venue || 'DSO Complex, Court 1, Navi Mumbai'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock background scroll behind the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        venue: venue.trim() || null,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update schedule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-full overflow-y-auto flex flex-col border border-slate-200">
        <div className="flex shrink-0 items-center justify-between p-4 sm:p-6 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
              {t("Schedule Match")}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {t("Match #{number} · {round}", {
                number: match.matchNumber,
                round: match.roundName,
              })}
            </p>
          </div>
          <button aria-label={t("Close")}
            onClick={onClose}
            className="shrink-0 -mr-1 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>

        <div className="p-4 sm:p-6 pt-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              {t(error)}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t("Date & Start Time")}
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full text-base sm:text-xs border border-slate-200 rounded-md px-3 py-2.5 sm:p-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t("Venue / Court Name")}
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Navi Mumbai DSO Sports Complex, Court 2"
                className="w-full text-base sm:text-xs border border-slate-200 rounded-md px-3 py-2.5 sm:p-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? t('Saving...') : t('Save Schedule')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
