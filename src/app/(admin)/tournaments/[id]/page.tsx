'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';

import { TournamentDetailScreen } from '@/features/tournaments/TournamentDetailScreen.tsx';
import { useAuth } from '@/context/AuthContext.tsx';
import { useAdminPortal } from '../../admin-shell';

export default function TournamentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { canWrite } = useAuth();
  const { openPublicView } = useAdminPortal();

  return (
    <TournamentDetailScreen
      tournamentId={params.id}
      onBack={() => router.push('/')}
      canWrite={canWrite}
      onOpenPublicView={(publicId) => openPublicView(publicId)}
    />
  );
}
