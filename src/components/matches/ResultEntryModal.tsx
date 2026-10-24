import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { MatchDoc } from '@/shared/types.ts';

interface ResultEntryModalProps {
  match: MatchDoc;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (result: {
    winnerTeamId: string;
    score?: {
      teamAScore?: number | string;
      teamBScore?: number | string;
      details?: string;
    };
  }) => Promise<void>;
}

export const ResultEntryModal: React.FC<ResultEntryModalProps> = ({
  match,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>(
    match.winner?.id || match.teamA?.id || ''
  );
  const [teamAScore, setTeamAScore] = useState<string>(
    match.score?.teamAScore !== undefined ? String(match.score.teamAScore) : ''
  );
  const [teamBScore, setTeamBScore] = useState<string>(
    match.score?.teamBScore !== undefined ? String(match.score.teamBScore) : ''
  );
  const [details, setDetails] = useState<string>(match.score?.details || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWinnerId) {
      setError('Please select the winning team.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        winnerTeamId: selectedWinnerId,
        score: {
          teamAScore: teamAScore !== '' ? Number(teamAScore) || teamAScore : undefined,
          teamBScore: teamBScore !== '' ? Number(teamBScore) || teamBScore : undefined,
          details: details.trim() || undefined,
        },
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record match result');
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
              Record Match Result
            </h3>
            <p className="text-xs text-slate-500">
              Match #{match.matchNumber} · {match.roundName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Select Winner (Auto-Advances to next round)
            </label>
            <div className="space-y-2">
              {match.teamA && (
                <label
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedWinnerId === match.teamA.id
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="winner"
                      value={match.teamA.id}
                      checked={selectedWinnerId === match.teamA.id}
                      onChange={(e) => setSelectedWinnerId(e.target.value)}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        {match.teamA.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {match.teamA.schoolName} ({match.teamA.medium})
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600">Team A</span>
                </label>
              )}

              {match.teamB && (
                <label
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedWinnerId === match.teamB.id
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="winner"
                      value={match.teamB.id}
                      checked={selectedWinnerId === match.teamB.id}
                      onChange={(e) => setSelectedWinnerId(e.target.value)}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        {match.teamB.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {match.teamB.schoolName} ({match.teamB.medium})
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600">Team B</span>
                </label>
              )}
            </div>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {match.teamA?.name || 'Team A'} Score / Points
              </label>
              <input
                type="number"
                value={teamAScore}
                onChange={(e) => setTeamAScore(e.target.value)}
                placeholder="e.g. 14"
                className="w-full text-xs border border-slate-200 rounded-md p-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {match.teamB?.name || 'Team B'} Score / Points
              </label>
              <input
                type="number"
                value={teamBScore}
                onChange={(e) => setTeamBScore(e.target.value)}
                placeholder="e.g. 10"
                className="w-full text-xs border border-slate-200 rounded-md p-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Match Summary / Kho-Kho Innings Note (Optional)
            </label>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. Won by 4 points and 2 minutes remaining"
              className="w-full text-xs border border-slate-200 rounded-md p-2"
            />
          </div>

          {match.nextMatchId === null && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
              <Icon name=`"trophy`" size=`"sm`" className=`"mr-1 inline`" /><strong>Final Match:</strong> Submitting will mark this tournament as Completed, declare the champion, and store them for future lookback history!
            </div>
          )}

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
              {isSubmitting ? 'Saving...' : 'Confirm Winner & Advance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
