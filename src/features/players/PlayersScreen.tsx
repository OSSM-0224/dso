"use client";
import React, { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { api } from "@/lib/api.ts";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import { PlayerDoc, TeamDoc, SchoolDoc, TournamentDoc, UserSession } from "@/shared/types.ts";

interface PlayersScreenProps {
  canWrite: boolean;
  user: UserSession;
}

interface PlayerStats {
  totalPlayers: number;
  activePlayers: number;
  inactivePlayers: number;
  totalTeams: number;
}

interface FilterState {
  searchQuery: string;
  tournamentId: string;
  teamId: string;
  gender: "all" | "boys" | "girls";
  ageGroup: string;
  status: "all" | "active" | "inactive";
}

export const PlayersScreen: React.FC<PlayersScreenProps> = ({ canWrite, user }) => {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [tournaments, setTournaments] = useState<TournamentDoc[]>([]);

  const [stats, setStats] = useState<PlayerStats>({
    totalPlayers: 0,
    activePlayers: 0,
    inactivePlayers: 0,
    totalTeams: 0,
  });

  const [filters, setFilters] = useState<FilterState>(
    user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer'
      ? {
          searchQuery: "",
          tournamentId: "",
          teamId: "",
          gender: "all",
          ageGroup: "",
          status: "all",
        }
      : {
          searchQuery: "",
          tournamentId: tournaments[0]?.id || "",
          teamId: "",
          gender: "all",
          ageGroup: "",
          status: "all",
        }
  );

  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerDoc | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      loadPlayers();
    }
  }, [filters]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') {
        const schoolPlayers = await api.players.list({
          schoolId: user.schoolId,
        });
        setPlayers(schoolPlayers);
        setTeams(await api.teams.list({ schoolId: user.schoolId }));
        setSchools([{
          id: user.schoolId || "",
          name: user.schoolName || "",
          mediums: [],
          createdAt: "",
          updatedAt: "",
        }]);
        return;
      }

      const [allTeams, allSchools, allTournaments] = await Promise.all([
        api.teams.list(),
        api.schools.list(),
        api.tournaments.list(),
      ]);

      setTeams(allTeams);
      setSchools(allSchools);
      setTournaments(allTournaments);

      if (allTournaments.length > 0) {
        setFilters(prev => ({ ...prev, tournamentId: allTournaments[0].id }));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlayers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const filterParams: any = {};

      if (user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') {
        filterParams.schoolId = user.schoolId;
      } else {
        if (filters.tournamentId) filterParams.tournamentId = filters.tournamentId;
        if (filters.teamId) filterParams.teamId = filters.teamId;
        if (filters.gender && filters.gender !== 'all') filterParams.gender = filters.gender;
        if (filters.ageGroup) filterParams.ageGroup = filters.ageGroup;
        if (filters.status && filters.status !== 'all') {
          filterParams.isActive = filters.status === 'active';
        }
      }

      if (filters.searchQuery) filterParams.search = filters.searchQuery;

      const fetchedPlayers = await api.players.list(filterParams);
      setPlayers(fetchedPlayers);

      const uniqueTeams = Array.from(
        new Map(teams.map(t => [t.id, t])).values()
      ).filter(team => fetchedPlayers.some(player => player.teamId === team.id));
      setStats(prev => ({ ...prev, totalTeams: uniqueTeams.length }));
    } catch (err: any) {
      setError(err.message || "Failed to load players");
    } finally {
      setIsLoading(false);
    }
  };

  const updateStats = (playersData: PlayerDoc[]) => {
    const activeCount = playersData.filter(p => p.isActive !== false).length;
    const inactiveCount = playersData.filter(p => p.isActive === false).length;

    setStats({
      totalPlayers: playersData.length,
      activePlayers: activeCount,
      inactivePlayers: inactiveCount,
      totalTeams: teams.length,
    });
  };

  useEffect(() => {
    updateStats(players);
  }, [players]);

  const handleSearchChange = (value: string) => {
    setFilters(prev => ({ ...prev, searchQuery: value }));
  };

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };

      if (key === 'tournamentId') {
        newFilters.teamId = '';
        const selectedTeams = teams.filter(t => t.tournamentId === value);
        if (selectedTeams.length === 0 && value) {
          setError(t('No teams found for the selected tournament'));
        }
      }

      return newFilters;
    });
  };

  const handleOpenAddPlayer = () => {
    setEditingPlayer(null);
    setShowPlayerModal(true);
  };

  const handleOpenEditPlayer = (player: PlayerDoc) => {
    setEditingPlayer(player);
    setShowPlayerModal(true);
  };

  const handleDeletePlayer = async (playerId: string) => {
    try {
      await api.players.delete(playerId);
      setSuccessMsg(t('Player deleted successfully'));
      setShowDeleteDialog(null);
      loadPlayers();
    } catch (err: any) {
      setError(err.message || "Failed to delete player");
    }
  };

  const handleTogglePlayerStatus = async (player: PlayerDoc) => {
    try {
      await api.players.update(player.id, { isActive: !player.isActive });
      setSuccessMsg(t('Player status updated successfully'));
      loadPlayers();
    } catch (err: any) {
      setError(err.message || "Failed to update player status");
    }
  };

  const filteredTeams = teams.filter(team => {
    if (user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') {
      return team.schoolId === user.schoolId;
    }
    if (filters.tournamentId) {
      return team.tournamentId === filters.tournamentId;
    }
    return true;
  });

  const filteredSchools = schools.filter(school => {
    if (user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer') {
      return school.id === user.schoolId;
    }
    return true;
  });

  const getSchoolName = (schoolId: string) => {
    const school = schools.find(s => s.id === schoolId);
    return school ? school.name : "";
  };

  const getTeamName = (teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : "";
  };

  const getTournamentName = (tournamentId: string) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    return tournament ? tournament.name : "";
  };

  const filteredPlayers = players.filter(player => {
    const playerGender = player.gender === 'boys' || player.gender === 'girls' ? player.gender : undefined;
    const matchesGender = !filters.gender || filters.gender === 'all' || playerGender === filters.gender;
    const matchesAgeGroup = !filters.ageGroup || player.ageGroup === filters.ageGroup;

    return matchesGender && matchesAgeGroup;
  });

  const clearFilters = () => {
    setFilters({
      searchQuery: "",
      tournamentId: user.role === 'participant' || user.role === 'viewer' || user.role === 'scorer'
        ? ""
        : tournaments[0]?.id || "",
      teamId: "",
      gender: "all",
      ageGroup: "",
      status: "all",
    });
  };

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'searchQuery') return value;
    if (key === 'gender' || key === 'status') return value !== 'all';
    if (key === 'ageGroup') return value;
    return false;
  });

  const getStatusText = (isActive?: boolean) => {
    return isActive === false ? t('Inactive') : t('Active');
  };

  const getStatusColor = (isActive?: boolean) => {
    return isActive === false
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';
  };

  if (isLoading && players.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('Players Management')}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {t('Manage registered players, team assignments and player details.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <button
              onClick={handleOpenAddPlayer}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm"
            >
              {t('+ Add Player')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {t(error)}
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 flex items-center justify-between">
          <span>{t(successMsg)}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 font-bold ml-4"
            aria-label={t('Dismiss message')}
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Icon name="users" size="sm" className="text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                {t('Total Players')}
              </p>
              <p className="text-xl font-bold text-slate-900">{stats.totalPlayers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Icon name="user-check" size="sm" className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                {t('Active Players')}
              </p>
              <p className="text-xl font-bold text-slate-900">{stats.activePlayers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Icon name="user-x" size="sm" className="text-red-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                {t('Inactive Players')}
              </p>
              <p className="text-xl font-bold text-slate-900">{stats.inactivePlayers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Icon name="building-2" size="sm" className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">
                {t('Total Teams')}
              </p>
              <p className="text-xl font-bold text-slate-900">{stats.totalTeams}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('Search & Filters')}
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {t('Clear Filters')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <input
              type="text"
              placeholder={t('Search player name, jersey number, team or school...')}
              value={filters.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {(user.role === 'admin' || user.role === 'organizer') && tournaments.length > 0 && (
            <div>
              <select
                value={filters.tournamentId}
                onChange={(e) => handleFilterChange('tournamentId', e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('All Tournaments')}</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <select
              value={filters.teamId}
              onChange={(e) => handleFilterChange('teamId', e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('All Teams')}</option>
              {filteredTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({getSchoolName(team.schoolId)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filters.gender}
              onChange={(e) => handleFilterChange('gender', e.target.value as FilterState['gender'])}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">{t('All Genders')}</option>
              <option value="boys">{t('Boys')}</option>
              <option value="girls">{t('Girls')}</option>
            </select>
          </div>

          <div>
            <select
              value={filters.ageGroup}
              onChange={(e) => handleFilterChange('ageGroup', e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('All Age Groups')}</option>
              <option value="U-14">U-14</option>
              <option value="U-17">U-17</option>
              <option value="U-19">U-19</option>
              <option value="Open">Open</option>
            </select>
          </div>

          <div>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value as FilterState['status'])}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">{t('All Status')}</option>
              <option value="active">{t('Active')}</option>
              <option value="inactive">{t('Inactive')}</option>
            </select>
          </div>
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="users" size="lg" className="text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2">
            {t('No Players Found')}
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            {hasActiveFilters
              ? t('No players match your current filters.')
              : t('No players registered yet.')}
          </p>
          {canWrite && !hasActiveFilters && (
            <button
              onClick={handleOpenAddPlayer}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm"
            >
              {t('+ Add First Player')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Player')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Jersey')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('School')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Team')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Gender')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Age Group')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {t('Status')}
                  </th>
                  {canWrite && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      {t('Actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlayers.map((player) => (
                  <tr
                    key={player.id}
                    className="hover:bg-slate-50 transition-colors duration-150"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-3">
                          <Icon name="user" size="xs" className="text-indigo-600" />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-900">
                            {player.name}
                          </div>
                          {player.dateOfBirth && (
                            <div className="text-xs text-slate-500">
                              DOB: {new Date(player.dateOfBirth).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-900">
                      {player.jerseyNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {getSchoolName(player.schoolId)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {getTeamName(player.teamId)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700">
                        {player.gender || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {player.ageGroup || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusColor(player.isActive)}`}>
                        {getStatusText(player.isActive)}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEditPlayer(player)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                            title={t('Edit')}
                          >
                            {t('Edit')}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleTogglePlayerStatus(player)}
                            className="text-emerald-600 hover:text-emerald-800 text-xs font-medium"
                            title={player.isActive === false ? t('Activate') : t('Deactivate')}
                          >
                            {player.isActive === false ? t('Activate') : t('Deactivate')}
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => setShowDeleteDialog(player.id)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                            title={t('Delete')}
                          >
                            {t('Delete')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPlayerModal && (
        <PlayerFormModal
          isOpen={showPlayerModal}
          onClose={() => {
            setShowPlayerModal(false);
            setEditingPlayer(null);
          }}
          onSuccess={() => {
            setShowPlayerModal(false);
            setEditingPlayer(null);
            loadPlayers();
          }}
          editingPlayer={editingPlayer}
          canWrite={canWrite}
          user={user}
          schools={filteredSchools}
          teams={filteredTeams}
          tournaments={tournaments}
        />
      )}

      {showDeleteDialog && (
        <PlayerDeleteDialog
          isOpen={!!showDeleteDialog}
          onClose={() => setShowDeleteDialog(null)}
          onConfirm={() => handleDeletePlayer(showDeleteDialog)}
          playerName={players.find(p => p.id === showDeleteDialog)?.name || ''}
        />
      )}
    </div>
  );
};
