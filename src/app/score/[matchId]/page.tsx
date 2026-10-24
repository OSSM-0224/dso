'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ScorerConsoleScreen } from '@/features/scoring/ScorerConsoleScreen.tsx';

export default function ScoreMatchConsolePage() {
  const params = useParams<{ matchId: string }>();
  return <ScorerConsoleScreen matchId={params.matchId} />;
}
