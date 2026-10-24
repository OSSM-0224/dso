import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api.ts';
import { SchoolDoc, TeamDoc } from '@/shared/types.ts';

// Heavy, rarely-mounted surfaces are code-split so the core Teams/Schools
// render path stays small (UI output identical once loaded).
const CsvImportModal = dynamic(() => import('./CsvImportModal.tsx').then((m) => m.CsvImportModal), {
  ssr: false,
  loading: () => null,
});
const ParticipantAccountsPanel = dynamic(
  () => import('../admin/ParticipantAccountsPanel.tsx').then((m) => m.ParticipantAccountsPanel),
  { ssr: false, loading: () => null }
);

interface TeamsScreenProps {
  canWrite: boolean;
}

export const TeamsScreen: React.FC<TeamsScreenProps> = ({ canWrite }) => {
  const [activeSubTab, setActiveSubTab] = useState<'teams' | 'schools' | 'accounts'>('teams');
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [participantAccounts, setParticipantAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'boys' | 'girls'>('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>('all');

  // Modals
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolDoc | null>(null);
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolMediumsInput, setSchoolMediumsInput] = useState('Marathi, English');

  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamDoc | null>(null);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamSchoolIdInput, setTeamSchoolIdInput] = useState('');
  const [teamMediumInput, setTeamMediumInput] = useState('');
  const [teamAgeGroupInput, setTeamAgeGroupInput] = useState<'U-14' | 'U-17' | 'U-19' | 'Open'>('U-14');
  const [teamGenderInput, setTeamGenderInput] = useState<'boys' | 'girls'>('boys');

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [schoolList, teamList] = await Promise.all([
        api.schools.list(),
        api.teams.list(),
      ]);
      setSchools(schoolList);
      setTeams(teamList);

      if (canWrite) {
        try {
          const accounts = await api.admin.participants.list();
          setParticipantAccounts(accounts);
        } catch {
          // If viewer or not allowed, ignore
        }
      }
      if (schoolList.length > 0 && !teamSchoolIdInput) {
        setTeamSchoolIdInput(schoolList[0].id);
        if (schoolList[0].mediums.length > 0) {
          setTeamMediumInput(schoolList[0].mediums[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  // Open Add School Modal
  const handleOpenAddSchool = () => {
    setEditingSchool(null);
    setSchoolNameInput('');
    setSchoolMediumsInput('Marathi, English');
    setShowSchoolModal(true);
  };

  // Open Edit School Modal
  const handleOpenEditSchool = (school: SchoolDoc) => {
    setEditingSchool(school);
    setSchoolNameInput(school.name);
    setSchoolMediumsInput(school.mediums.join(', '));
    setShowSchoolModal(true);
  };

  // Save School (Create / Edit)
  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolNameInput.trim()) return;

    try {
      setError(null);
      const mediums = schoolMediumsInput
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      if (editingSchool) {
        await api.schools.update(editingSchool.id, {
          name: schoolNameInput.trim(),
          mediums: mediums.length > 0 ? mediums : ['Marathi', 'English'],
        });
        setSuccessMsg(`School "${schoolNameInput}" updated successfully.`);
      } else {
        await api.schools.create({
          name: schoolNameInput.trim(),
          mediums: mediums.length > 0 ? mediums : ['Marathi', 'English'],
        });
        setSuccessMsg(`School "${schoolNameInput}" registered successfully.`);
      }

      setShowSchoolModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save school');
    }
  };

  // Open Add Team Modal
  const handleOpenAddTeam = () => {
    setEditingTeam(null);
    setTeamNameInput('');
    const defaultSchool = schools[0];
    const sId = defaultSchool ? defaultSchool.id : '';
    setTeamSchoolIdInput(sId);
    setTeamMediumInput(defaultSchool && defaultSchool.mediums[0] ? defaultSchool.mediums[0] : 'Marathi');
    setTeamAgeGroupInput('U-14');
    setTeamGenderInput('boys');
    setShowTeamModal(true);
  };

  // Open Edit Team Modal
  const handleOpenEditTeam = (team: TeamDoc) => {
    setEditingTeam(team);
    setTeamNameInput(team.name);
    setTeamSchoolIdInput(team.schoolId);
    setTeamMediumInput(team.medium);
    setTeamAgeGroupInput((team.ageGroup as any) || 'U-14');
    setTeamGenderInput(team.gender);
    setShowTeamModal(true);
  };

  // Handle school selection in Team Form
  const handleSchoolChangeInTeamForm = (schoolId: string) => {
    setTeamSchoolIdInput(schoolId);
    const selectedSchool = schools.find((s) => s.id === schoolId);
    if (selectedSchool && selectedSchool.mediums.length > 0) {
      setTeamMediumInput(selectedSchool.mediums[0]);
    }
  };

  // Save Team (Create / Edit)
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamNameInput.trim() || !teamSchoolIdInput || !teamMediumInput) {
      setError('Please provide team name, school, and instruction medium.');
      return;
    }

    try {
      setError(null);
      if (editingTeam) {
        await api.teams.update(editingTeam.id, {
          name: teamNameInput.trim(),
          schoolId: teamSchoolIdInput,
          medium: teamMediumInput,
          ageGroup: teamAgeGroupInput,
          gender: teamGenderInput,
        });
        setSuccessMsg(`Team "${teamNameInput}" updated successfully.`);
      } else {
        await api.teams.create({
          name: teamNameInput.trim(),
          schoolId: teamSchoolIdInput,
          medium: teamMediumInput,
          ageGroup: teamAgeGroupInput,
          gender: teamGenderInput,
        });
        setSuccessMsg(`Team "${teamNameInput}" created successfully.`);
      }

      setShowTeamModal(false);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save team');
    }
  };

  const handleDeleteSchool = async (id: string, name: string) => {
    if (!window.confirm(`Delete school "${name}"? Teams linked to this school may be affected.`)) return;
    try {
      await api.schools.delete(id);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete school');
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (!window.confirm(`Delete team "${name}"?`)) return;
    try {
      await api.teams.delete(id);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete team');
    }
  };

  // Filtered lists
  const filteredTeams = teams.filter((t) => {
    if (genderFilter !== 'all' && t.gender !== genderFilter) return false;
    if (ageGroupFilter !== 'all' && t.ageGroup !== ageGroupFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchSchool = (t.schoolName || '').toLowerCase().includes(q);
      const matchMedium = t.medium.toLowerCase().includes(q);
      if (!matchName && !matchSchool && !matchMedium) return false;
    }
    return true;
  });

  const filteredSchools = schools.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.mediums.some((m) => m.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedSchoolForTeamModal = schools.find((s) => s.id === teamSchoolIdInput);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Schools & Team Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Register schools, manage mediums of instruction (Marathi, English, etc.), and build age-category team squads. Use CSV bulk import for rapid season intake.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <button
                onClick={() => setShowCsvModal(true)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Icon name="fileCsv" size="sm" />
                <span>Bulk Import CSV</span>
              </button>
              <button
                onClick={handleOpenAddSchool}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg shadow-sm"
              >
                + Add School
              </button>
              <button
                onClick={handleOpenAddTeam}
                disabled={schools.length === 0}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm disabled:opacity-50"
              >
                + Add Team
              </button>
            </>
          )}
        </div>
      </div>

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

      {/* Tabs & Search Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Subtabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('teams')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeSubTab === 'teams'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Teams ({teams.length})
          </button>
          <button
            onClick={() => setActiveSubTab('schools')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubTab === 'schools'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Schools ({schools.length})
          </button>
          {canWrite && (
            <button
              onClick={() => setActiveSubTab('accounts')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeSubTab === 'accounts'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              School Accounts ({participantAccounts.length})
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            placeholder={activeSubTab === 'teams' ? 'Search team, school, medium...' : 'Search school or medium...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* SUBTAB 1: TEAMS */}
      {activeSubTab === 'teams' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered Teams ({filteredTeams.length})
            </h3>

            {/* Gender and Age filters */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Gender:</span>
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as any)}
                  className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="all">All</option>
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Age:</span>
                <select
                  value={ageGroupFilter}
                  onChange={(e) => setAgeGroupFilter(e.target.value)}
                  className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                >
                  <option value="all">All</option>
                  <option value="U-14">U-14</option>
                  <option value="U-17">U-17</option>
                  <option value="U-19">U-19</option>
                </select>
              </div>
            </div>
          </div>

          {filteredTeams.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              {teams.length === 0
                ? 'No teams registered yet. Use "+ Add Team" or "Bulk Import CSV" above.'
                : 'No teams match the search criteria.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTeams.map((team) => (
                <div
                  key={team.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{team.name}</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      {team.schoolName} ·{' '}
                      <span className="font-medium text-slate-700">{team.medium} Medium</span> ·{' '}
                      {team.ageGroup} · <span className="capitalize">{team.gender}</span>
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenEditTeam(team)}
                        className="text-indigo-600 hover:text-indigo-800 text-[11px] font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.id, team.name)}
                        className="text-red-600 hover:text-red-800 text-[11px] font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: SCHOOLS */}
      {activeSubTab === 'schools' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered Schools & Mediums ({filteredSchools.length})
            </h3>
          </div>

          {filteredSchools.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No schools registered yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredSchools.map((school) => (
                <div
                  key={school.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{school.name}</span>
                      {(() => {
                        const acc = participantAccounts.find((a) => a.schoolId === school.id);
                        if (acc) {
                          return (
                            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                              Code: {acc.schoolCode || 'Active'}
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            No Login Issued
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>Instruction Mediums:</span>
                      {school.mediums.map((m, idx) => (
                        <span
                          key={idx}
                          className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenEditSchool(school)}
                        className="text-indigo-600 hover:text-indigo-800 text-[11px] font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSchool(school.id, school.name)}
                        className="text-red-600 hover:text-red-800 text-[11px] font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: PARTICIPANT ACCOUNTS */}
      {activeSubTab === 'accounts' && (
        <ParticipantAccountsPanel schools={schools} onAccountCreated={loadData} />
      )}


      {/* Add / Edit School Modal */}
      {showSchoolModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSchoolModal(false);
          }}
        >
          <form
            onSubmit={handleSaveSchool}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-full overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingSchool ? 'Edit School' : 'Add School'}
              </h3>
              <button aria-label="Close"
  type="button"
                onClick={() => setShowSchoolModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                <Icon name="xmark" size="sm" align-middle />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                School Name
              </label>
              <input
                type="text"
                required
                value={schoolNameInput}
                onChange={(e) => setSchoolNameInput(e.target.value)}
                placeholder="e.g. New Horizon Public School"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instruction Mediums (comma-separated)
              </label>
              <input
                type="text"
                required
                value={schoolMediumsInput}
                onChange={(e) => setSchoolMediumsInput(e.target.value)}
                placeholder="e.g. Marathi, English, Hindi"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
              <span className="text-[10px] text-slate-400">
                Rule 4: Teams from the same school with different mediums will never meet in Round 1.
              </span>
            </div>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
  type="button"
                onClick={() => setShowSchoolModal(false)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm"
              >
                {editingSchool ? 'Save Changes' : 'Create School'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add / Edit Team Modal */}
      {showTeamModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTeamModal(false);
          }}
        >
          <form
            onSubmit={handleSaveTeam}
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4 max-h-full overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingTeam ? 'Edit Team' : 'Add Team Squad'}
              </h3>
              <button aria-label="Close"
  type="button"
                onClick={() => setShowTeamModal(false)}
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
                value={teamSchoolIdInput}
                onChange={(e) => handleSchoolChangeInTeamForm(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Instruction Medium chosen strictly from that school's mediums */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medium (Available for {selectedSchoolForTeamModal?.name || 'this school'})
              </label>
              <select
                value={teamMediumInput}
                onChange={(e) => setTeamMediumInput(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
              >
                {selectedSchoolForTeamModal?.mediums && selectedSchoolForTeamModal.mediums.length > 0 ? (
                  selectedSchoolForTeamModal.mediums.map((m) => (
                    <option key={m} value={m}>
                      {m} Medium
                    </option>
                  ))
                ) : (
                  <option value="Marathi">Marathi Medium</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Team Display Name
              </label>
              <input
                type="text"
                required
                value={teamNameInput}
                onChange={(e) => setTeamNameInput(e.target.value)}
                placeholder="e.g. NHPS Boys Marathi A"
                className="w-full text-xs border border-slate-200 rounded-md p-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Age Group
                </label>
                <select
                  value={teamAgeGroupInput}
                  onChange={(e) => setTeamAgeGroupInput(e.target.value as any)}
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
                  value={teamGenderInput}
                  onChange={(e) => setTeamGenderInput(e.target.value as any)}
                  className="w-full text-xs border border-slate-200 rounded-md p-2 bg-white"
                >
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse items-stretch sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
  type="button"
                onClick={() => setShowTeamModal(false)}
                className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-md shadow-sm"
              >
                {editingTeam ? 'Save Changes' : 'Create Team'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showCsvModal && (
        <CsvImportModal
          isOpen={true}
          onClose={() => setShowCsvModal(false)}
          onSuccess={() => loadData()}
        />
      )}
    </div>
  );
};
