import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
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
  const [scheduledAt, setScheduledAt] = useState<string>(
    match.scheduledAt ? new Date(match.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [venue, setVenue] = useState<string>(
    match.venue || 'DSO Complex, Court 1, Navi Mumbai'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Schedule Match
            </h3>
            <p className="text-xs text-slate-500">
              Match #{match.matchNumber} · {match.roundName}
            </p>
          </div>
          <button aria-label="Close"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
          >
            <Icon name="xmark" size="sm" align-middle />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date & Start Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-md p-2 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Venue / Court Name
            </label>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Navi Mumbai DSO Sports Complex, Court 2"
              className="w-full text-xs border border-slate-200 rounded-md p-2"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
