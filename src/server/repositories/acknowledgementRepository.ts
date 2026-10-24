import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { AcknowledgementDoc } from '../../shared/types.ts';

export class AcknowledgementRepository {
  async findByMatchAndSchool(matchId: string, schoolId: string): Promise<AcknowledgementDoc | null> {
    for (const ack of dbStore.acknowledgements.values()) {
      if (ack.matchId === matchId && ack.schoolId === schoolId) {
        return ack;
      }
    }
    return null;
  }

  async findByMatchId(matchId: string): Promise<AcknowledgementDoc[]> {
    return Array.from(dbStore.acknowledgements.values()).filter((a) => a.matchId === matchId);
  }

  async findBySchoolId(schoolId: string): Promise<AcknowledgementDoc[]> {
    return Array.from(dbStore.acknowledgements.values()).filter((a) => a.schoolId === schoolId);
  }

  async upsert(data: {
    matchId: string;
    schoolId: string;
    acknowledgedBy: string;
  }): Promise<AcknowledgementDoc> {
    const existing = await this.findByMatchAndSchool(data.matchId, data.schoolId);
    if (existing) {
      const updated: AcknowledgementDoc = {
        ...existing,
        acknowledgedBy: data.acknowledgedBy,
        acknowledgedAt: new Date().toISOString(),
      };
      dbStore.acknowledgements.set(existing.id, updated);
      return updated;
    }

    const id = `ack-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const doc: AcknowledgementDoc = {
      id,
      matchId: data.matchId,
      schoolId: data.schoolId,
      acknowledgedBy: data.acknowledgedBy,
      acknowledgedAt: new Date().toISOString(),
    };
    dbStore.acknowledgements.set(id, doc);
    return doc;
  }
}

export const acknowledgementRepository = new AcknowledgementRepository();
