'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { FixtureSnapshotDoc, MatchDoc, TeamDoc, TournamentDoc } from '@/shared/types.ts';

// Each status/tab view is a self-contained heavy screen. Splitting them keeps
// only the loader in the initial bundle; the view streams in on demand.
const TabLoading = () => {
  const { t } = useI18n();
  return (
    <div className="py-16 text-center">
      <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
      <div className="text-xs text-slate-500">{t("Loading view...")}</div>
    </div>
  );
};

const PreFixtureScreen = dynamic(
  () => import('../fixtures/PreFixtureScreen.tsx').then((m) => m.PreFixtureScreen),
  { loading: () => <TabLoading /> }
);
const FixturePreviewScreen = dynamic(
  () => import('../fixtures/FixturePreviewScreen.tsx').then((m) => m.FixturePreviewScreen),
  { loading: () => <TabLoading /> }
);
const PublishedFixtureScreen = dynamic(
  () => import('../matches/PublishedFixtureScreen.tsx').then((m) => m.PublishedFixtureScreen),
  { loading: () => <TabLoading /> }
);
const AuditLogScreen = dynamic(
  () => import('../audit/AuditLogScreen.tsx').then((m) => m.AuditLogScreen),
  { loading: () => <TabLoading /> }
);
const TournamentTeamsTab = dynamic(
  () => import('./TournamentTeamsTab.tsx').then((m) => m.TournamentTeamsTab),
  { loading: () => <TabLoading /> }
);

interface TournamentDetailScreenProps {
  tournamentId: string;
  onBack: () => void;
  canWrite: boolean;
  onOpenPublicView: (id: string) => void;
}

export const TournamentDetailScreen: React.FC<TournamentDetailScreenProps> = ({
  tournamentId,
  onBack,
  canWrite,
  onOpenPublicView,
}) => {
  const { t } = useI18n();
  const [tournament, setTournament] = useState<TournamentDoc | null>(null);
  const [snapshot, setSnapshot] = useState<FixtureSnapshotDoc | null>(null);
  const [matches, setMatches] = useState<MatchDoc[]>([]);
  const [enrolledTeams, setEnrolledTeams] = useState<TeamDoc[]>([]);
  const [allTeams, setAllTeams] = useState<TeamDoc[]>([]);
  const [activeTab, setActiveTab] = useState<'fixtures' | 'teams' | 'audit'>('fixtures');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTournamentData();
  }, [tournamentId]);

  const loadTournamentData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [tData, mData, allTeamsList] = await Promise.all([
        api.tournaments.get(tournamentId),
        api.tournaments.getMatches(tournamentId),
        api.teams.list({ tournamentId }),
      ]);

      setTournament(tData);
      setSnapshot(tData.snapshot || null);
      setMatches(mData);
      setAllTeams(allTeamsList);

      const enrolled = allTeamsList.filter((team) => tData.teams.includes(team.id));
      setEnrolledTeams(enrolled);
    } catch (err: any) {
      setError(err.message || 'Failed to load tournament');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
        <div className="text-xs text-slate-500">{t("Loading tournament details...")}</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="p-6 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
        {t(error || 'Tournament not found')}
      </div>
    );
  }

  // Filter available teams matching sport category
  const matchingCategoryTeams = allTeams.filter(
    (t) => t.ageGroup === tournament.ageGroup && t.gender === tournament.gender
  );

  return (
    <div className="space-y-6">
      {/* Back and Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={onBack}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
            >
              {t("← Back to Tournaments")}
            </button>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-xs text-slate-500 font-mono min-w-0 max-w-full truncate">{t("ID: {id}", { id: tournament.id })}</span>
          </div>

          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 break-words">
            {tournament.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800 uppercase">{tournament.sport}</span>
            <span>·</span>
            <span className="font-medium text-slate-800">{tournament.ageGroup}</span>
            <span>·</span>
            <span className="capitalize font-medium text-slate-800">{tournament.gender}</span>
            <span>·</span>
            <span>{t("Year {year}", { year: tournament.year })}</span>
            <span>·</span>
            <span>{t("Lookback: {years} Yrs", { years: tournament.championLookbackYears || 3 })}</span>
            <span>·</span>
            <span
              className={`font-semibold capitalize px-2 py-0.5 rounded text-[11px] ${
                tournament.status === 'completed'
                  ? 'bg-amber-100 text-amber-900'
                  : tournament.status === 'published'
                  ? 'bg-emerald-100 text-emerald-800'
                  : tournament.status === 'fixtures-generated'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {t("Status: {status}", { status: tournament.status.replace('-', ' ') })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(tournament.status === 'published' || tournament.status === 'completed') && (
            <button
              onClick={() => onOpenPublicView(tournament.id)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>🔗</span>
              <span>{t("Public Share")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Feature Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:max-w-md overflow-x-auto">
        <button
          onClick={() => setActiveTab('fixtures')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'fixtures'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t("Fixtures & Bracket")}
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'teams'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t("Enrolled Teams ({count})", { count: enrolledTeams.length })}
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'audit'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t("Audit Log")}
        </button>
      </div>

      {/* TAB 1: FIXTURES */}
      {activeTab === 'fixtures' && (
        <>
          {tournament.status === 'draft' && (
            <PreFixtureScreen
              tournament={tournament}
              enrolledTeams={enrolledTeams}
              onFixturesGenerated={loadTournamentData}
              canWrite={canWrite}
            />
          )}

          {tournament.status === 'fixtures-generated' && (
            <FixturePreviewScreen
              tournament={tournament}
              matches={matches}
              snapshot={snapshot}
              enrolledTeams={enrolledTeams}
              onRefresh={loadTournamentData}
              canWrite={canWrite}
            />
          )}

          {(tournament.status === 'published' ||
            tournament.status === 'ongoing' ||
            tournament.status === 'completed') && (
            <PublishedFixtureScreen
              tournament={tournament}
              matches={matches}
              enrolledTeams={enrolledTeams}
              onRefresh={loadTournamentData}
              canWrite={canWrite}
              onOpenPublicView={() => onOpenPublicView(tournament.id)}
            />
          )}
        </>
      )}

      {/* TAB 2: ENROLLED TEAMS MANAGEMENT */}
      {activeTab === 'teams' && (
        <TournamentTeamsTab
          tournament={tournament}
          onTournamentUpdated={loadTournamentData}
          canWrite={canWrite}
        />
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && <AuditLogScreen tournamentId={tournament.id} />}
    </div>
  );
};
