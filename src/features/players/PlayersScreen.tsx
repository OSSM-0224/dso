"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { api } from "@/lib/api.ts";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import {
  PlayerDoc,
  SchoolDoc,
  TeamDoc,
  TournamentDoc,
  UserSession,
} from "@/shared/types.ts";
import {
  PlayerFilterState,
  PlayerFilters,
  EMPTY_PLAYER_FILTERS,
} from "./PlayerFilters.tsx";
import { PlayerStats, PlayerStatsData } from "./PlayerStats.tsx";
import { PlayerTable } from "./PlayerTable.tsx";
import { PlayerFormModal } from "./PlayerFormModal.tsx";
import { PlayerDeleteDialog } from "./PlayerDeleteDialog.tsx";
import { PlayerCsvImportModal } from "./PlayerCsvImportModal.tsx";

interface PlayersScreenProps {
  user: UserSession | null;
  /** Write permission (admin/organizer, or coaches inside the school portal). */
  canWrite: boolean;
}

const isSchoolScoped = (user: UserSession | null) =>
  Boolean(user && user.role === "participant" && user.schoolId);

export const PlayersScreen: React.FC<PlayersScreenProps> = ({
  user,
  canWrite,
}) => {
  const { t } = useI18n();

  const [isLoading, setIsLoading] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [tournaments, setTournaments] = useState<TournamentDoc[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerDoc | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<PlayerDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [filterState, setFilterState] = useState<PlayerFilterState>({
    ...EMPTY_PLAYER_FILTERS,
  });

  const flash = useCallback((message: string) => {
    setSuccessMsg(t(message));
    window.setTimeout(() => setSuccessMsg(null), 4000);
  }, [t]);

  /** Loads every dataset the current role is allowed to see. */
  const loadData = useCallback(async () => {
    if (isSchoolScoped(user)) {
      // School coach: the backend scopes players to their own school.
      const [schoolPlayers, myDashboard] = await Promise.all([
        api.players.list(),
        api.my.getDashboard(),
      ]);
      const schoolTeams: TeamDoc[] = (myDashboard?.teams ?? []).map((tm) => ({
        id: tm.id,
        name: tm.name,
        medium: tm.medium,
        ageGroup: tm.ageGroup,
        gender: tm.gender === "girls" ? "girls" : "boys",
        tournamentId: "",
        schoolId: user!.schoolId!,
        schoolName: user!.schoolName || "",
        isActive: true,
        createdAt: "",
      }));
      setPlayers(schoolPlayers);
      setTeams(schoolTeams);
      setSchools([]);
      setTournaments([]);
      return;
    }

    // Admin / organizer: everything, plus the dropdown sources.
    const [allPlayers, allTournaments] = await Promise.all([
      api.players.list(),
      api.tournaments.list(),
    ]);
    setPlayers(allPlayers);
    setTournaments(allTournaments);

    // teams.list() is tournament-scoped by design — fan out per tournament id.
    const teamLists = await Promise.all(
      allTournaments.map((tm) => api.teams.list({ tournamentId: tm.id })),
    );
    const allTeams = teamLists.flat();
    setTeams(allTeams);
    setSchools(await api.schools.list());
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        await loadData();
      } catch (err: any) {
        if (!cancelled) setError(err?.message || t("Failed to load players"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData, t]);

  /** Refresh just players (after create/update/delete). */
  const reloadPlayers = useCallback(async () => {
    try {
      setIsReloading(true);
      const list = await api.players.list();
      setPlayers(list);
    } catch (err: any) {
      setError(err?.message || t("Failed to load players"));
    } finally {
      setIsReloading(false);
    }
  }, [t]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) map.set(team.id, team.name);
    return map;
  }, [teams]);

  const stats: PlayerStatsData = useMemo(() => {
    const activeCount = players.filter((p) => p.isActive).length;
    return {
      totalPlayers: players.length,
      activePlayers: activeCount,
      inactivePlayers: players.length - activeCount,
      totalTeams: teams.length,
    };
  }, [players, teams]);

  const teamTournamentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const team of teams) map.set(team.id, team.tournamentId);
    return map;
  }, [teams]);

  const visiblePlayers = useMemo(() => {
    const q = filterState.searchQuery.trim().toLowerCase();
    return players.filter((player) => {
      if (
        filterState.tournamentId &&
        teamTournamentById.get(player.teamId) !== filterState.tournamentId
      )
        return false;
      if (filterState.teamId && player.teamId !== filterState.teamId) return false;
      if (filterState.gender !== "all" && player.gender !== filterState.gender)
        return false;
      if (filterState.ageGroup && player.ageGroup !== filterState.ageGroup)
        return false;
      if (filterState.status === "active" && !player.isActive) return false;
      if (filterState.status === "inactive" && player.isActive) return false;
      if (q) {
        const haystack = [
          player.name,
          player.schoolName,
          player.jerseyNumber !== undefined ? String(player.jerseyNumber) : "",
          teamNameById.get(player.teamId) || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [players, filterState, teamNameById, teamTournamentById]);

  const schoolScoped = isSchoolScoped(user);

  // Teams offered in the form: school-own teams for the school portal;
  // tournament-independent list for admin (they pick school then team).
  const selectableTeams = schoolScoped
    ? teams
    : teams; // admin list already covers every school; filtered further by chosen school in the modal

  const handleOpenAdd = () => {
    setEditingPlayer(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (player: PlayerDoc) => {
    setEditingPlayer(player);
    setIsFormOpen(true);
  };

  const handleFormSuccess = (saved: PlayerDoc) => {
    setIsFormOpen(false);
    setEditingPlayer(null);
    flash(
      editingPlayer
        ? t('Player "{name}" updated successfully.', { name: saved.name })
        : t('Player "{name}" registered successfully.', { name: saved.name }),
    );
    reloadPlayers();
  };

  const handleToggleStatus = async (player: PlayerDoc) => {
    try {
      setError(null);
      await api.players.update(player.id, { isActive: !player.isActive });
      flash(
        player.isActive
          ? t('Player "{name}" deactivated.', { name: player.name })
          : t('Player "{name}" activated.', { name: player.name }),
      );
      reloadPlayers();
    } catch (err: any) {
      setError(err?.message || t("Failed to update player status"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPlayer) return;
    try {
      setIsDeleting(true);
      await api.players.delete(deletingPlayer.id);
      flash(t('Player "{name}" deleted successfully.', { name: deletingPlayer.name }));
      setDeletingPlayer(null);
      reloadPlayers();
    } catch (err: any) {
      setError(err?.message || t("Failed to delete player"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="spinner" size="lg" spin className="text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {t("Players Management")}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t(
              "Manage registered players, team assignments and player details.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <button
                onClick={() => setIsImportOpen(true)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg shadow-sm"
              >
                {t("Import CSV")}
              </button>
              <button
                onClick={handleOpenAdd}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm"
              >
                {t("+ Add Player")}
              </button>
            </>
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
          <span>{successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-600 font-bold ml-4"
            aria-label={t("Dismiss message")}
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>
      )}

      <PlayerStats stats={stats} />

      <PlayerFilters
        filters={filterState}
        onChange={setFilterState}
        teams={teams}
        tournaments={tournaments}
        showStaffFilters={!schoolScoped}
      />

      {isReloading && (
        <p className="text-[11px] text-slate-400 px-1">{t("Refreshing...")}</p>
      )}

      {visiblePlayers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="users" size="lg" className="text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {players.length === 0
              ? t("No players registered yet.")
              : t("No players match your filters.")}
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            {players.length === 0
              ? t("Add the first player to start building this roster.")
              : t("Try clearing the search or filters below.")}
          </p>
          {canWrite && players.length === 0 && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm"
            >
              {t("+ Add Player")}
            </button>
          )}
          {players.length > 0 && (
            <button
              onClick={() => setFilterState({ ...EMPTY_PLAYER_FILTERS })}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg"
            >
              {t("Clear Filters")}
            </button>
          )}
        </div>
      ) : (
        <PlayerTable
          players={visiblePlayers}
          canWrite={canWrite}
          getTeamName={(teamId) => teamNameById.get(teamId) || ""}
          onEdit={handleOpenEdit}
          onDelete={setDeletingPlayer}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {isFormOpen && (
        <PlayerFormModal
          isOpen={isFormOpen}
          user={user!}
          editingPlayer={editingPlayer}
          schoolOptions={
            schoolScoped
              ? []
              : schools.map((s) => ({ id: s.id, name: s.name }))
          }
          teams={selectableTeams}
          onClose={() => {
            setIsFormOpen(false);
            setEditingPlayer(null);
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {deletingPlayer && (
        <PlayerDeleteDialog
          isOpen
          isDeleting={isDeleting}
          playerName={deletingPlayer.name}
          teamName={teamNameById.get(deletingPlayer.teamId)}
          onClose={() => setDeletingPlayer(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {isImportOpen && (
        <PlayerCsvImportModal
          isOpen={isImportOpen}
          teams={teams}
          onClose={() => setIsImportOpen(false)}
          onSuccess={(createdCount) => {
            flash(
              t("Successfully imported {count} player(s)!", {
                count: createdCount,
              }),
            );
            reloadPlayers();
          }}
        />
      )}
    </div>
  );
};
