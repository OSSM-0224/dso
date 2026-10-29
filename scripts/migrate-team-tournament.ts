import 'server-only';
import 'dotenv/config';
import { collections } from '../src/server/db/docStore.ts';
import { TeamDoc, TournamentDoc, EnrollmentDoc } from '../src/shared/types.ts';

async function migrate() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n=== DSO Team Tournament Migration ===`);
  console.log(`Execution Mode: ${isDryRun ? 'DRY-RUN (Simulating changes)' : 'LIVE (Writing changes)'}\n`);

  const teams = await collections.teams.all();
  const tournaments = await collections.tournaments.all();
  const enrollments = await collections.enrollments.all();

  console.log(`Found ${teams.length} teams, ${tournaments.length} tournaments, and ${enrollments.length} enrollments in store.`);

  const tournamentMap = new Map<string, TournamentDoc>();
  tournaments.forEach((t) => tournamentMap.set(t.id, t));

  // Build mapping of teamId -> Set of tournamentIds where it participated
  const teamTournaments = new Map<string, Set<string>>();

  for (const tourney of tournaments) {
    for (const teamId of (tourney.teams || [])) {
      if (!teamTournaments.has(teamId)) teamTournaments.set(teamId, new Set());
      teamTournaments.get(teamId)!.add(tourney.id);
    }
  }

  for (const enroll of enrollments) {
    if (enroll.status === 'enrolled') {
      if (!teamTournaments.has(enroll.teamId)) teamTournaments.set(enroll.teamId, new Set());
      teamTournaments.get(enroll.teamId)!.add(enroll.tournamentId);
    }
  }

  let alreadySetCount = 0;
  let migratedCount = 0;
  let conflictCount = 0;
  let orphanCount = 0;

  for (const team of teams) {
    if (team.tournamentId) {
      alreadySetCount++;
      continue;
    }

    const tIds = Array.from(teamTournaments.get(team.id) || []);

    if (tIds.length === 0) {
      orphanCount++;
      console.log(`[ORPHAN] Team "${team.name}" (ID: ${team.id}) is not enrolled in any tournament (tournamentId remains null).`);
      continue;
    }

    if (tIds.length > 1) {
      conflictCount++;
      console.log(`[CONFLICT] Team "${team.name}" (ID: ${team.id}) is linked to multiple tournaments: [${tIds.join(', ')}]`);
    }

    // Pick best tournament: prefer latest active, then latest year
    const candidates = tIds
      .map((id) => tournamentMap.get(id))
      .filter((t): t is TournamentDoc => Boolean(t))
      .sort((a, b) => {
        const aActive = a.status !== 'completed' ? 1 : 0;
        const bActive = b.status !== 'completed' ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        return (b.year || 0) - (a.year || 0);
      });

    const chosen = candidates[0];
    if (!chosen) {
      orphanCount++;
      console.log(`[ORPHAN] Tournament records missing for team "${team.name}" (ID: ${team.id}).`);
      continue;
    }

    console.log(`[MIGRATE] Team "${team.name}" -> Assigned to Tournament "${chosen.name}" (${chosen.id})`);

    if (!isDryRun) {
      team.tournamentId = chosen.id;
      await collections.teams.set(team);
    }
    migratedCount++;
  }

  console.log(`\n================ Summary ================`);
  console.log(`Total Teams:          ${teams.length}`);
  console.log(`Already Scoped:       ${alreadySetCount}`);
  console.log(`Successfully Scoped:  ${migratedCount}`);
  console.log(`Conflicts Resolved:   ${conflictCount}`);
  console.log(`Orphans (Null):       ${orphanCount}`);
  console.log(`Dry-Run Mode:         ${isDryRun ? 'YES (No DB changes written)' : 'NO (Database updated)'}`);
  console.log(`=========================================\n`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

