import { dbStore } from '../db/memoryStore.ts';
import { SchoolDoc } from '../../shared/types.ts';

export class SchoolRepository {
  async findAll(): Promise<SchoolDoc[]> {
    return Array.from(dbStore.schools.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<SchoolDoc | null> {
    return dbStore.schools.get(id) || null;
  }

  async findByName(name: string): Promise<SchoolDoc | null> {
    const list = Array.from(dbStore.schools.values());
    return list.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) || null;
  }

  async create(data: { name: string; mediums?: string[] }): Promise<SchoolDoc> {
    const id = `sch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const doc: SchoolDoc = {
      id,
      name: data.name.trim(),
      mediums: data.mediums && data.mediums.length > 0 ? data.mediums : ['Marathi', 'English'],
      createdAt: now,
      updatedAt: now,
    };
    dbStore.schools.set(id, doc);
    return doc;
  }

  async update(id: string, data: Partial<{ name: string; mediums: string[] }>): Promise<SchoolDoc | null> {
    const existing = dbStore.schools.get(id);
    if (!existing) return null;

    const updated: SchoolDoc = {
      ...existing,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      mediums: data.mediums !== undefined ? data.mediums : existing.mediums,
      updatedAt: new Date().toISOString(),
    };
    dbStore.schools.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return dbStore.schools.delete(id);
  }
}

export const schoolRepository = new SchoolRepository();
