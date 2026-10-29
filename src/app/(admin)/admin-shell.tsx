'use client';

/**
 * Client shell for the DSO admin/organizer route group. Reproduces the old
 * App.tsx behaviour on top of Next.js routing:
 *  - holds the admin "View as School" preview state (renders SchoolPortalLayout
 *    while active, exactly like App.tsx did),
 *  - swaps the whole shell to the participant portal when the visitor holds a
 *    real participant session.
 * NOTE: school login is NOT offered from the admin shell — it lives only at
 * /school/login (standalone page with its own layout).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext.tsx';
import { Header } from '@/components/layout/Header.tsx';
import { BottomNav } from '@/components/layout/BottomNav.tsx';
import { SchoolPortalLayout } from '@/features/participant/SchoolPortalLayout.tsx';
import { ForcePasswordChangeModal } from '@/features/participant/ForcePasswordChangeModal.tsx';
import { api } from '@/lib/api.ts';
import { useI18n } from '@/i18n/LanguageProvider.tsx';
import { SchoolDoc } from '@/shared/types.ts';

interface AdminPreviewSchool {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
}

interface AdminPortalContextValue {
  /** Old `onOpenPublicView`: "@/public/tournaments/<id>" pages. */
  openPublicView: (id: string) => void;
  /** Old ParticipantAccountsPanel "View as School". */
  viewAsSchool: (acc: AdminPreviewSchool) => void;
  exitAdminPreview: () => void;
  /** Refreshable schools list shared with the school-accounts page. */
  schools: SchoolDoc[];
  reloadSchools: () => void;
}

const AdminPortalContext = createContext<AdminPortalContextValue | undefined>(undefined);

export function useAdminPortal() {
  const ctx = useContext(AdminPortalContext);
  if (!ctx) throw new Error('useAdminPortal must be used within AdminShell');
  return ctx;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { canWrite, isParticipant } = useAuth();
  const { t } = useI18n();

  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [adminPreviewSchool, setAdminPreviewSchool] = useState<AdminPreviewSchool | null>(null);

  useEffect(() => {
    api.schools
      .list()
      .then(setSchools)
      .catch(() => {
        // ignore (same as old App.tsx)
      });
  }, []);

  const openPublicView = useCallback(
    (id: string) => {
      router.push(`/public/tournaments/${id}`);
    },
    [router]
  );

  const viewAsSchool = useCallback((acc: AdminPreviewSchool) => {
    setAdminPreviewSchool(acc);
  }, []);

  const exitAdminPreview = useCallback(() => {
    setAdminPreviewSchool(null);
  }, []);

  const reloadSchools = useCallback(async () => {
    try {
      const list = await api.schools.list();
      setSchools(list);
    } catch {
      // ignore
    }
  }, []);

  const contextValue = useMemo<AdminPortalContextValue>(
    () => ({
      openPublicView,
      viewAsSchool,
      exitAdminPreview,
      schools,
      reloadSchools,
    }),
    [openPublicView, viewAsSchool, exitAdminPreview, schools, reloadSchools]
  );

  // In school participant mode or admin "View as School" preview mode the
  // admin chrome is replaced by the school portal (identical to App.tsx).
  if (isParticipant || adminPreviewSchool) {
    return (
      <AdminPortalContext.Provider value={contextValue}>
        <SchoolPortalLayout
          adminPreviewSchool={adminPreviewSchool}
          onExitAdminPreview={exitAdminPreview}
          onOpenPublicBracket={openPublicView}
        />
        <ForcePasswordChangeModal />
      </AdminPortalContext.Provider>
    );
  }

  return (
    <AdminPortalContext.Provider value={contextValue}>
      {/* Skip-to-content for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-[6px] focus:bg-ink focus:px-3 focus:py-1.5 focus:text-xs focus:text-white"
      >
        {t("Skip to content")}
      </a>

      <div className="min-h-[100dvh] flex flex-col bg-canvas font-sans">
        <Header />

        <main id="main-content" className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-4 py-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-8 lg:px-8">
          {children}
        </main>

        {/* Mandatory Password Change on First Login */}
        <ForcePasswordChangeModal />

        <footer className="hidden border-t border-hairline py-5 text-center text-xs text-faint md:block">
          <div className="mx-auto max-w-6xl px-4">
            {t("District Sports Office (DSO) Navi Mumbai · Fixture administration platform")}
          </div>
        </footer>

        <BottomNav />
      </div>
    </AdminPortalContext.Provider>
  );
}
