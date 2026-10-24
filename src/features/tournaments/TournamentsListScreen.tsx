import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface TournamentsListScreenProps {
  onSelectTournament: (id: string) => void;
  canWrite: boolean;
}

export const TournamentsListScreen: React.FC<TournamentsListScreenProps> = ({
  onSelectTournament,
  canWrite,
}) => {
  const [tournaments, setTournaments] = useState<TournamentDoc[]>([]);
  const [allTeams, setAllTeams] = useState<TeamDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Tournament Form State
  const [name, setName] = useState('');
  const [sport, setSport] = useState('kho-kho');
  const [format, setFormat] = useState('single-elimination');
  const [ageGroup, setAgeGroup] = useState<'U-14' | 'U-17' | 'U-19'>('U-14');
  const [gender, setGender] = useState<'boys' | 'girls'>('boys');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [championLookbackYears, setChampionLookbackYears] = useState<number>(3);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [tList, teamList] = await Promise.all([
        api.tournaments.list(),
        api.teams.list(),
      ]);
      setTournaments(tList);
      setAllTeams(teamList);
    } catch (err: any) {
      setError(err.message || 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await api.tournaments.create({
        name: name.trim(),
        sport,
        format,
        ageGroup,
        gender,
        year: Number(year),
        championLookbackYears: Number(championLookbackYears),
        teams: selectedTeams,
      });

      setShowCreateModal(false);
      setName('');
      setSelectedTeams([]);
      await loadData();
      onSelectTournament(created.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter available teams matching current form ageGroup and gender
  const availableTeamsForForm = allTeams.filter(
    (t) => t.ageGroup === ageGroup && t.gender === gender
  );

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            DSO District Tournaments & Fixtures
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl mt-1">
            Official single-elimination tournament management for District Sports Office Navi Mumbai. Generate mathematically balanced play-in brackets with automatic champion detection, strong team separation, and cross-medium school conflict prevention.
          </p>
        </div>

        {canWrite && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm shrink-0 whitespace-nowrap"
          >
            + Create Tournament
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Tournaments Grid */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin h-7 w-7 border-3 border-indigo-600 border-t-transparent rounded-full mb-2" />
          <div className="text-xs text-slate-500">Loading tournaments...</div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm space-y-3">
          <div className="text-3xl"><Icon name=`"trophy`" size=`"xl`" /></div>
          <h3 className="text-base font-bold text-slate-900">
            No Tournaments Created Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Get started by creating your first tournament or registering teams in Teams & Schools.
          </p>
          {canWrite && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg shadow-sm hover:bg-indigo-700"
            >
              + Create Tournament
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tournaments.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectTournament(t.id)}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-indigo-700 uppercase">
                    {t.sport}
                  </span>
                  <span
                    className={`font-semibold capitalize px-2 py-0.5 rounded text-[10px] ${
                      t.status === 'completed'
                        ? 'bg-amber-100 text-amber-900'
                        : t.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'fixtures-generated'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t.status.replace('-', ' ')}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                  {t.name}
                </h3>

                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span>{t.ageGroup}</span>
                  <span>·</span>
                  <span className="capitalize">{t.gender}</span>
                  <span>·</span>
                  <span>Year {t.year}</span>
                </div>

                {t.winnerName && (
                  <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded p-2 flex items-center gap-1.5 font-medium">
                    <span className=`"inline-flex items-center gap-1.5`"><Icon name=`"trophy`" size=`"sm`" />Champion:</span>
                    <span className="truncate">{t.winnerName}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>{t.teams.length} Teams Enrolled</span>
                <span className="text-indigo-600 font-semibold">Open Draw →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateTournament}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Create New Tournament
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tournament Title
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navi Mumbai DSO Kho-Kho Championship 2026"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sport
                </label>
                <select
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="kho-kho">Kho-Kho</option>
                  <option value="kabaddi">Kabaddi (Modular plug-in)</option>
                  <option value="volleyball">Volleyball (Modular plug-in)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="single-elimination">Single Elimination (Play-In)</option>
                  <option value="round-robin">Round Robin (Modular plug-in)</option>
                  <option value="groups-knockout">Groups + Knockout (Modular)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Age Group
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as any)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="U-14">U-14</option>
                  <option value="U-17">U-17</option>
                  <option value="U-19">U-19</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Year
                </label>
                <input
                  type="number"
                  required
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Champion Lookback Years (Rule 1)
              </label>
              <select
                value={championLookbackYears}
                onChange={(e) => setChampionLookbackYears(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                <option value={3}>3 Years (Default - {year - 3} to {year - 1})</option>
                <option value={4}>4 Years ({year - 4} to {year - 1})</option>
              </select>
              <span className="text-[10px] text-slate-400">
                Number of previous years to scan for recent champions of the same sport + ageGroup + gender.
              </span>
            </div>

            {/* Team Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Enrolled Teams ({selectedTeams.length} selected)
                </label>
                {availableTeamsForForm.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTeams.length === availableTeamsForForm.length) {
                        setSelectedTeams([]);
                      } else {
                        setSelectedTeams(availableTeamsForForm.map((t) => t.id));
                      }
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {selectedTeams.length === availableTeamsForForm.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {availableTeamsForForm.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500 text-center">
                  No {ageGroup} ({gender}) teams found. You can enroll teams now or add them later in Teams & Schools.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-md p-2">
                  {availableTeamsForForm.map((t) => {
                    const isSelected = selectedTeams.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() =>
                          setSelectedTeams((prev) =>
                            prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                        className={`p-2 rounded text-xs flex items-center justify-between cursor-pointer ${
                          isSelected ? 'bg-indigo-50 text-indigo-900 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div>{t.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {t.schoolName} · {t.medium} Medium
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Tournament'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
