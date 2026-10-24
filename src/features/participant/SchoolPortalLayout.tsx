import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon.tsx';
import { useAuth } from '@/context/AuthContext.tsx';
import { ParticipantPortalScreen } from './ParticipantPortalScreen.tsx';

interface SchoolPortalLayoutProps {
  currentPath?: string;
  onNavigatePath?: (path: string) => void;
  adminPreviewSchool?: { schoolId: string; schoolName: string; schoolCode: string } | null;
  onExitAdminPreview?: () => void;
  onOpenPublicBracket?: (tournamentId: string) => void;
  /** Portal main content (defaults to the full ParticipantPortalScreen). */
  children?: React.ReactNode;
}

export const SchoolPortalLayout: React.FC<SchoolPortalLayoutProps> = ({
  currentPath = '/school/dashboard',
  onNavigatePath,
  adminPreviewSchool,
  onExitAdminPreview,
  onOpenPublicBracket,
  children,
}) => {
  const { user, signOut } = useAuth();

  const isPreview = Boolean(adminPreviewSchool);
  const activeSchoolName = adminPreviewSchool?.schoolName || user?.schoolName || user?.name || 'School Portal';
  const activeSchoolCode = adminPreviewSchool?.schoolCode || user?.schoolCode || 'DSO-PART';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* 1. Admin Preview Mode Banner */}
      {isPreview && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-600 shadow-xs z-50">
          <div className="flex items-center gap-2">
            <Icon name="eye" size="md" className="text-slate-950 animate-pulse" />
            <span>
              ADMIN PREVIEW: Viewing portal strictly as "{activeSchoolName}" (Code: {activeSchoolCode}). All organizer data & other schools are hidden.
            </span>
          </div>
          {onExitAdminPreview && (
            <button
              onClick={onExitAdminPreview}
              className="px-2.5 py-1 bg-slate-950 text-white rounded-md text-[11px] font-semibold hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <Icon name="xmark" size="sm" />
              <span>Exit Preview & Return to Admin</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Dedicated School Portal Header (No DSO admin tabs, no role switcher) */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            {/* Wordmark */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-xs">
                <Icon name="school" size="lg" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight text-slate-900 block leading-tight">
                  DSO Navi Mumbai
                </span>
                <span className="text-[10px] font-semibold text-indigo-700 tracking-wider uppercase block">
                  Participating School Portal
                </span>
              </div>
            </div>

            {/* School Identity Badge */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                  {activeSchoolName}
                </p>
                <span className="inline-block text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                  Code: {activeSchoolCode}
                </span>
              </div>

              {!isPreview && (
                <button
                  onClick={signOut}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <Icon name="rightFromBracket" size="sm" className="text-slate-500" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children ?? <ParticipantPortalScreen onOpenPublicBracket={onOpenPublicBracket} />}
      </main>

      {/* School Portal Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            District Sports Office (DSO) Navi Mumbai · School Participant Match Portal
          </div>
          <div className="text-[11px] text-slate-400">
            Strict Single-School Isolation Active · Official Match Schedule
          </div>
        </div>
      </footer>
    </div>
  );
};
