'use client';

/**
 * Client shell for the DSO admin/organizer route group. Reproduces the old
 * App.tsx behaviour on top of Next.js routing:
 *  - holds the School Login modal state,
 *  - holds the admin "View as School" preview state (renders SchoolPortalLayout
 *    while active, exactly like App.tsx did),
 *  - swaps the whole shell to the participant portal when the visitor holds a
 *    real participant session.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext.tsx';
import { Header } from '@/components/layout/Header.tsx';
import { SchoolPortalLayout } from '@/features/participant/SchoolPortalLayout.tsx';
import { ForcePasswordChangeModal } from '@/features/participant/ForcePasswordChangeModal.tsx';
import { SchoolLoginModal } from '@/features/participant/SchoolLoginModal.tsx';
import { api } from '@/lib/api.ts';
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
  const { role, canWrite, isParticipant } = useAuth();
  void role;

  const [showSchoolLoginModal, setShowSchoolLoginModal] = useState<boolean>(false);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [adminPreviewSchool, setAdminPreviewSchool] = useState<AdminPreviewSchool | null>(null);

  useEffect(() => {
    const loadSchools = async () => {
      try {
        const list = await api.schools.list();
        setSchools(list);
      } catch {
        // ignore (same as old App.tsx)
      }
    };
    loadSchools();
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

  const contextValue: AdminPortalContextValue = {
    openPublicView,
    viewAsSchool,
    exitAdminPreview,
    schools,
    reloadSchools,
  };

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
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Header onOpenSchoolLogin={() => setShowSchoolLoginModal(true)} />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* School Login Modal */}
        <SchoolLoginModal
          isOpen={showSchoolLoginModal}
          onClose={() => setShowSchoolLoginModal(false)}
          onSuccess={() => {
            setShowSchoolLoginModal(false);
          }}
        />

        {/* Mandatory Password Change on First Login */}
        <ForcePasswordChangeModal />

        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              District Sports Office (DSO) Navi Mumbai · Multi-Sport Fixture Administration Platform
            </div>
            <div className="text-[11px] text-slate-400">
              Participant Portal & Match Isolation Active
            </div>
          </div>
        </footer>
      </div>
    </AdminPortalContext.Provider>
  );
}
