'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon.tsx';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher.tsx';
import { useI18n } from '@/i18n/LanguageProvider.tsx';

const links = [
  { href: '#platform', label: 'Platform' },
  { href: '#roles', label: 'Roles' },
  { href: '#tournaments', label: 'Fixtures' },
  { href: '#process', label: 'How it works' },
];

export const LandingNav: React.FC = () => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 sm:gap-4 px-2 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-[6px] min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-accent text-white shadow-rest">
            <Icon name="trophy" size="sm" />
          </span>
          <span className="leading-tight min-w-0">
            <span className="block font-serif text-[16px] sm:text-[17px] font-semibold tracking-[-0.01em] text-ink truncate">
              DSO Navi Mumbai
            </span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted sm:block">
              {t("Official fixtures desk")}
            </span>
          </span>
        </Link>

        <nav aria-label={t("Primary")} className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative py-1 text-[13px] font-medium text-muted transition-colors duration-200 after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-accent after:transition-all after:duration-200 hover:text-ink hover:after:w-full"
            >
              {t(link.label)}
            </a>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <Link
            href="/school/login"
            className="rounded-[6px] px-2.5 py-2 text-[13px] font-medium text-muted transition-colors duration-200 hover:bg-surface hover:text-ink"
          >
            {t("School sign in")}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[6px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white shadow-rest transition-all duration-200 hover:bg-accent-strong active:scale-[0.98]"
          >
            {t("Organizer console")}
            <Icon name="arrowRight" size="xs" />
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher compact />
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? t('Close menu') : t('Open menu')}
            className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-hairline bg-surface text-ink transition-colors duration-200 hover:border-faint active:scale-[0.98]"
          >
            <Icon name={open ? 'xmark' : 'bars'} size="md" />
          </button>

          {open && (
            <div
              id="landing-mobile-menu"
              className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[12px] border border-hairline bg-canvas shadow-raise"
            >
              <nav aria-label={t("Mobile")} className="p-2">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-[6px] px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface"
                  >
                    {t(link.label)}
                  </a>
                ))}
                <div className="my-2 border-t border-hairline" />
                <Link
                  href="/school/login"
                  onClick={() => setOpen(false)}
                  className="block rounded-[6px] px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface"
                >
                  {t("School sign in")}
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="mt-1 flex min-h-[44px] items-center justify-between gap-2 rounded-[6px] bg-accent px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-strong"
                >
                  {t("Organizer console")}
                  <Icon name="arrowRight" size="sm" />
                </Link>
              </nav>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
};
