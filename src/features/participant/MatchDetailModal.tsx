import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';

interface MatchDetailModalProps {
  matchData: any;
  isOpen: boolean;
  onClose: () => void;
  onAcknowledgeSuccess?: () => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  matchData,
  isOpen,
  onClose,
  onAcknowledgeSuccess,
}) => {
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState<boolean>(matchData?.isAcknowledged || false);
  const [ackTimestamp, setAckTimestamp] = useState<string | null>(matchData?.acknowledgedAt || null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !matchData) return null;

  const match = matchData.match || matchData;
  const tournament = matchData.tournament || {};
  const myTeam = matchData.myTeam;
  const opponentDisplay = matchData.opponentDisplay || {
    isDecided: true,
    label: matchData.opponentTeam?.name || 'Opponent',
    schoolName: matchData.opponentTeam?.schoolName || 'Opponent School',
  };

  const handleAcknowledge = async () => {
    try {
      setIsAcknowledging(true);
      setError(null);
      const res = await api.my.acknowledgeMatch(match.id);
      setIsAcknowledged(true);
      setAckTimestamp(res.data.acknowledgedAt);
      if (onAcknowledgeSuccess) onAcknowledgeSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to acknowledge match');
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleDownloadIcs = () => {
    const url = api.my.getCalendarDownloadUrl(match.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${match.id}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = match.scheduledAt
    ? new Date(match.scheduledAt).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date to be announced';

  const formattedTime = match.scheduledAt
    ? new Date(match.scheduledAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Time TBD';

  const venueName = match.venue || 'DSO Sports Complex, Nerul, Navi Mumbai';
  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    venueName + ' Navi Mumbai'
  )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs print:p-0 print:bg-white"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] print:max-h-none print:shadow-none print:border-none">
        {/* Header */}
        <div className="shrink-0 bg-slate-900 text-white p-4 sm:p-6 relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 truncate max-w-full">
                {tournament.name || 'DSO Tournament'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300">
                Match #{match.matchNumber} · {match.roundName}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white mt-1">
              Official Match Schedule
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 -mr-1 p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors print:hidden"
            title="Close"
          >
            <Icon name="xmark" size="lg" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Matchup Banner */}
          <div className="p-5 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 border border-indigo-100/80 rounded-2xl">
            <div className="grid grid-cols-1 md:grid-cols-7 items-center gap-4 text-center md:text-left min-w-0">
              {/* My Team */}
              <div className="md:col-span-3 min-w-0">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white mb-1.5">
                  Your School Team
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {myTeam?.name || 'Your Team'}
                </h3>
                <p className="text-xs text-slate-500">
                  {myTeam?.medium ? `${myTeam.medium} Medium` : ''} · {myTeam?.ageGroup || tournament.ageGroup} ({myTeam?.gender || tournament.gender})
                </p>
              </div>

              {/* VS Divider */}
              <div className="md:col-span-1 flex flex-col items-center justify-center">
                <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600">
                  VS
                </span>
              </div>

              {/* Opponent */}
              <div className="md:col-span-3 md:text-right min-w-0">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 mb-1.5">
                  Opponent
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {opponentDisplay.label}
                </h3>
                <p className="text-xs text-slate-500">
                  {opponentDisplay.isDecided
                    ? opponentDisplay.schoolName
                    : opponentDisplay.dependencyText || 'Awaiting completion of earlier round'}
                </p>
              </div>
            </div>

            {/* If Bye advancement */}
            {matchData.byeAdvancementNote && (
              <div className="mt-4 pt-3 border-t border-indigo-100/60 flex items-center gap-2 text-xs text-indigo-700 font-medium">
                <Icon name="shield" size="md" className="text-indigo-600" />
                <span>{matchData.byeAdvancementNote}</span>
              </div>
            )}
          </div>

          {/* Schedule & Location Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date & Time */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-2">
                <Icon name="calendar" size="md" className="text-indigo-600" />
                <span>Kick-off Date & Time</span>
              </div>
              <p className="text-sm font-bold text-slate-900">{formattedDate}</p>
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold mt-1">
                <Icon name="clock" size="sm" />
                <span>{formattedTime}</span>
              </div>
            </div>

            {/* Venue & Directions */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-2">
                <Icon name="location" size="md" className="text-emerald-600" />
                <span>Venue & Directions</span>
              </div>
              <p className="text-sm font-bold text-slate-900 leading-snug">{venueName}</p>
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold mt-2 underline"
              >
                <span>Open in Google Maps</span>
                <Icon name="external" size="sm" />
              </a>
            </div>
          </div>

          {/* Result if completed */}
          {match.status === 'completed' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Match Completed
                  </span>
                  <p className="text-sm font-semibold text-emerald-950 mt-0.5">
                    Winner: <span className="font-bold">{match.winner?.name || 'Undecided'}</span>
                  </p>
                </div>
                {match.score && (
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-900">
                      {match.score.teamAScore ?? '-'} - {match.score.teamBScore ?? '-'}
                    </span>
                    {match.score.details && (
                      <p className="text-xs text-emerald-700">{match.score.details}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Acknowledgement Status Section */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Icon
                name="circleCheck"
                size="lg"
                className={`${
                  isAcknowledged ? 'text-emerald-600' : 'text-slate-300'
                }`}
              />
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {isAcknowledged
                    ? 'Schedule Acknowledged by School'
                    : 'Awaiting School Confirmation'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isAcknowledged && ackTimestamp
                    ? `Confirmed on ${new Date(ackTimestamp).toLocaleDateString()} at ${new Date(
                        ackTimestamp
                      ).toLocaleTimeString()}`
                    : 'Let tournament organizers know your school has seen this fixture.'}
                </p>
              </div>
            </div>

            {!isAcknowledged && (
              <button
                onClick={handleAcknowledge}
                disabled={isAcknowledging}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs hover:shadow transition-all disabled:bg-emerald-300 shrink-0 print:hidden"
              >
                {isAcknowledging ? 'Confirming...' : 'Confirm / Acknowledge'}
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadIcs}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
            >
              <Icon name="calendarPlus" size="sm" className="text-indigo-600" />
              <span>Add to Calendar (.ics)</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
            >
              <Icon name="print" size="sm" className="text-slate-600" />
              <span>Print Match Pass</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
