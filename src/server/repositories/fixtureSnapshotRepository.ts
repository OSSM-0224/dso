import { dbStore } from '../db/memoryStore.ts';
import { FixtureSnapshotDoc } from '../../shared/types.ts';

export class FixtureSnapshotRepository {
  async findByTournamentId(tournamentId: string): Promise<FixtureSnapshotDoc | null> {
    return dbStore.fixtureSnapshots.get(tournamentId) || null;
  }

  async save(snapshot: FixtureSnapshotDoc): Promise<FixtureSnapshotDoc> {
    dbStore.fixtureSnapshots.set(snapshot.tournamentId, snapshot);
    return snapshot;
  }

  async delete(tournamentId: string): Promise<boolean> {
    return dbStore.fixtureSnapshots.delete(tournamentId);
  }
}

export const fixtureSnapshotRepository = new FixtureSnapshotRepository();
