'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { PublicTournamentPage } from '@/features/public/PublicTournamentPage.tsx';

export function PublicBracketView({
  id,
  payload,
}: {
  id: string;
  payload: Parameters<typeof PublicTournamentPage>[0]['initialData'];
}) {
  const router = useRouter();

  return (
    <PublicTournamentPage
      tournamentId={id}
      onBack={() => router.push('/')}
      initialData={payload}
    />
  );
}
