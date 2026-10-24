'use client';

/**
 * Minimal dedicated chrome for the LIVE SCORER console (/score/*). This is a
 * standalone full-screen surface, deliberately OUTSIDE the (admin) shell: a
 * scorer must never see admin menus while recording events on the field.
 */
import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext.tsx';
import { Icon } from '@/components/ui/Icon.tsx';

export const ScorerShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-hairline bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
          <Link href="/score" className="flex items-center gap-2">
            <span className="font-serif text-[15px] font-semibold tracking-[-0.01em] text-ink">
              DSO Navi Mumbai
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-accent-strong">
              <Icon name="bolt" size="xs" />
              Live scorer
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-semibold text-ink">
                {user?.name || role}
              </span>
            </span>
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:border-faint"
            >
              <Icon name="rightFromBracket" size="sm" className="text-muted" />
              Exit
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-5">{children}</main>

      <footer className="hidden px-4 py-4 text-center text-[11px] text-faint sm:block">
        Server-authoritative scoring · all events validated by the Kho-Kho engine
      </footer>
    </div>
  );
};
