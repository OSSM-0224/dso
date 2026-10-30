"use client";
import React from "react";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import { TeamDoc, TournamentDoc } from "@/shared/types.ts";

export interface PlayerFilterState {
  searchQuery: string;
  tournamentId: string;
  teamId: string;
  gender: "all" | "boys" | "girls";
  ageGroup: string;
  status: "all" | "active" | "inactive";
}

export const EMPTY_PLAYER_FILTERS: PlayerFilterState = {
  searchQuery: "",
  tournamentId: "",
  teamId: "",
  gender: "all",
  ageGroup: "",
  status: "all",
};

interface PlayerFiltersProps {
  filters: PlayerFilterState;
  onChange: (filters: PlayerFilterState) => void;
  /** All teams available in the current scope. */
  teams: TeamDoc[];
  /** Tournaments for the staff tournament filter (hidden for school users). */
  tournaments: TournamentDoc[];
  /** Admin/organizer view: shows tournament + team school names. */
  showStaffFilters: boolean;
}

export const PlayerFilters: React.FC<PlayerFiltersProps> = ({
  filters,
  onChange,
  teams,
  tournaments,
  showStaffFilters,
}) => {
  const { t } = useI18n();

  const hasActiveFilters =
    filters.searchQuery.trim() !== "" ||
    filters.tournamentId !== "" ||
    filters.teamId !== "" ||
    filters.gender !== "all" ||
    filters.ageGroup !== "" ||
    filters.status !== "all";

  const set = (patch: Partial<PlayerFilterState>) =>
    onChange({ ...filters, ...patch });

  const changeTournament = (tournamentId: string) =>
    // Switching tournament invalidates the selected team.
    onChange({ ...filters, tournamentId, teamId: "" });

  const teamOptions = filters.tournamentId
    ? teams.filter((team) => team.tournamentId === filters.tournamentId)
    : teams;

  const inputCls =
    "w-full text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("Search & Filters")}
        </h3>
        {hasActiveFilters && (
          <button
            onClick={() => onChange({ ...EMPTY_PLAYER_FILTERS })}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {t("Clear Filters")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="sm:col-span-2">
          <input
            type="text"
            placeholder={t("Search name, jersey no. or team...")}
            value={filters.searchQuery}
            onChange={(e) => set({ searchQuery: e.target.value })}
            className={inputCls}
          />
        </div>

        {showStaffFilters ? (
          <select
            value={filters.tournamentId}
            onChange={(e) => changeTournament(e.target.value)}
            className={inputCls}
          >
            <option value="">{t("All Tournaments")}</option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={filters.teamId}
          onChange={(e) => set({ teamId: e.target.value })}
          className={inputCls}
        >
          <option value="">{t("All Teams")}</option>
          {teamOptions.map((team) => (
            <option key={team.id} value={team.id}>
              {showStaffFilters ? `${team.name} — ${team.schoolName}` : team.name}
            </option>
          ))}
        </select>

        <select
          value={filters.gender}
          onChange={(e) =>
            set({ gender: e.target.value as PlayerFilterState["gender"] })
          }
          className={inputCls}
        >
          <option value="all">{t("All Genders")}</option>
          <option value="boys">{t("Boys")}</option>
          <option value="girls">{t("Girls")}</option>
        </select>

        <div className="grid grid-cols-2 gap-3">
          <select
            value={filters.ageGroup}
            onChange={(e) => set({ ageGroup: e.target.value })}
            className={inputCls}
          >
            <option value="">{t("All Age Groups")}</option>
            <option value="U-14">U-14</option>
            <option value="U-17">U-17</option>
            <option value="U-19">U-19</option>
            <option value="Open">Open</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) =>
              set({ status: e.target.value as PlayerFilterState["status"] })
            }
            className={inputCls}
          >
            <option value="all">{t("All Status")}</option>
            <option value="active">{t("Active")}</option>
            <option value="inactive">{t("Inactive")}</option>
          </select>
        </div>
      </div>
    </div>
  );
};
