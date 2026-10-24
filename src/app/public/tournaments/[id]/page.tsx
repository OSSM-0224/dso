import type { Metadata } from 'next';

import { PublicBracketView } from './public-bracket-view';
import {
  getSanitizedPublicTournamentPayload,
} from '@/server/controllers/publicTournamentController';
import { TournamentDoc } from '@/shared/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Revalidate the public bracket on a short interval.
export const revalidate = 30;

async function loadPayload(id: string) {
  try {
    return await getSanitizedPublicTournamentPayload(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const payload = await loadPayload(id);
  const tournament = (payload?.tournament ?? null) as TournamentDoc | null;

  if (!tournament) {
    return {
      title: 'Tournament not found · DSO Navi Mumbai Fixtures',
      description:
        'Official fixture draw from the District Sports Office (DSO) Navi Mumbai.',
    };
  }

  return {
    title: `${tournament.name} · DSO Navi Mumbai Fixtures`,
    description: `Official fixture draw for the DSO Navi Mumbai ${tournament.sport} ${tournament.ageGroup} ${tournament.gender} tournament (${tournament.year}).`,
  };
}

export default async function PublicTournamentRoute({ params }: PageProps) {
  const { id } = await params;
  const payload = await loadPayload(id);

  // Unpublished / unknown tournament: the client component loads the exact
  // same error state the old client-only page displayed.
  return (
    <div className="min-h-screen bg-slate-50">
      <PublicBracketView id={id} payload={payload} />
    </div>
  );
}
