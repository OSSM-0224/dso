import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { BracketView } from '../../components/bracket/BracketView.tsx';
import { api } from '@/lib/api.ts';
import { MatchDoc, TeamDoc, TournamentDoc } from '@/shared/types.ts';
import { PublicMatchLiveScore } from '@/features/scoring/LiveScorePanel.tsx';

interface PublicTournamentData {
  tournament: TournamentDoc;
  teams: TeamDoc[];
  matches: MatchDoc[];
}

interface PublicTournamentPageProps {
  tournamentId: string;
  onBack: () => void;
  /** Pre-rendered sanitized payload (server component). When provided no
   * client fetch happens — identical markup, instant paint. */
  initialData?: PublicTournamentData | null;
}

export const PublicTournamentPage: React.FC<PublicTournamentPageProps> = ({
  tournamentId,
  onBack,
  initialData = null,
}) => {
  const [tournament, setTournament] = useState<TournamentDoc | null>(initialData?.tournament ?? null);
  const [matches, setMatches] = useState<MatchDoc[]>(initialData?.matches ?? []);
  const [teams, setTeams] = useState<TeamDoc[]>(initialData?.teams ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    loadPublicData();
  }, [tournamentId, initialData]);

  const loadPublicData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.public.getTournament(tournamentId);
      setTournament(res.tournament);
      setMatches(res.matches);
      setTeams(res.teams);
    } catch (err: any) {
      setError(err.message || 'Failed to load public bracket');
    } finally {
      setIsLoading(false);
    }
  };

  // Matches with an active scorer session — each card polls its own score.
  const liveMatches = useMemo(
    () => matches.filter((m) => m.status === 'live' && !m.isBye),
    [matches],
  );

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-16 px-4 text-center">
        <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-3" />
        <div className="text-xs text-slate-500">Loading public tournament bracket...</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 mb-4">
          {error || 'Tournament not found'}
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          ← Return to DSO Portal
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Public Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>District Sports Office (DSO) Navi Mumbai</span>
            <span>·</span>
            <span>Official Fixture Draw</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {tournament.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 mt-1">
            <span className="font-semibold text-indigo-700 uppercase">
              {tournament.sport}
            </span>
            <span>·</span>
            <span>{tournament.ageGroup}</span>
            <span>·</span>
            <span className="capitalize">{tournament.gender}</span>
            <span>·</span>
            <span>Year {tournament.year}</span>
            <span>·</span>
            <span className="text-emerald-700 font-medium">Status: {tournament.status}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
          >
            <Icon name="print" size="sm" className="mr-1" />Print / Save PDF
          </button>
          <button
            onClick={onBack}
            className="px-3.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            DSO Admin Portal
          </button>
        </div>
      </div>

      {/* Champion Announcement */}
      {tournament.status === 'completed' && tournament.winnerName && (
        <div className="bg-amber-500 text-white rounded-xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-100">
              Championship Winner
            </div>
            <div className="text-lg sm:text-xl font-extrabold tracking-tight break-words">
              <Icon name="trophy" size="sm" className="mr-1" />{tournament.winnerName}
            </div>
          </div>
          <span className="shrink-0 text-xs bg-amber-600/50 px-3 py-1 rounded font-mono font-medium">
            Champion
          </span>
        </div>
      )}

      {/* LIVE NOW strip — one polling card per live match */}
      {liveMatches.length > 0 && (
        <div className="rounded-2xl border border-red-200/70 bg-red-50/60 p-4 sm:p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Live now · {liveMatches.length}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {liveMatches.map((m) => (
              <PublicMatchLiveScore
                key={m.id}
                matchId={m.id}
                title={
                  m.roundName
                    ? `Match #${m.matchNumber} · ${m.roundName}`
                    : `Match #${m.matchNumber}`
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Read-Only Bracket */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="text-xs text-slate-500 mb-2">
          Public Read-Only Bracket · Live match results and progression
        </div>
        <BracketView
          matches={matches}
          strongTeamIds={tournament.strongTeams}
          championTeamIds={tournament.winner ? [tournament.winner] : []}
          isInteractive={false}
          canWrite={false}
        />
      </div>
    </div>
  );
};
