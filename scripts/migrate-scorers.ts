import { connectDatabase } from '../src/server/config/db';
import { tournamentRepository } from '../src/server/repositories/tournamentRepository';
import { matchRepository } from '../src/server/repositories/matchRepository';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  await connectDatabase();
  const tournaments = await tournamentRepository.findAll();
  const updated: string[] = [];
  let totalUpdated = 0;

  for (const tournament of tournaments) {
    const matches = await matchRepository.findByTournamentId(tournament.id);
    const union = new Set<string>();
    for (const match of matches) {
      if (Array.isArray(match.scorerIds)) {
        for (const id of match.scorerIds) {
          if (typeof id === 'string' && id.trim()) {
            union.add(id.trim());
          }
        }
      }
    }
    const scorerIds = Array.from(union).sort();
    const existing = Array.isArray(tournament.scorerIds) ? [...tournament.scorerIds].sort() : [];
    const same = existing.length === scorerIds.length && existing.every((v, i) => v === scorerIds[i]);

    if (same) {
      console.log('[migrate:scorers] ' + tournament.name + ' (' + tournament.id + '): unchanged (' + scorerIds.length + ' scorer(s))');
      continue;
    }

    console.log('[migrate:scorers] ' + tournament.name + ' (' + tournament.id + '): ' + existing.length + ' -> ' + scorerIds.length);
    if (!isDryRun) {
      await tournamentRepository.update(tournament.id, { scorerIds });
      totalUpdated += 1;
    }
  }

  console.log('[migrate:scorers] Done. ' + (isDryRun ? 'Dry run - no changes written' : 'Updated ' + totalUpdated + ' tournament(s)') + '.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
