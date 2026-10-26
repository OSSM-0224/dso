import type { Metadata } from 'next';

import { LandingPage } from '@/features/landing/LandingPage.tsx';
import type {
  LandingChampion,
  LandingTournament,
} from '@/features/landing/LandingPage.tsx';
import { pastTournamentRepository } from '@/server/repositories/pastTournamentRepository.ts';
import { schoolRepository } from '@/server/repositories/schoolRepository.ts';
import { teamRepository } from '@/server/repositories/teamRepository.ts';
import { tournamentService } from '@/server/services/tournamentService.ts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DSO Navi Mumbai · Official school sports fixtures',
  description:
    'Balanced single-elimination fixtures, public brackets, and live scoring for District Sports Office Navi Mumbai school tournaments.',
};

const PUBLIC_STATUSES = new Set(['published', 'ongoing', 'completed']);

function statusRank(status: string) {
  if (status === 'ongoing') return 0;
  if (status === 'published') return 1;
  return 2;
}

export default async function HomePage() {
  let tournaments: LandingTournament[] = [];
  let champions: LandingChampion[] = [];
  let counts = { schools: 0, teams: 0 };

  try {
    const [allTournaments, allChampions, schools, teams] = await Promise.all([
      tournamentService.getAll(),
      pastTournamentRepository.findAll(),
      schoolRepository.findAll(),
      teamRepository.findAll(),
    ]);

    tournaments = allTournaments
      .filter((tournament) => PUBLIC_STATUSES.has(tournament.status))
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          b.year - a.year ||
          b.createdAt.localeCompare(a.createdAt)
      )
      .slice(0, 3)
      .map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        sport: tournament.sport,
        ageGroup: tournament.ageGroup,
        gender: tournament.gender,
        year: tournament.year,
        status: tournament.status,
        teamCount: tournament.teams.length,
      }));

    champions = allChampions.slice(0, 3).map((champion) => ({
      id: champion.id,
      name: champion.name,
      year: champion.year,
      sport: champion.sport,
      ageGroup: champion.ageGroup,
      gender: champion.gender,
      winnerTeamName: champion.winnerTeamName,
      schoolName: champion.schoolName,
    }));

    counts = {
      schools: schools.length,
      teams: teams.length,
    };
  } catch {
    // The public landing page still renders if the store is unavailable.
  }

  return (
    <LandingPage
      tournaments={tournaments}
      champions={champions}
      counts={counts}
    />
  );
}
