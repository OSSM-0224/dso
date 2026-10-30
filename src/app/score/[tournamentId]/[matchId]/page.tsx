'use client';

/**
 * Sport console — the tournament-scoped host mounts the registry Console for
 * `tournament.sport`. Remounted per `tournamentId:matchId` (spec §5).
 */
import React from 'react';
import { useParams } from 'next/navigation';
import { ScoringConsoleHost } from '@/features/scoring/console/ScoringConsoleHost.tsx';

export default function ScoreConsolePage() {
  const params = useParams<{ tournamentId: string; matchId: string }>();
  return <ScoringConsoleHost tournamentId={params.tournamentId} matchId={params.matchId} />;
}
