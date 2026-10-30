'use client';

import React from 'react';

export const ScoreHeader: React.FC<{
  left: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ left, center, right }) => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-hairline bg-surface px-3 py-2 shadow-raise sm:px-4">
      <div className="flex items-center gap-2">{left}</div>
      {center ? <div className="flex flex-1 items-center justify-center text-center">{center}</div> : <div className="flex-1" />}
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
};
