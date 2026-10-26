import 'server-only';
import { collections } from '../db/docStore.ts';
import { AcknowledgementDoc } from '../../shared/types.ts';

export class AcknowledgementRepository {
  async findByMatchAndSchool(matchId: string, schoolId: string): Promise<AcknowledgementDoc | null> {
    const list = await collections.acknowledgements.all();
    return list.find((a) => a.matchId === matchId && a.schoolId === schoolId) || null;
  }

  async findByMatchId(matchId: string): Promise<AcknowledgementDoc[]> {
    return (await collections.acknowledgements.all()).filter((a) => a.matchId === matchId);
  }

  async findBySchoolId(schoolId: string): Promise<AcknowledgementDoc[]> {
    return (await collections.acknowledgements.all()).filter((a) => a.schoolId === schoolId);
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
      await collections.acknowledgements.set(updated);
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
    await collections.acknowledgements.set(doc);
    return doc;
  }
}

export const acknowledgementRepository = new AcknowledgementRepository();
