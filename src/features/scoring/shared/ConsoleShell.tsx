'use client';

import React from 'react';

export const ConsoleShell: React.FC<{
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}> = ({ header, children, footer, className }) => {
  return (
    <div className={`mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-4 ${className ?? ''}`}>
      {header}
      <div className="flex-1 space-y-4">{children}</div>
      {footer}
    </div>
  );
};
