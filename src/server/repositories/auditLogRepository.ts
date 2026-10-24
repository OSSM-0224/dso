import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { AuditLogDoc } from '../../shared/types.ts';

export class AuditLogRepository {
  async findByTournamentId(tournamentId: string): Promise<AuditLogDoc[]> {
    return dbStore.auditLogs
      .filter((l) => l.tournamentId === tournamentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async create(data: {
    tournamentId: string;
    who: string;
    role?: string;
    what: AuditLogDoc['what'];
    before?: any;
    after?: any;
    details: string;
  }): Promise<AuditLogDoc> {
    const doc: AuditLogDoc = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tournamentId: data.tournamentId,
      who: data.who,
      role: data.role || 'organizer',
      what: data.what,
      before: data.before,
      after: data.after,
      details: data.details,
      timestamp: new Date().toISOString(),
    };
    dbStore.auditLogs.unshift(doc);
    return doc;
  }
}

export const auditLogRepository = new AuditLogRepository();
