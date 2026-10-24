import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext.tsx';
import { UserRole } from '@/shared/types.ts';
import { Building2, LogOut } from 'lucide-react';

// NOTE: there is deliberately NO "School Login" button/modal in the DSO admin
// header — school login lives only at the standalone /school/login page.
export const Header: React.FC = () => {
  const { user, role, switchRole, signOut, isParticipant } = useAuth();
  const pathname = usePathname() || '/';

  const isOnTournaments = pathname === '/' || pathname.startsWith('/tournaments');
  const isOnTeams = pathname.startsWith('/teams');
  const isOnSchoolAccounts = pathname.startsWith('/school-accounts');
  const isOnHistory = pathname.startsWith('/past-champions');
  const isOnTesting = pathname.startsWith('/engine-tests');
  const isOnPortal = pathname.startsWith('/school');

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Brand Wordmark (Single text element, 1 line) */}
          <Link
            href={isParticipant ? '/school/dashboard' : '/'}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-indigo-600 transition-colors flex items-center gap-2"
          >
            <span>DSO Navi Mumbai</span>
            {isParticipant && (
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                Portal
              </span>
            )}
          </Link>

          {/* Zone 2: Navigation Links (plain <Link> so Next.js prefetches each page) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {isParticipant ? (
              <>
                <Link
                  href="/school/dashboard"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    isOnPortal ? 'text-indigo-600 font-bold' : ''
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>My School Matches</span>
                </Link>
                <Link
                  href="/"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnTournaments ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Public Tournaments
                </Link>
                <Link
                  href="/past-champions"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnHistory ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Past Champions
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnTournaments ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Tournaments
                </Link>
                <Link
                  href="/teams"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnTeams ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Teams & Schools
                </Link>
                <Link
                  href="/school-accounts"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    isOnSchoolAccounts ? 'text-indigo-600 font-semibold' : ''
                  }`}
                >
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  <span>School Accounts</span>
                </Link>
                <Link
                  href="/past-champions"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnHistory ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Past Champions
                </Link>
                <Link
                  href="/engine-tests"
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                    isOnTesting ? 'text-slate-900 font-semibold' : ''
                  }`}
                >
                  Engine Tests
                </Link>
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
                  onClick={() => signOut()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  title="Sign out of school portal"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5">
                  <select
                    value={role}
                    onChange={(e) => {
                      const val = e.target.value as UserRole;
                      if (val === 'participant') {
                        // School login lives on its own standalone page.
                        window.location.assign('/school/login');
                        return;
                      }
                      switchRole(val);
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
              <Link
                href="/school/dashboard"
                className={`py-1 ${isOnPortal ? 'text-indigo-600 font-semibold' : ''}`}
              >
                My Matches
              </Link>
              <Link
                href="/"
                className={`py-1 ${isOnTournaments ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Brackets
              </Link>
              <button onClick={() => signOut()} className="py-1 text-slate-500">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/" className={`py-1 ${isOnTournaments ? 'text-indigo-600 font-semibold' : ''}`}>
                Tournaments
              </Link>
              <Link href="/teams" className={`py-1 ${isOnTeams ? 'text-indigo-600 font-semibold' : ''}`}>
                Teams
              </Link>
              <Link
                href="/school-accounts"
                className={`py-1 ${isOnSchoolAccounts ? 'text-indigo-600 font-semibold' : ''}`}
              >
                Accounts
              </Link>
              <Link
                href="/past-champions"
                className={`py-1 ${isOnHistory ? 'text-indigo-600 font-semibold' : ''}`}
              >
                History
              </Link>
              <Link href="/school/login" className="py-1 text-indigo-600 font-bold">
                School Login
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
