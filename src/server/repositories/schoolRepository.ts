import 'server-only';
import { collections } from '../db/docStore.ts';
import { SchoolDoc } from '../../shared/types.ts';

export class SchoolRepository {
  async findAll(): Promise<SchoolDoc[]> {
    const list = await collections.schools.all();
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<SchoolDoc | null> {
    return collections.schools.get(id);
  }

  async findByName(name: string): Promise<SchoolDoc | null> {
    const list = await collections.schools.all();
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
    await collections.schools.set(doc);
    return doc;
  }

  async update(id: string, data: Partial<{ name: string; mediums: string[] }>): Promise<SchoolDoc | null> {
    const existing = await collections.schools.get(id);
    if (!existing) return null;

    const updated: SchoolDoc = {
      ...existing,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      mediums: data.mediums !== undefined ? data.mediums : existing.mediums,
      updatedAt: new Date().toISOString(),
    };
    await collections.schools.set(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return collections.schools.delete(id);
  }
}

export const schoolRepository = new SchoolRepository();
