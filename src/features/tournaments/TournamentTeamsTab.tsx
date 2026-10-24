import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { api } from '@/lib/api.ts';
import { EnrollmentDoc, SchoolDoc, TeamDoc, TournamentDoc } from '@/shared/types.ts';

interface TournamentTeamsTabProps {
  tournament: TournamentDoc;
  onTournamentUpdated: () => void;
  canWrite: boolean;
}

export const TournamentTeamsTab: React.FC<TournamentTeamsTabProps> = ({
  tournament,
  onTournamentUpdated,
  canWrite,
}) => {
  const [enrollments, setEnrollments] = useState<EnrollmentDoc[]>([]);
  const [allTeams, setAllTeams] = useState<TeamDoc[]>([]);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-select for enrollment
  const [selectedToEnroll, setSelectedToEnroll] = useState<string[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  // Quick Add Team Shortcut Modal
  const [showAddTeamShortcut, setShowAddTeamShortcut] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamSchoolId, setNewTeamSchoolId] = useState('');
  const [newTeamMedium, setNewTeamMedium] = useState('');

  // Unlock Confirmation Modal
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [tournament.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [enrollList, teamsList, schoolList] = await Promise.all([
        api.tournaments.getEnrollments(tournament.id),
        api.teams.list({
          ageGroup: tournament.ageGroup,
          gender: tournament.gender,
        }),
        api.schools.list(),
      ]);

      setEnrollments(enrollList);
      setAllTeams(teamsList);
      setSchools(schoolList);

      if (schoolList.length > 0 && !newTeamSchoolId) {
        setNewTeamSchoolId(schoolList[0].id);
        if (schoolList[0].mediums.length > 0) {
          setNewTeamMedium(schoolList[0].mediums[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load enrollment data');
    } finally {
      setIsLoading(false);
    }
  };

  // Active enrolled teams
  const activeEnrollments = enrollments.filter((e) => e.status === 'enrolled');
  const enrolledTeamIds = new Set(activeEnrollments.map((e) => e.teamId));

  // Available teams not yet enrolled
  const availableTeams = allTeams.filter((t) => !enrolledTeamIds.has(t.id));

  // Search filtered available teams
  const filteredAvailableTeams = availableTeams.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.schoolName || '').toLowerCase().includes(q) ||
      t.medium.toLowerCase().includes(q)
    );
  });

  // Bracket Geometry Live Counter
  const N = activeEnrollments.length;
  let P = 1;
  while (P < Math.max(2, N)) {
    P *= 2;
  }
  const byes = N > 0 ? P - N : 0;
  const playInMatches = N >= P / 2 ? N - P / 2 : 0;
  const r2Teams = P / 2;

  // Toggle select to enroll
  const toggleSelectTeam = (id: string) => {
    setSelectedToEnroll((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all available filtered teams
  const handleSelectAll = () => {
    if (selectedToEnroll.length === filteredAvailableTeams.length) {
      setSelectedToEnroll([]);
    } else {
      setSelectedToEnroll(filteredAvailableTeams.map((t) => t.id));
    }
  };

  // Bulk Enroll Selected
  const handleEnrollSelected = async () => {
    if (selectedToEnroll.length === 0 || !canWrite) return;
    try {
      setIsEnrolling(true);
      setError(null);
      await api.tournaments.enrollTeams(tournament.id, selectedToEnroll);
      setSelectedToEnroll([]);
      setSuccessMsg(`Enrolled ${selectedToEnroll.length} team(s) successfully.`);
      await loadData();
      onTournamentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to enroll teams');
    } finally {
      setIsEnrolling(false);
    }
  };

  // Withdraw / Remove Team
  const handleWithdrawTeam = async (teamId: string, teamName?: string) => {
    if (!canWrite) return;
    try {
      setError(null);
      await api.tournaments.withdrawTeam(tournament.id, teamId);
      setSuccessMsg(`Withdrew team "${teamName || teamId}" from tournament.`);
      await loadData();
      onTournamentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to withdraw team');
    }
  };

  // Lock Enrollment
  const handleLockEnrollment = async () => {
    if (!canWrite) return;
    if (N < 4) {
      setError(`Minimum 4 teams required to lock enrollment. Currently enrolled: ${N}.`);
      return;
    }

    try {
      setIsLocking(true);
      setError(null);
      await api.tournaments.lockEnrollment(tournament.id);
      setSuccessMsg('Team enrollment locked successfully! Fixture generation is now ready.');
      await loadData();
      onTournamentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to lock enrollment');
    } finally {
      setIsLocking(false);
    }
  };

  // Unlock Enrollment
  const handleConfirmUnlock = async () => {
    if (!canWrite) return;
    try {
      setIsLocking(true);
      setError(null);
      const res = await api.tournaments.unlockEnrollment(tournament.id);
      setShowUnlockModal(false);
      setSuccessMsg(
        res.warning
          ? `Enrollment unlocked. Notice: ${res.warning}`
          : 'Enrollment unlocked.'
      );
      await loadData();
      onTournamentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to unlock enrollment');
    } finally {
      setIsLocking(false);
    }
  };

  // One-Click "Add Team" Shortcut
  const handleAddTeamShortcut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamSchoolId || !newTeamMedium) {
      setError('Please provide team name, school, and instruction medium.');
      return;
    }

    try {
      setError(null);
      // 1. Create team
      const team = await api.teams.create({
        name: newTeamName.trim(),
        schoolId: newTeamSchoolId,
        medium: newTeamMedium,
        ageGroup: tournament.ageGroup,
        gender: tournament.gender,
      });

      // 2. Immediately enroll into this tournament
      await api.tournaments.enrollTeams(tournament.id, [team.id]);

      setShowAddTeamShortcut(false);
      setNewTeamName('');
      setSuccessMsg(`Team "${team.name}" created and enrolled in ${tournament.name}!`);
      await loadData();
      onTournamentUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to create and enroll team');
    }
  };

  const selectedSchoolForShortcut = schools.find((s) => s.id === newTeamSchoolId);

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
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 font-bold ml-4" aria-label="Dismiss message"><Icon name="xmark" size="sm" /></button>
        </div>
      )}

      {/* Live Counter & Geometry Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Enrollment Status & Bracket Geometry
              </h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  tournament.isEnrollmentLocked
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}
              >
                {tournament.isEnrollmentLocked ? '🔒 Enrollment Locked' : '🔓 Enrollment Open'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Category: <span className="font-semibold text-slate-700">{tournament.ageGroup} ({tournament.gender})</span> · Minimum 4 teams required to lock and generate fixtures.
            </p>
          </div>

          {canWrite && (
            <div className="flex items-center gap-2">
              {!tournament.isEnrollmentLocked ? (
                <button
                  onClick={handleLockEnrollment}
                  disabled={isLocking || N < 4}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
                  title={N < 4 ? 'At least 4 teams required to lock' : 'Lock enrollment to enable fixture generation'}
                >
                  {isLocking ? 'Locking...' : '🔒 Lock Enrollment'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (tournament.status === 'fixtures-generated' || tournament.status === 'published') {
                      setShowUnlockModal(true);
                    } else {
                      handleConfirmUnlock();
                    }
                  }}
                  disabled={isLocking}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap"
                >
                  {isLocking ? 'Unlocking...' : '🔓 Unlock Enrollment'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Enrolled Teams</span>
            <div className={`text-xl font-bold font-mono tabular-nums ${N < 4 ? 'text-amber-600' : 'text-slate-900'}`}>
              {N}
            </div>
            <span className="text-[10px] text-slate-400">
              {N < 4 ? `Need ${4 - N} more (min 4)` : 'Eligible for draw'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Bracket Size (P)</span>
            <div className="text-xl font-bold font-mono text-indigo-600 tabular-nums">
              {P}
            </div>
            <span className="text-[10px] text-slate-400">Next Power-of-2</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Round 1 Byes</span>
            <div className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
              {byes}
            </div>
            <span className="text-[10px] text-slate-400">P - N Byes</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] text-slate-500 block">Play-In Matches</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {playInMatches}
            </div>
            <span className="text-[10px] text-slate-400">Round 1 Games</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-500 block">Round 2 Teams</span>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {r2Teams}
            </div>
            <span className="text-[10px] text-slate-400">Exact P/2 Teams</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: ENROLLED TEAMS LIST */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Enrolled Teams ({activeEnrollments.length})
                </h3>
                <span className="text-xs text-slate-500">
                  Teams participating in this draw
                </span>
              </div>

              {tournament.isEnrollmentLocked && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                  Roster Locked
                </span>
              )}
            </div>

            {activeEnrollments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No teams enrolled yet. Select available teams in the list alongside, or use &quot;+ Add Team&quot; shortcut.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                {activeEnrollments.map((enr) => (
                  <div
                    key={enr.id}
                    className="py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{enr.team?.name || enr.teamId}</span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded font-medium border border-emerald-200 shrink-0">
                          {enr.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {enr.team?.schoolName} · <span className="font-medium text-slate-700">{enr.team?.medium} Medium</span>
                      </div>
                    </div>

                    {canWrite && !tournament.isEnrollmentLocked && (
                      <button
                        onClick={() => handleWithdrawTeam(enr.teamId, enr.team?.name)}
                        className="text-red-600 hover:text-red-800 text-[11px] font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        title="Withdraw team from tournament"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: AVAILABLE REGISTERED TEAMS TO ENROLL */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Available Registered Teams ({availableTeams.length})
                </h3>
                <span className="text-xs text-slate-500">
                  Auto-filtered to {tournament.ageGroup} ({tournament.gender})
                </span>
              </div>

              {canWrite && !tournament.isEnrollmentLocked && (
                <button
                  onClick={() => setShowAddTeamShortcut(true)}
                  className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold rounded-md transition-colors"
                >
                  <Icon name="bolt" size="sm" className="mr-1" />One-Click Add Team
                </button>
              )}
            </div>

            {tournament.isEnrollmentLocked ? (
              <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-lg p-6">
                🔒 Team enrollment is currently locked. To add or remove teams, click <strong>Unlock Enrollment</strong> above.
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {/* Search & Select All */}
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Search by team, school, or medium..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {filteredAvailableTeams.length > 0 && (
                    <button
  type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                    >
                      {selectedToEnroll.length === filteredAvailableTeams.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  )}
                </div>

                {/* Team Checkbox List */}
                {filteredAvailableTeams.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    {availableTeams.length === 0
                      ? `All registered ${tournament.ageGroup} (${tournament.gender}) teams are already enrolled!`
                      : 'No available teams match your search.'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {filteredAvailableTeams.map((team) => {
                      const isSelected = selectedToEnroll.includes(team.id);
                      return (
                        <div
                          key={team.id}
                          onClick={() => toggleSelectTeam(team.id)}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-medium ring-1 ring-indigo-600'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-semibold">{team.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {team.schoolName} · <span className="text-slate-700 font-medium">{team.medium} Medium</span>
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
                )}
              </div>
            )}
          </div>

          {/* Action Bar */}
          {!tournament.isEnrollmentLocked && availableTeams.length > 0 && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {selectedToEnroll.length} team(s) selected
              </span>
              <button
                onClick={handleEnrollSelected}
                disabled={isEnrolling || selectedToEnroll.length === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 transition-colors"
              >
                {isEnrolling ? 'Enrolling...' : `Enroll Selected (${selectedToEnroll.length})`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* One-Click Add Team Shortcut Modal */}
      {showAddTeamShortcut && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddTeamShortcut(false);
          }}
        >
          <form
            onSubmit={handleAddTeamShortcut}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-full overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Quick Add & Enroll Team
                </h3>
                <p className="text-xs text-slate-500">
                  Creates squad and immediately enrolls into {tournament.name}
                </p>
              </div>
              <button aria-label="Close"
  type="button"
                onClick={() => setShowAddTeamShortcut(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                <Icon name="xmark" size="sm" align-middle />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Parent School
              </label>
              <select
                value={newTeamSchoolId}
                onChange={(e) => {
                  setNewTeamSchoolId(e.target.value);
                  const sch = schools.find((s) => s.id === e.target.value);
                  if (sch && sch.mediums.length > 0) {
                    setNewTeamMedium(sch.mediums[0]);
                  }
                }}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medium (Available for {selectedSchoolForShortcut?.name || 'this school'})
              </label>
              <select
                value={newTeamMedium}
                onChange={(e) => setNewTeamMedium(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                {selectedSchoolForShortcut?.mediums.map((m) => (
                  <option key={m} value={m}>
                    {m} Medium
                  </option>
                )) || <option value="Marathi">Marathi</option>}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Team Name
              </label>
              <input
                type="text"
                required
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. NHPS Boys English"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div className="p-2.5 bg-slate-50 rounded text-xs text-slate-600 flex items-center justify-between">
              <span>Category (Locked to tournament):</span>
              <span className="font-semibold text-slate-900 font-mono">
                {tournament.ageGroup} · {tournament.gender}
              </span>
            </div>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
  type="button"
                onClick={() => setShowAddTeamShortcut(false)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-sm"
              >
                Create & Auto-Enroll
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Unlock Confirmation Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-full overflow-y-auto">
            <div className="flex items-center gap-2 text-amber-700 pb-2 border-b border-slate-100">
              <Icon name="triangleExclamation" size="lg" className="text-red-text" />
              <h3 className="text-base font-bold text-slate-900">
                Unlock Enrollment Warning
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Fixtures have already been generated for <strong>{tournament.name}</strong>. If you unlock enrollment and add or remove teams, the current fixtures must be regenerated to preserve bracket integrity and quarter seeding.
            </p>

            <p className="text-xs font-semibold text-slate-700">
              Do you wish to proceed with unlocking team enrollment?
            </p>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-3 border-t border-slate-100">
              <button
  type="button"
                onClick={() => setShowUnlockModal(false)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                Cancel
              </button>
              <button
  type="button"
                onClick={handleConfirmUnlock}
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md shadow-sm"
              >
                Confirm & Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
