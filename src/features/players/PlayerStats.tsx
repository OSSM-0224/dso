"use client";
import React from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { useI18n } from "@/i18n/LanguageProvider.tsx";

export interface PlayerStatsData {
  totalPlayers: number;
  activePlayers: number;
  inactivePlayers: number;
  totalTeams: number;
}

interface PlayerStatsProps {
  stats: PlayerStatsData;
}

export const PlayerStats: React.FC<PlayerStatsProps> = ({ stats }) => {
  const { t } = useI18n();

  const cards = [
    {
      label: t("Total Players"),
      value: stats.totalPlayers,
      icon: "users" as const,
      iconWrap: "bg-indigo-100",
      iconColor: "text-indigo-600",
    },
    {
      label: t("Active Players"),
      value: stats.activePlayers,
      icon: "circleCheck" as const,
      iconWrap: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      label: t("Inactive Players"),
      value: stats.inactivePlayers,
      icon: "xmark" as const,
      iconWrap: "bg-red-100",
      iconColor: "text-red-600",
    },
    {
      label: t("Total Teams"),
      value: stats.totalTeams,
      icon: "layers" as const,
      iconWrap: "bg-blue-100",
      iconColor: "text-blue-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${card.iconWrap} rounded-lg flex items-center justify-center`}>
              <Icon name={card.icon} size="sm" className={card.iconColor} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider truncate">
                {card.label}
              </p>
              <p className="text-xl font-bold text-slate-900">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
