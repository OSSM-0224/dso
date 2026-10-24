import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api.ts';
import { PastTournamentDoc } from '@/shared/types.ts';

interface PastTournamentsScreenProps {
  canWrite: boolean;
}

export const PastTournamentsScreen: React.FC<PastTournamentsScreenProps> = ({ canWrite }) => {
  const [records, setRecords] = useState<PastTournamentDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const [name, setName] = useState('');
  const [sport, setSport] = useState('kho-kho');
  const [ageGroup, setAgeGroup] = useState('U-14');
  const [gender, setGender] = useState<'boys' | 'girls'>('boys');
  const [year, setYear] = useState<number>(2025);
  const [winnerTeamName, setWinnerTeamName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.pastTournaments.list();
      setRecords(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load past tournament records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !winnerTeamName.trim() || !schoolName.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    try {
      setError(null);
      await api.pastTournaments.create({
        name: name.trim(),
        sport,
        ageGroup,
        gender,
        year: Number(year),
        winnerTeamName: winnerTeamName.trim(),
        schoolName: schoolName.trim(),
      });
      setName('');
      setWinnerTeamName('');
      setSchoolName('');
      setShowAddForm(false);
      loadRecords();
    } catch (err: any) {
      setError(err.message || 'Failed to create record');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this past tournament record?')) return;
    try {
      await api.pastTournaments.delete(id);
      loadRecords();
    } catch (err: any) {
      setError(err.message || 'Failed to delete record');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Past Tournament Champions (Historical Archive)
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl mt-1">
            Rule 1 enables instant auto-detection of past champions for the very first season. Record historical DSO champions here so the fixture generation engine automatically grants them Round 1 byes.
          </p>
        </div>

        {canWrite && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm shrink-0"
          >
            + Record Past Champion
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Record Past Tournament Result
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tournament Title
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navi Mumbai DSO Kho-Kho Championship 2025"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
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
                <option value="kabaddi">Kabaddi</option>
                <option value="volleyball">Volleyball</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Age Group
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
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
                  onChange={(e) => setGender(e.target.value as 'boys' | 'girls')}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Winner Team Name
              </label>
              <input
                type="text"
                required
                value={winnerTeamName}
                onChange={(e) => setWinnerTeamName(e.target.value)}
                placeholder="e.g. NHPS Airoli Boys"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                School Name
              </label>
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. New Horizon Public School"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm"
            >
              Save Past Record
            </button>
          </div>
        </form>
      )}

      {/* Records Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Recorded Champions Archive ({records.length})
        </h3>

        {records.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No past tournament records recorded yet. Click &quot;Record Past Champion&quot; above to add historical winners.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map((r) => (
              <div
                key={r.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900 flex items-center gap-2">
                    <span>🏆</span>
                    <span>{r.winnerTeamName}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-mono font-bold px-1.5 py-0.5 rounded">
                      {r.year}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {r.schoolName} · {r.name} · {r.sport.toUpperCase()} {r.ageGroup} ({r.gender})
                  </div>
                </div>

                {canWrite && (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-red-600 hover:text-red-800 text-[11px] font-medium shrink-0 self-end sm:self-center"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
