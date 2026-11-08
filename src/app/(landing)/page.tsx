import type { Metadata } from 'next';

import { LandingPage } from '@/features/landing/LandingPage.tsx';
import type {
  LandingChampion,
  LandingLiveMatch,
  LandingTournament,
} from '@/features/landing/LandingPage.tsx';
import { matchRepository } from '@/server/repositories/matchRepository.ts';
import { pastTournamentRepository } from '@/server/repositories/pastTournamentRepository.ts';
import { schoolRepository } from '@/server/repositories/schoolRepository.ts';
import { teamRepository } from '@/server/repositories/teamRepository.ts';
import { scoringService } from '@/server/services/scoringService.ts';
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
  if (status === 'fixtures-generated') return 2;
  if (status === 'draft') return 3;
  return 4;
}

export default async function HomePage() {
  let tournaments: LandingTournament[] = [];
  let champions: LandingChampion[] = [];
  let liveMatches: LandingLiveMatch[] = [];
  let counts = { schools: 0, teams: 0 };

  try {
    const [allTournaments, allChampions, schools, teams, allMatches] =
      await Promise.all([
        tournamentService.getAll(),
        pastTournamentRepository.findAll(),
        schoolRepository.findAll(),
        teamRepository.findAll(),
        matchRepository.findAll(),
      ]);

    // The public board lists every tournament, including drafts whose draw has
    // not been generated yet. Those cards stay unlinked and are labelled as
    // pending; fixture data is still withheld until the draw is published.
    const tournamentById = new Map(
      allTournaments.map((tournament) => [tournament.id, tournament])
    );

    tournaments = allTournaments
      .slice()
      .sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          b.year - a.year ||
          b.createdAt.localeCompare(a.createdAt)
      )
      .slice(0, 6)
      .map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        sport: tournament.sport,
        ageGroup: tournament.ageGroup,
        gender: tournament.gender,
        year: tournament.year,
        status: tournament.status,
        teamCount: tournament.teams.length,
        drawPublished: PUBLIC_STATUSES.has(tournament.status),
      }));

    const liveCandidates = allMatches
      .filter((match) => {
        if (match.status !== 'live' || match.isBye || !match.teamA || !match.teamB) {
          return false;
        }
        const tournament = tournamentById.get(match.tournamentId);
        // Live fixtures stay private until their tournament's draw is public.
        return Boolean(tournament && PUBLIC_STATUSES.has(tournament.status));
      })
      .sort((a, b) => {
        const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
        const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
        return timeA - timeB || a.matchNumber - b.matchNumber;
      })
      .slice(0, 6);

    liveMatches = await Promise.all(
      liveCandidates.map(async (match) => {
        const tournament = tournamentById.get(match.tournamentId)!;
        let scoreState: LandingLiveMatch['scoreState'] = 'starting';

        // A live fixture can exist without a readable score (scoring not started,
        // or an older score session that can no longer be replayed). Probe once
        // on the server so the client never mounts a poller that will keep
        // failing, and show a calm "starting soon" card instead.
        try {
          await scoringService.getScoreForReaders(match.id, null);
          scoreState = 'live';
        } catch {
          scoreState = 'starting';
        }

        return {
          id: match.id,
          matchNumber: match.matchNumber,
          roundName: match.roundName,
          teamAName: match.teamA!.name,
          teamBName: match.teamB!.name,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          sport: tournament.sport,
          ageGroup: tournament.ageGroup,
          gender: tournament.gender,
          scoreState,
        };
      })
    );

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
      liveMatches={liveMatches}
      counts={counts}
    />
  );
}
