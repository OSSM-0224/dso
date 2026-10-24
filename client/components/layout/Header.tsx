import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { UserRole } from '../../../shared/types.ts';
import { Building2, LogOut, KeyRound } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenSchoolLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  onOpenSchoolLogin,
}) => {
  const { user, role, switchRole, signOut, isParticipant } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Brand Wordmark (Single text element, 1 line) */}
          <button
            onClick={() => onTabChange(isParticipant ? 'participant-portal' : 'tournaments')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-indigo-600 transition-colors flex items-center gap-2"
          >
            <span>DSO Navi Mumbai</span>
            {isParticipant && (
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                Portal
              </span>
            )}
          </button>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {isParticipant ? (
              <>
                <button
                  onClick={() => onTabChange('participant-portal')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    currentTab === 'participant-portal' ? 'text-indigo-600 font-bold' : ''
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>My School Matches</span>
                </button>
                <button
                  onClick={() => onTabChange('tournaments')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'tournaments' || currentTab === 'tournament-detail'
                      ? 'text-slate-900 font-semibold'
                      : ''
                  }`}
                >
                  Public Tournaments
                </button>
                <button
                  onClick={() => onTabChange('history')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'history' ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Past Champions
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onTabChange('tournaments')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'tournaments' || currentTab === 'tournament-detail'
                      ? 'text-slate-900 font-semibold'
                      : ''
                  }`}
                >
                  Tournaments
                </button>
                <button
                  onClick={() => onTabChange('teams')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'teams' ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Teams & Schools
                </button>
                <button
                  onClick={() => onTabChange('school-accounts')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    currentTab === 'school-accounts' ? 'text-indigo-600 font-semibold' : ''
                  }`}
                >
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  <span>School Accounts</span>
                </button>
                <button
                  onClick={() => onTabChange('history')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'history' ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Past Champions
                </button>
                <button
                  onClick={() => onTabChange('testing')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    currentTab === 'testing' ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Engine Tests
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Role Switcher & School Login */}
          <div className="flex items-center gap-3 shrink-0">
            {isParticipant ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-bold text-slate-900 truncate max-w-[160px]">
                    {user?.schoolName || user?.name}
                  </p>
                  <p className="text-[10px] text-indigo-600 font-mono font-semibold">
                    {user?.schoolCode ? `Code: ${user.schoolCode}` : 'Participant'}
                  </p>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  title="Sign out of school portal"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenSchoolLogin}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg shadow-2xs transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>School Login</span>
                </button>

                <div className="hidden sm:flex items-center gap-1.5">
                  <select
                    value={role}
                    onChange={(e) => {
                      const val = e.target.value as UserRole;
                      if (val === 'participant') {
                        onOpenSchoolLogin();
                      } else {
                        switchRole(val);
                      }
                    }}
                    className="text-xs font-medium bg-slate-100 border border-slate-200 text-slate-800 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Switch user role for permissions testing"
                  >
                    <option value="organizer">Organizer (Write)</option>
                    <option value="admin">Admin (Full)</option>
                    <option value="viewer">Public Viewer (Read-only)</option>
                    <option value="participant">School Participant (Login)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100 text-xs font-medium text-slate-600">
          {isParticipant ? (
            <>
              <button
                onClick={() => onTabChange('participant-portal')}
                className={`py-1 ${currentTab === 'participant-portal' ? 'text-indigo-600 font-semibold' : ''}`}
              >
                My Matches
              </button>
              <button
                onClick={() => onTabChange('tournaments')}
                className={`py-1 ${currentTab.startsWith('tournament') ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Brackets
              </button>
              <button
                onClick={signOut}
                className="py-1 text-slate-500"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onTabChange('tournaments')}
                className={`py-1 ${currentTab.startsWith('tournament') ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Tournaments
              </button>
              <button
                onClick={() => onTabChange('teams')}
                className={`py-1 ${currentTab === 'teams' ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Teams
              </button>
              <button
                onClick={() => onTabChange('school-accounts')}
                className={`py-1 ${currentTab === 'school-accounts' ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Accounts
              </button>
              <button
                onClick={() => onTabChange('history')}
                className={`py-1 ${currentTab === 'history' ? 'text-indigo-600 font-semibold' : ''}`}
              >
                History
              </button>
              <button
                onClick={onOpenSchoolLogin}
                className="py-1 text-indigo-600 font-bold"
              >
                School Login
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
