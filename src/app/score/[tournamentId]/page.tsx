'use client';

/**
 * Tournament scoring hub — ONE hub per tournament (spec §4). The hub only
 * ever renders matches from THIS tournament (server-side scoped query).
 */
import React from 'react';
import { useParams } from 'next/navigation';
import { ScoringTournamentHub } from '@/features/scoring/ScoringTournamentHub.tsx';

export default function TournamentScoringHubPage() {
  const params = useParams<{ tournamentId: string }>();
  return <ScoringTournamentHub tournamentId={params.tournamentId} />;
}
