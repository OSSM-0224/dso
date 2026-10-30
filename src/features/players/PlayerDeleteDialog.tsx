"use client";
import React from "react";
import { Icon } from "@/components/ui/Icon.tsx";
import { useI18n } from "@/i18n/LanguageProvider.tsx";

interface PlayerDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  playerName: string;
}

export const PlayerDeleteDialog: React.FC<PlayerDeleteDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  playerName,
}) => {
  const { t } = useI18n();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">
            {t('Delete Player')}
          </h3>
          <button
            aria-label={t('Close')}
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
          >
            <Icon name="xmark" size="sm" align-middle />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <Icon name="alert-triangle" size="sm" className="text-red-600" />
            <div>
              <p className="text-sm text-red-800 font-medium">
                {t('Are you sure you want to delete this player?')}
              </p>
              <p className="text-xs text-red-700 mt-1">
                {t('This action cannot be undone.')}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-700">
            <span className="font-medium">Player:</span> {playerName}
          </p>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 text-xs text-slate-600 hover:text-slate-800 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 sm:py-2 min-h-[40px] sm:min-h-0 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm"
            >
              {t('Delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};