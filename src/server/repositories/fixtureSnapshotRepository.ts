import 'server-only';
import { collections } from '../db/docStore.ts';
import { FixtureSnapshotDoc } from '../../shared/types.ts';

export class FixtureSnapshotRepository {
  async findByTournamentId(tournamentId: string): Promise<FixtureSnapshotDoc | null> {
    const list = await collections.fixtureSnapshots.all();
    return list.find((s) => s.tournamentId === tournamentId) || null;
  }

  async save(snapshot: FixtureSnapshotDoc): Promise<FixtureSnapshotDoc> {
    await collections.fixtureSnapshots.set(snapshot);
    return snapshot;
  }

  async delete(tournamentId: string): Promise<boolean> {
    const snapshot = await this.findByTournamentId(tournamentId);
    if (!snapshot) return false;
    return collections.fixtureSnapshots.delete(snapshot.id);
  }
}

export const fixtureSnapshotRepository = new FixtureSnapshotRepository();
