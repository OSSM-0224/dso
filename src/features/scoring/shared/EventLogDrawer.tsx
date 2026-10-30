'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';

export const EventLogDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg rounded-t-[16px] bg-surface shadow-raise sm:rounded-[16px]">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Event log</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-muted hover:text-ink">
            <Icon name="x" size="sm" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
};
