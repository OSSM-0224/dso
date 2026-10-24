import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext.tsx';
import { LogOut, Trophy, Users, ClipboardList, History, FlaskConical, Building2, Calendar, LogIn } from 'lucide-react';

/**
 * Fixed bottom navigation for small screens (top bar is a slimmer chrome
 * without nav). Thumb-friendly 44px+ targets.
 */
export const BottomNav: React.FC = () => {
  const { role, signOut } = useAuth();
  const pathname = usePathname() || '/';
  const isParticipant = role === 'participant';

  const isOnTournaments = pathname === '/' || pathname.startsWith('/tournaments');
  const isOnTeams = pathname.startsWith('/teams');
  const isOnSchoolAccounts = pathname.startsWith('/school-accounts');
  const isOnHistory = pathname.startsWith('/past-champions');
  const isOnTesting = pathname.startsWith('/engine-tests');
  const isOnPortal = pathname.startsWith('/school');

  const item = (active: boolean) =>
    `flex min-h-[48px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[8px] px-1 text-[10px] font-medium transition-colors duration-200 ${
      active ? 'text-accent-strong' : 'text-muted'
    }`;

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur-sm md:hidden"
    >
      <div className="mx-auto flex max-w-6xl gap-1 px-2 py-1 pb-[calc(4px+env(safe-area-inset-bottom))]">
        {isParticipant ? (
          <>
            <Link href="/school/dashboard" className={item(isOnPortal)}>
              <Calendar className="h-5 w-5" />
              Matches
            </Link>
            <Link href="/" className={item(isOnTournaments)}>
              <Trophy className="h-5 w-5" />
              Brackets
            </Link>
            <Link href="/past-champions" className={item(isOnHistory)}>
              <History className="h-5 w-5" />
              History
            </Link>
            <button onClick={() => signOut()} className={item(false)}>
              <LogOut className="h-5 w-5" />
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/" className={item(isOnTournaments)}>
              <Trophy className="h-5 w-5" />
              Tournaments
            </Link>
            <Link href="/teams" className={item(isOnTeams)}>
              <Users className="h-5 w-5" />
              Teams
            </Link>
            <Link href="/school-accounts" className={item(isOnSchoolAccounts)}>
              <ClipboardList className="h-5 w-5" />
              Accounts
            </Link>
            <Link href="/past-champions" className={item(isOnHistory)}>
              <History className="h-5 w-5" />
              History
            </Link>
            <Link href="/school/login" className={item(isOnPortal)}>
              <LogIn className="h-5 w-5" />
              School login
            </Link>
          </>
        )}
      </div>
    </nav>
  );
};
