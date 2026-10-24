'use client';

import React from 'react';
import { useParams } from 'next/navigation';

import { ParticipantPortalScreen } from '@/features/participant/ParticipantPortalScreen.tsx';

export default function SchoolMatchDetailPage() {
  const params = useParams<{ id: string }>();

  return <ParticipantPortalScreen initialTab="schedule" openMatchId={params.id} />;
}
