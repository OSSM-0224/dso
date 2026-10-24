import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
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
          {error}
        </div>
      )}

      {/* Bracket Math & Format Preview Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Play-In Bracket Geometry Preview
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">Total Enrolled</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {N}
            </div>
            <span className="text-[10px] text-slate-400">Teams</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">Next Power-of-2</span>
            <div className="text-xl font-bold font-mono text-indigo-600 tabular-nums">
              {P}
            </div>
            <span className="text-[10px] text-slate-400">Bracket Slots</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">Round 1 Byes</span>
            <div className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
              {byes}
            </div>
            <span className="text-[10px] text-slate-400">P - N Byes</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500">Round 1 Matches</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {playInMatches}
            </div>
            <span className="text-[10px] text-slate-400">N - P/2 Play-Ins</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-500">Round 2 Teams</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {r2Teams}
            </div>
            <span className="text-[10px] text-slate-400">P/2 Teams</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strong Teams Multi-Select */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">
                Pick Strong Teams
              </h3>
              <span className="text-xs font-mono text-indigo-600">
                {selectedStrong.length} selected
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Organizer selects top contending teams (e.g. NHPS, MNR, BVPT). The engine seeds them into separate quarters so they only meet in the semifinals or final, and grants them byes after champions.
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
                        {team.schoolName} · {team.medium} Medium
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
                Auto-Detected Recent Champions
              </h3>
              <span className="text-xs text-amber-600 font-semibold">
                Lookback: {tournament.championLookbackYears || 3} Years
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Rule 1 & 2: System scans the database for winners of completed {tournament.sport} {tournament.ageGroup} {tournament.gender} tournaments in the past {tournament.championLookbackYears || 3} years ({tournament.year - (tournament.championLookbackYears || 3)}–{tournament.year - 1}). These teams receive highest priority for Round 1 byes!
            </p>

            {recentChampions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No past champions detected for {tournament.sport} {tournament.ageGroup} {tournament.gender} within {tournament.championLookbackYears || 3} years.
                <div className="mt-1 text-[11px] text-slate-500">
                  (You can record past tournament results in the Past Champions tab)
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
                        <Icon name=`"trophy`" size=`"sm`" />
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
          Applied Engine Rules & Priority Hierarchy
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">1.</span>
            <span><strong>Same School Separation:</strong> Teams from the same school with different mediums (Marathi vs English) will never face each other in Round 1 (Hard Constraint).</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">2.</span>
            <span><strong>Strong Teams Quarters:</strong> Placed via standard bracket seeding across different quarters. They cannot meet until the semifinals or final.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">3.</span>
            <span><strong>Champions Round 1 Bye:</strong> Auto-detected recent champions receive priority 1 for first-round byes and skip Round 1.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">4.</span>
            <span><strong>Quarter Bye Balance:</strong> Byes are evenly distributed across all 4 quarters (no two quarters differ by more than 1 bye).</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">5.</span>
            <span><strong>Play-In Progression:</strong> All rounds (R1 to Final) are generated up front with auto-advancing nextMatch linkages.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-600 shrink-0">6.</span>
            <span><strong>Deterministic Reproducibility:</strong> Remaining teams are shuffled using a seeded PRNG for exact audit reproducibility.</span>
          </div>
        </div>
      </div>

      {/* Enrollment Lock Gating Banner */}
      {!tournament.isEnrollmentLocked && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <div>
              <span className="font-bold">Fixture Generation Blocked:</span> Team enrollment is currently open. You must lock enrollment before generating the tournament draw.
            </div>
          </div>
          <span className="text-[11px] text-amber-700 font-medium">
            (Go to &quot;Enrolled Teams&quot; tab to lock)
          </span>
        </div>
      )}

      {/* Actions Strip */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-100 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Optional Random Seed:
          </label>
          <input
            type="number"
            placeholder="Auto-random"
            value={customSeed}
            onChange={(e) => setCustomSeed(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2.5 py-1.5 w-32 bg-white font-mono"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading || !canWrite || !tournament.isEnrollmentLocked || enrolledTeams.length < 4}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-50 shadow-sm whitespace-nowrap"
          title={!tournament.isEnrollmentLocked ? 'Lock enrollment first to generate fixtures' : undefined}
        >
          {isLoading
            ? 'Generating Fixtures...'
            : !tournament.isEnrollmentLocked
            ? '🔒 Lock Enrollment to Generate'
            : enrolledTeams.length < 4
            ? 'At least 4 teams required'
            : 'Generate Kho-Kho Fixture'}
        </button>
      </div>
    </div>
  );
};
