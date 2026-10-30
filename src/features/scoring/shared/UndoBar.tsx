'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';

export const UndoBar: React.FC<{
  canUndo: boolean;
  onUndo: () => void;
  disabled?: boolean;
  label?: string;
}> = ({ canUndo, onUndo, disabled, label }) => {
  if (!canUndo) return null;
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors duration-200 hover:border-faint disabled:opacity-45"
    >
      <Icon name="rotateLeft" size="sm" />
      {label ?? 'Undo'}
    </button>
  );
};
