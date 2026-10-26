import 'server-only';
import { collections } from './docStore.ts';

/**
 * Create the indexes used by the hot scoring path. This runs once per server
 * instance during instrumentation startup; index creation is idempotent.
 */
export async function ensureDatabaseIndexes(): Promise<void> {
  await Promise.all([
    collections.matchScores.ensureIndexes([
      { keys: { matchId: 1 }, options: { unique: true, name: 'uniq_matchId' } },
      { keys: { tournamentId: 1 }, options: { name: 'by_tournament' } },
    ]),
    collections.scoreEvents.ensureIndexes([
      {
        keys: { matchId: 1, 'event.atMs': 1, createdAt: 1 },
        options: { name: 'match_timeline' },
      },
      {
        keys: { matchId: 1, 'event.eventId': 1 },
        options: { unique: true, name: 'uniq_match_event' },
      },
    ]),
    collections.matches.ensureIndexes([
      { keys: { tournamentId: 1 }, options: { name: 'by_tournament' } },
    ]),
    collections.auditLogs.ensureIndexes([
      { keys: { tournamentId: 1, timestamp: -1 }, options: { name: 'by_tournament_time' } },
    ]),
    collections.tournaments.ensureIndexes([
      { keys: { status: 1, createdAt: -1 }, options: { name: 'by_status_time' } },
    ]),
  ]);
}
