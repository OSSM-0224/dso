'use client';

/**
 * Dedicated school participant portal. No DSO admin menu — this portal has
 * its own layout (SchoolPortalLayout), exactly like the old SPA swap.
 */
import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { SchoolPortalLayout } from '@/features/participant/SchoolPortalLayout.tsx';

export default function SchoolGroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';

  return (
    <div className="min-h-screen bg-slate-50">
      <SchoolPortalLayout
        currentPath={pathname}
        onNavigatePath={(path) => router.push(path)}
        onOpenPublicBracket={(tournamentId) => router.push(`/public/tournaments/${tournamentId}`)}
      >
        {children}
      </SchoolPortalLayout>
    </div>
  );
}
