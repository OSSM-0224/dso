import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext.tsx';
import { UserRole } from '@/shared/types.ts';
import { Icon } from '@/components/ui/Icon.tsx';

/**
 * Slim top bar. The staff permissions-preview control (role switcher) is
 * deliberately tucked into a clearly-marked "Preview as staff" menu instead
 * of living permanently in the chrome.
 */
export const Header: React.FC = () => {
  const { user, role, canScore, switchRole } = useAuth();
  const pathname = usePathname() || '/';
  const [staffOpen, setStaffOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isParticipant = role === 'participant';
  const isOnTournaments = pathname === '/dashboard' || pathname.startsWith('/tournaments');
  const isOnTeams = pathname.startsWith('/teams');
  const isOnSchoolAccounts = pathname.startsWith('/school-accounts');
  const isOnHistory = pathname.startsWith('/past-champions');
  const isOnTesting = pathname.startsWith('/engine-tests');
  const isOnPortal = pathname.startsWith('/school');

  useEffect(() => {
    if (!staffOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStaffOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [staffOpen]);

  const handleRoleChange = (val: UserRole) => {
    setStaffOpen(false);
    if (val === 'participant') {
      // School login lives on its own standalone page.
      window.location.assign('/school/login');
      return;
    }
    switchRole(val);
  };

  const linkCls = (active: boolean) =>
    `relative rounded-[6px] px-2.5 py-1.5 text-[13px] transition-colors duration-200 ${
      active ? 'text-ink font-semibold bg-canvas' : 'text-muted hover:text-ink hover:bg-canvas/70'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link
          href={isParticipant ? '/school/dashboard' : '/dashboard'}
          className="flex shrink-0 items-baseline gap-2 rounded-[6px]"
        >
          <span className="font-serif text-[17px] font-semibold tracking-[-0.01em] text-ink">DSO Navi Mumbai</span>
          {isParticipant && (
            <span className="hidden sm:inline rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-accent-strong">
              Portal
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
          {isParticipant ? (
            <>
              <Link href="/school/dashboard" className={linkCls(isOnPortal)}>
                My school matches
              </Link>
              <Link href="/#tournaments" className={linkCls(pathname === '/')}>
                Public brackets
              </Link>
              <Link href="/past-champions" className={linkCls(isOnHistory)}>
                Past champions
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className={linkCls(isOnTournaments)}>
                Tournaments
              </Link>
              <Link href="/teams" className={linkCls(isOnTeams)}>
                Teams & schools
              </Link>
              <Link href="/school-accounts" className={linkCls(isOnSchoolAccounts)}>
                School accounts
              </Link>
              <Link href="/past-champions" className={linkCls(isOnHistory)}>
                Past champions
              </Link>
              <Link href="/engine-tests" className={linkCls(isOnTesting)}>
                Engine tests
              </Link>
            </>
          )}
        </nav>

        {/* Right: account chip / staff menu */}
        <div className="flex shrink-0 items-center gap-2">
          {isParticipant ? (
            <div className="hidden text-right sm:block">
              <p className="max-w-[180px] truncate text-xs font-semibold text-ink">
                {user?.schoolName || user?.name || 'Participant'}
              </p>
              {user?.schoolCode && (
                <p className="font-mono text-[10px] tabular-nums text-muted">{user.schoolCode}</p>
              )}
            </div>
          ) : (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setStaffOpen((v) => !v)}
                aria-expanded={staffOpen}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition-colors duration-200 hover:border-faint active:scale-[0.98]"
              >
                <span className="capitalize">{role}</span>
                <Icon name="chevronDown" size="sm" className={`text-muted transition-transform duration-200 ${staffOpen ? 'rotate-180' : ''}`} />
              </button>
              {staffOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-64 rounded-[12px] border border-hairline bg-surface p-1.5 shadow-raise"
                >
                  <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-faint">
                    Preview as staff
                  </p>
                  {(['admin', 'organizer', 'scorer', 'viewer', 'participant'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      role="menuitem"
                      onClick={() => handleRoleChange(r)}
                      className={`flex w-full items-center justify-between rounded-[6px] px-2.5 py-2 text-[13px] transition-colors duration-150 ${
                        r === role ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-ink hover:bg-canvas'
                      }`}
                    >
                      <span className="capitalize">{r === 'participant' ? 'Log in as school' : r}</span>
                      {r === role && <span aria-hidden="true">•</span>}
                    </button>
                  ))}
                  <div className="my-1 border-t border-hairline" />
                  {canScore && (
                    <Link
                      href="/score"
                      onClick={() => setStaffOpen(false)}
                      className={`flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-[13px] ${
                        role === 'scorer'
                          ? 'font-semibold text-accent-strong'
                          : 'text-muted hover:bg-canvas hover:text-ink'
                      }`}
                    >
                      <Icon name="bolt" size="sm" className="text-muted" />
                      Live scoring console
                    </Link>
                  )}
                  <Link
                    href="/school/login"
                    onClick={() => setStaffOpen(false)}
                    className="flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-[13px] text-muted hover:bg-canvas hover:text-ink"
                  >
                    <Icon name="school" size="sm" className="text-muted" />
                    School login page
                  </Link>
                  <Link
                    href="/engine-tests"
                    onClick={() => setStaffOpen(false)}
                    className="flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-[13px] text-muted hover:bg-canvas hover:text-ink"
                  >
                    <Icon name="flask" size="sm" className="text-muted" />
                    Engine tests
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
