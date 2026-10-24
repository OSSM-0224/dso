/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { TournamentsListScreen } from './features/tournaments/TournamentsListScreen.tsx';
import { TournamentDetailScreen } from './features/tournaments/TournamentDetailScreen.tsx';
import { TeamsScreen } from './features/teams/TeamsScreen.tsx';
import { PastTournamentsScreen } from './features/history/PastTournamentsScreen.tsx';
import { EngineTestSuiteScreen } from './features/testing/EngineTestSuiteScreen.tsx';
import { PublicTournamentPage } from './features/public/PublicTournamentPage.tsx';
import { ParticipantPortalScreen } from './features/participant/ParticipantPortalScreen.tsx';
import { SchoolPortalLayout } from './features/participant/SchoolPortalLayout.tsx';
import { SchoolLoginModal } from './features/participant/SchoolLoginModal.tsx';
import { ForcePasswordChangeModal } from './features/participant/ForcePasswordChangeModal.tsx';
import { ParticipantAccountsPanel } from './features/admin/ParticipantAccountsPanel.tsx';
import { api } from './lib/api.ts';
import { SchoolDoc } from '../shared/types.ts';

function MainContent() {
  const { role, canWrite, isParticipant } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('tournaments');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [publicTournamentId, setPublicTournamentId] = useState<string | null>(null);
  const [showSchoolLoginModal, setShowSchoolLoginModal] = useState<boolean>(false);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [adminPreviewSchool, setAdminPreviewSchool] = useState<{
    schoolId: string;
    schoolName: string;
    schoolCode: string;
  } | null>(null);

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const list = await api.schools.list();
      setSchools(list);
    } catch {
      // ignore
    }
  };

  // Sync tab with participant login state
  useEffect(() => {
    if (isParticipant) {
      setCurrentTab('participant-portal');
    } else if (currentTab === 'participant-portal') {
      setCurrentTab('tournaments');
    }
  }, [isParticipant]);

  // Check URL query parameters for public share link: ?public=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pubId = params.get('public');
    if (pubId) {
      setPublicTournamentId(pubId);
      setCurrentTab('public-view');
    }
  }, []);

  const handleOpenPublicView = (id: string) => {
    setPublicTournamentId(id);
    setCurrentTab('public-view');
    window.history.pushState({}, '', `?public=${id}`);
  };

  const handleExitPublicView = () => {
    setPublicTournamentId(null);
    setCurrentTab(isParticipant ? 'participant-portal' : 'tournaments');
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'tournaments') {
      setSelectedTournamentId(null);
    }
    setCurrentTab(tab);
  };

  // If in public share view mode
  if (currentTab === 'public-view' && publicTournamentId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicTournamentPage
          tournamentId={publicTournamentId}
          onBack={handleExitPublicView}
        />
      </div>
    );
  }

  // If in school participant mode or admin "View as School" preview mode
  if (isParticipant || adminPreviewSchool) {
    return (
      <>
        <SchoolPortalLayout
          adminPreviewSchool={adminPreviewSchool}
          onExitAdminPreview={() => setAdminPreviewSchool(null)}
          onOpenPublicBracket={handleOpenPublicView}
        />
        <ForcePasswordChangeModal />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onOpenSchoolLogin={() => setShowSchoolLoginModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Public & Organizer Views */}
        {currentTab === 'tournaments' && !selectedTournamentId && (
          <TournamentsListScreen
            onSelectTournament={(id) => {
              setSelectedTournamentId(id);
              setCurrentTab('tournament-detail');
            }}
            canWrite={canWrite}
          />
        )}

        {currentTab === 'tournament-detail' && selectedTournamentId && (
          <TournamentDetailScreen
            tournamentId={selectedTournamentId}
            onBack={() => {
              setSelectedTournamentId(null);
              setCurrentTab('tournaments');
            }}
            canWrite={canWrite}
            onOpenPublicView={handleOpenPublicView}
          />
        )}

        {currentTab === 'teams' && <TeamsScreen canWrite={canWrite} />}

        {currentTab === 'school-accounts' && (
          <ParticipantAccountsPanel
            schools={schools}
            onAccountCreated={loadSchools}
            onViewAsSchool={(acc) =>
              setAdminPreviewSchool({
                schoolId: acc.schoolId,
                schoolName: acc.schoolName,
                schoolCode: acc.schoolCode,
              })
            }
          />
        )}

        {currentTab === 'history' && <PastTournamentsScreen canWrite={canWrite} />}

        {currentTab === 'testing' && <EngineTestSuiteScreen />}
      </main>

      {/* School Login Modal */}
      <SchoolLoginModal
        isOpen={showSchoolLoginModal}
        onClose={() => setShowSchoolLoginModal(false)}
        onSuccess={() => setCurrentTab('participant-portal')}
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
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
