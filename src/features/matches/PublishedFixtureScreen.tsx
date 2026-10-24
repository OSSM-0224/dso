import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { BracketView } from '../../components/bracket/BracketView.tsx';
import { ResultEntryModal } from '../../components/matches/ResultEntryModal.tsx';
import { ScheduleModal } from '../../components/matches/ScheduleModal.tsx';
import { api } from '@/lib/api.ts';
import { MatchDoc, TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface PublishedFixtureScreenProps {
  tournament: TournamentDoc;
  matches: MatchDoc[];
  enrolledTeams: TeamDoc[];
  onRefresh: () => void;
  canWrite: boolean;
  onOpenPublicView: () => void;
}

export const PublishedFixtureScreen: React.FC<PublishedFixtureScreenProps> = ({
  tournament,
  matches,
  enrolledTeams,
  onRefresh,
  canWrite,
  onOpenPublicView,
}) => {
  const [viewMode, setViewMode] = useState<'bracket' | 'list'>('bracket');
  const [selectedMatchForResult, setSelectedMatchForResult] = useState<MatchDoc | null>(null);
  const [selectedMatchForSchedule, setSelectedMatchForSchedule] = useState<MatchDoc | null>(null);
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<number | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRecordResult = async (result: {
    winnerTeamId: string;
    score?: {
      teamAScore?: number | string;
      teamBScore?: number | string;
      details?: string;
    };
  }) => {
    if (!selectedMatchForResult) return;
    try {
      const res = await api.matches.recordResult(selectedMatchForResult.id, result);
      if (res.tournamentCompleted) {
        setSuccessMsg(
          `Championship Final Completed: "${res.match.winner?.name}" is crowned Champion. Tournament recorded as completed.`
        );
      } else {
        setSuccessMsg(`Winner "${res.match.winner?.name}" advanced to the next round.`);
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record result');
    }
  };

  const handleUpdateSchedule = async (schedule: {
    scheduledAt?: string | null;
    venue?: string | null;
  }) => {
    if (!selectedMatchForSchedule) return;
    try {
      await api.matches.updateSchedule(selectedMatchForSchedule.id, schedule);
      setSuccessMsg('Match schedule updated.');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update schedule');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const maxRound = Math.max(...matches.map((m) => m.round), 1);
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const filteredMatches =
    selectedRoundFilter === 'all'
      ? matches
      : matches.filter((m) => m.round === selectedRoundFilter);

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold ml-4">aria-label="Dismiss message"><Icon name="xmark" size="sm" /></button>
        </div>
      )}

      {/* Champion Banner if completed */}
      {tournament.status === 'completed' && tournament.winnerName && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-white rounded-xl p-6 shadow-md flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold tracking-wider text-amber-100">
              Tournament Champion Crowned
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight">
              <Icon name=`"trophy`" size=`"sm`" className=`"mr-1`" />{tournament.winnerName}
            </h2>
            <p className="text-xs text-amber-100">
              Completed {tournament.sport.toUpperCase()} {tournament.ageGroup} {tournament.gender} Championship ({tournament.year}). This team is now saved as a recent champion for upcoming seasons.
            </p>
          </div>
        </div>
      )}

      {/* Controls & Share Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setViewMode('bracket')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'bracket'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bracket View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Match Schedule List
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPublicView}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors shadow-sm flex items-center gap-1.5"
            title="Open public read-only bracket"
          >
            <span>🔗</span>
            <span>Public Share Link</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors shadow-sm flex items-center gap-1.5"
            title="Export / Print Bracket to PDF"
          >
            <Icon name=`"print`" size=`"sm`" />
            <span>Export to PDF / Print</span>
          </button>
        </div>
      </div>

      {/* View Mode: Bracket View */}
      {viewMode === 'bracket' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <BracketView
            matches={matches}
            strongTeamIds={tournament.strongTeams}
            championTeamIds={tournament.winner ? [tournament.winner] : []}
            onEnterResult={(m) => setSelectedMatchForResult(m)}
            onEditSchedule={(m) => setSelectedMatchForSchedule(m)}
            isInteractive={true}
            canWrite={canWrite}
          />
        </div>
      )}

      {/* View Mode: Match Schedule List */}
      {viewMode === 'list' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Round-wise Match List & Results
            </h3>

            {/* Round Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter Round:</span>
              <select
                value={selectedRoundFilter}
                onChange={(e) =>
                  setSelectedRoundFilter(
                    e.target.value === 'all' ? 'all' : Number(e.target.value)
                  )
                }
                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
              >
                <option value="all">All Rounds</option>
                {rounds.map((r) => (
                  <option key={r} value={r}>
                    Round {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredMatches.map((m) => (
              <div
                key={m.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-400 w-10">
                    M#{m.matchNumber}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <span>{m.roundName}</span>
                      {m.status === 'completed' && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                          Completed
                        </span>
                      )}
                      {m.isBye && (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          BYE
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {m.teamA?.name || 'TBD'} <span className="text-slate-400">vs</span>{' '}
                      {m.isBye ? 'BYE' : m.teamB?.name || 'TBD'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Schedule */}
                  <div className="text-right text-[11px] text-slate-500">
                    {m.scheduledAt ? (
                      <div>{new Date(m.scheduledAt).toLocaleString()}</div>
                    ) : (
                      <div>Schedule: TBD</div>
                    )}
                    {m.venue && <div className="text-slate-400">{m.venue}</div>}
                  </div>

                  {/* Score or Action */}
                  <div className="flex items-center gap-2 shrink-0">
                    {m.score ? (
                      <span className="font-mono font-bold px-2.5 py-1 bg-slate-50 border border-slate-200 rounded tabular-nums">
                        {m.score.teamAScore ?? '-'} - {m.score.teamBScore ?? '-'}
                      </span>
                    ) : null}

                    {canWrite && !m.isBye && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedMatchForSchedule(m)}
                          className="px-2.5 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                        >
                          Schedule
                        </button>
                        {m.status !== 'completed' && m.teamA && m.teamB && (
                          <button
                            onClick={() => setSelectedMatchForResult(m)}
                            className="px-2.5 py-1 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700"
                          >
                            Result
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result Entry Modal */}
      {selectedMatchForResult && (
        <ResultEntryModal
          match={selectedMatchForResult}
          isOpen={true}
          onClose={() => setSelectedMatchForResult(null)}
          onSubmit={handleRecordResult}
        />
      )}

      {/* Schedule Modal */}
      {selectedMatchForSchedule && (
        <ScheduleModal
          match={selectedMatchForSchedule}
          isOpen={true}
          onClose={() => setSelectedMatchForSchedule(null)}
          onSubmit={handleUpdateSchedule}
        />
      )}
    </div>
  );
};
