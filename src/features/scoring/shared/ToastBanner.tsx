'use client';

import React from 'react';
import { Icon } from '@/components/ui/Icon.tsx';

export const ToastBanner: React.FC<{
  tone: 'error' | 'info' | 'success';
  text: string;
  onDismiss?: () => void;
}> = ({ tone, text, onDismiss }) => {
  const toneClass =
    tone === 'error'
      ? 'bg-red-50 text-red-700'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-canvas text-ink';
  return (
    <div className={`flex items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-xs font-medium ${toneClass}`}>
      <div className="flex items-center gap-1.5">
        <Icon name={tone === 'error' ? 'circleAlert' : tone === 'success' ? 'circleCheck' : 'info'} size="sm" />
        <span>{text}</span>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="rounded-full p-1">
          <Icon name="x" size="xs" />
        </button>
      ) : null}
    </div>
  );
};
