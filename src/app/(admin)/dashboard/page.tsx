'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { TournamentsListScreen } from '@/features/tournaments/TournamentsListScreen.tsx';
import { useAuth } from '@/context/AuthContext.tsx';

export default function TournamentsPage() {
  const router = useRouter();
  const { canWrite, isParticipant } = useAuth();

  // Old App.tsx forced the participant-portal tab on participant login; the
  // school routes serve that role now.
  useEffect(() => {
    if (isParticipant) {
      router.replace('/school/dashboard');
    }
  }, [isParticipant, router]);

  return (
    <TournamentsListScreen
      onSelectTournament={(id) => router.push(`/tournaments/${id}`)}
      canWrite={canWrite}
    />
  );
}
