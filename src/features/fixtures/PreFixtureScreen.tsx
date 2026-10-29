'use client';
import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface PreFixtureScreenProps {
  tournament: TournamentDoc;
  enrolledTeams: TeamDoc[];
  onFixturesGenerated: () => void;
  canWrite: boolean;
}

export const PreFixtureScreen: React.FC<PreFixtureScreenProps> = ({
  tournament,
  enrolledTeams,
  onFixturesGenerated,
  canWrite,
}) => {
  const { t } = useI18n();
  const [selectedStrong, setSelectedStrong] = useState<string[]>(tournament.strongTeams || []);
  const [recentChampions, setRecentChampions] = useState<
    Array<{
      teamId: string;
      teamName: string;
      schoolName?: string;
      year: number;
      tournamentName: string;
    }>
  >([]);
  const [customSeed, setCustomSeed] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingStrong, setIsSavingStrong] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecentChampions();
  }, [tournament.id]);

  const loadRecentChampions = async () => {
    try {
      const champions = await api.tournaments.getRecentChampions(tournament.id);
      setRecentChampions(champions);
    } catch (err: any) {
      console.error('Failed to load champions:', err);
    }
  };

  const toggleStrongTeam = async (teamId: string) => {
    if (!canWrite) return;
    const next = selectedStrong.includes(teamId)
      ? selectedStrong.filter((id) => id !== teamId)
      : [...selectedStrong, teamId];

    setSelectedStrong(next);
    try {
      setIsSavingStrong(true);
      await api.tournaments.updateStrongTeams(tournament.id, next);
    } catch (err: any) {
      setError(err.message || 'Failed to update strong teams');
    } finally {
      setIsSavingStrong(false);
    }
  };

  const handleGenerate = async () => {
    if (!canWrite) return;
    try {
      setIsLoading(true);
      setError(null);
      const seedNum = customSeed.trim() ? parseInt(customSeed, 10) : undefined;
      await api.tournaments.generateFixtures(tournament.id, seedNum);
      onFixturesGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to generate fixtures');
    } finally {
      setIsLoading(false);
    }
  };

  // Bracket sizing calculation
  const N = enrolledTeams.length;
  let P = 1;
  while (P < Math.max(2, N)) {
    P *= 2;
  }
  const byes = P - N;
  const playInMatches = N - P / 2;
  const r2Teams = P / 2;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {t(error)}
        </div>
      )}

      {/* Bracket Math & Format Preview Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          {t("Play-In Bracket Geometry Preview")}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">{t("Total Enrolled")}</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {N}
            </div>
            <span className="text-[10px] text-slate-400">{t("Teams")}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">{t("Next Power-of-2")}</span>
            <div className="text-xl font-bold font-mono text-indigo-600 tabular-nums">
              {P}
            </div>
            <span className="text-[10px] text-slate-400">{t("Bracket Slots")}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">{t("Round 1 Byes")}</span>
            <div className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
              {byes}
            </div>
            <span className="text-[10px] text-slate-400">{t("P - N Byes")}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">{t("Round 1 Matches")}</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {playInMatches}
            </div>
            <span className="text-[10px] text-slate-400">{t("N - P/2 Play-Ins")}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-500">{t("Round 2 Teams")}</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {r2Teams}
            </div>
            <span className="text-[10px] text-slate-400">{t("P/2 Teams")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strong Teams Multi-Select */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("Pick Strong Teams")}
              </h3>
              <span className="text-xs font-mono text-indigo-600">
                {t("{count} selected", { count: selectedStrong.length })}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {t("Organizer selects top contending teams (e.g. NHPS, MNR, BVPT). The engine seeds them into separate quarters so they only meet in the semifinals or final, and grants them byes after champions.")}
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {enrolledTeams.map((team) => {
                const isSelected = selectedStrong.includes(team.id);
                return (
                  <div
                    key={team.id}
                    onClick={() => toggleStrongTeam(team.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 font-medium'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{team.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {team.schoolName} · {team.medium} {t("Medium")}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Auto-Detected Recent Champions Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("Auto-Detected Recent Champions")}
              </h3>
              <span className="text-xs text-amber-600 font-semibold">
                {t("Lookback: {years} Years", { years: tournament.championLookbackYears || 3 })}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {t("Rule 1 & 2: System scans the database for winners of completed {sport} {ageGroup} {gender} tournaments in the past {years} years ({from}–{to}). These teams receive highest priority for Round 1 byes!", {
                sport: tournament.sport,
                ageGroup: tournament.ageGroup,
                gender: tournament.gender,
                years: tournament.championLookbackYears || 3,
                from: tournament.year - (tournament.championLookbackYears || 3),
                to: tournament.year - 1,
              })}
            </p>

            {recentChampions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                {t("No past champions detected for {sport} {ageGroup} {gender} within {years} years.", {
                  sport: tournament.sport,
                  ageGroup: tournament.ageGroup,
                  gender: tournament.gender,
                  years: tournament.championLookbackYears || 3,
                })}
                <div className="mt-1 text-[11px] text-slate-500">
                  {t("(You can record past tournament results in the Past Champions tab)")}
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {recentChampions.map((champ, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                        <Icon name="trophy" size="sm" />
                        <span>{champ.teamName}</span>
                      </div>
                      <div className="text-[11px] text-amber-800">
                        {champ.schoolName} · {champ.tournamentName}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                      {champ.year}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Applied Rules Summary Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          {t("Applied Engine Rules & Priority Hierarchy")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">1.</span>
            <span><strong>{t("Same School Separation:")}</strong> {t("Teams from the same school with different mediums (Marathi vs English) will never face each other in Round 1 (Hard Constraint).")}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">2.</span>
            <span><strong>{t("Strong Teams Quarters:")}</strong> {t("Placed via standard bracket seeding across different quarters. They cannot meet until the semifinals or final.")}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">3.</span>
            <span><strong>{t("Champions Round 1 Bye:")}</strong> {t("Auto-detected recent champions receive priority 1 for first-round byes and skip Round 1.")}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">4.</span>
            <span><strong>{t("Quarter Bye Balance:")}</strong> {t("Byes are evenly distributed across all 4 quarters (no two quarters differ by more than 1 bye).")}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">5.</span>
            <span><strong>{t("Play-In Progression:")}</strong> {t("All rounds (R1 to Final) are generated up front with auto-advancing nextMatch linkages.")}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">6.</span>
            <span><strong>{t("Deterministic Reproducibility:")}</strong> {t("Remaining teams are shuffled using a seeded PRNG for exact audit reproducibility.")}</span>
          </div>
        </div>
      </div>

      {/* Enrollment Lock Gating Banner */}
      {!tournament.isEnrollmentLocked && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <div>
              <span className="font-bold">{t("Fixture Generation Blocked:")}</span> {t("Team enrollment is currently open. You must lock enrollment before generating the tournament draw.")}
            </div>
          </div>
          <span className="text-[11px] text-amber-700 font-medium">
            {t('(Go to "Enrolled Teams" tab to lock)')}
          </span>
        </div>
      )}

      {/* Actions Strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-100 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            {t("Optional Random Seed:")}
          </label>
          <input
            type="number"
            placeholder={t("Auto-random")}
            value={customSeed}
            onChange={(e) => setCustomSeed(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2.5 py-1.5 w-32 bg-white font-mono"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading || !canWrite || !tournament.isEnrollmentLocked || enrolledTeams.length < 4}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-50 shadow-sm whitespace-nowrap"
          title={!tournament.isEnrollmentLocked ? t('Lock enrollment first to generate fixtures') : undefined}
        >
          {isLoading
            ? t('Generating Fixtures...')
            : !tournament.isEnrollmentLocked
            ? t('🔒 Lock Enrollment to Generate')
            : enrolledTeams.length < 4
            ? t('At least 4 teams required')
            : t('Generate Kho-Kho Fixture')}
        </button>
      </div>
    </div>
  );
};
