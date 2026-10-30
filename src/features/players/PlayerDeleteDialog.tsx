"use client";
import React from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { useI18n } from "@/i18n/LanguageProvider.tsx";

interface PlayerDeleteDialogProps {
  isOpen: boolean;
  isDeleting?: boolean;
  playerName: string;
  teamName?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const PlayerDeleteDialog: React.FC<PlayerDeleteDialogProps> = ({
  isOpen,
  isDeleting = false,
  playerName,
  teamName,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 sm:p-6 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            {t("Delete Player")}
          </h3>
          <button
            aria-label={t("Close")}
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>

        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <Icon name="triangleExclamation" size="md" className="text-red-600" />
          <div>
            <p className="text-sm text-red-800 font-medium">
              {t('Delete "{name}" from the roster?', { name: playerName })}
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              {t(
                "This removes the player permanently. Linked team selection and future match data will not include them.",
              )}
            </p>
            {teamName && (
              <p className="text-xs text-slate-600 mt-1">
                {t("Team")}: <span className="font-semibold">{teamName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3 py-2.5 sm:py-1.5 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? t("Deleting...") : t("Delete Player")}
          </button>
        </div>
      </div>
    </div>
  );
};
