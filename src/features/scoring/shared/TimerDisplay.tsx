'use client';

import React from 'react';

export const TimerDisplay: React.FC<{
  value: string;
  paused?: boolean;
  className?: string;
}> = ({ value, paused, className }) => {
  return (
    <div className={`rounded-[10px] border border-hairline px-3 py-1 text-center font-mono text-lg font-semibold ${paused ? 'bg-amber-50 text-amber-900' : 'bg-surface text-ink'} ${className ?? ''}`}>
      {value}
    </div>
  );
};
