"use client";
import React from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { useI18n } from "@/i18n/LanguageProvider.tsx";
import { PlayerDoc } from "@/shared/types.ts";

interface PlayerTableProps {
  players: PlayerDoc[];
  canWrite: boolean;
  getTeamName: (teamId: string) => string;
  onEdit: (player: PlayerDoc) => void;
  onDelete: (player: PlayerDoc) => void;
  onToggleStatus: (player: PlayerDoc) => void;
}

const statusText = (isActive: boolean, t: (s: string) => string) =>
  isActive ? t("Active") : t("Inactive");

const statusCls = (isActive: boolean) =>
  isActive
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : "text-slate-600 bg-slate-100 border-slate-200";

const dobLabel = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

export const PlayerTable: React.FC<PlayerTableProps> = ({
  players,
  canWrite,
  getTeamName,
  onEdit,
  onDelete,
  onToggleStatus,
}) => {
  const { t } = useI18n();

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Player")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Jersey")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("School")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Team")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Gender")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Age Group")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("Status")}
              </th>
              {canWrite && (
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {t("Actions")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50 transition-colors duration-150">
                <td className="px-4 py-3">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full items-center justify-center mr-3 hidden sm:flex">
                      <Icon name="user" size="sm" className="text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate max-w-[180px]">
                        {player.name}
                      </div>
                      {player.dateOfBirth && (
                        <div className="text-[11px] text-slate-500">
                          {t("Born")} {dobLabel(player.dateOfBirth)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono font-semibold text-slate-900 tabular-nums">
                  {player.jerseyNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[140px] truncate">
                  {player.schoolName || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">
                  {getTeamName(player.teamId) || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {player.gender ? t(player.gender === "boys" ? "Boys" : "Girls") : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {player.ageGroup || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-full border ${statusCls(
                      player.isActive,
                    )}`}
                  >
                    {statusText(player.isActive, t)}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => onToggleStatus(player)}
                        className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
                        title={player.isActive ? t("Deactivate") : t("Activate")}
                      >
                        {player.isActive ? t("Deactivate") : t("Activate")}
                      </button>
                      <button
                        onClick={() => onEdit(player)}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                        title={t("Edit")}
                      >
                        {t("Edit")}
                      </button>
                      <button
                        onClick={() => onDelete(player)}
                        className="text-[11px] font-medium text-red-600 hover:text-red-800"
                        title={t("Delete")}
                      >
                        {t("Delete")}
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
  );
};
