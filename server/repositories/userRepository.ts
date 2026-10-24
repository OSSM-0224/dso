import { dbStore } from '../db/memoryStore.ts';
import { UserDoc } from '../../shared/types.ts';

export class UserRepository {
  async findAll(): Promise<UserDoc[]> {
    return Array.from(dbStore.users.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<UserDoc | null> {
    return dbStore.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    const cleanEmail = email.trim().toLowerCase();
    for (const u of dbStore.users.values()) {
      if (u.email && u.email.toLowerCase() === cleanEmail) {
        return u;
      }
    }
    return null;
  }

  async findBySchoolCode(schoolCode: string): Promise<UserDoc | null> {
    const cleanCode = schoolCode.trim().toUpperCase();
    for (const u of dbStore.users.values()) {
      if (u.schoolCode && u.schoolCode.toUpperCase() === cleanCode) {
        return u;
      }
    }
    return null;
  }

  async findBySchoolId(schoolId: string): Promise<UserDoc | null> {
    for (const u of dbStore.users.values()) {
      if (u.schoolId === schoolId) {
        return u;
      }
    }
    return null;
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    const clean = identifier.trim();
    // Try email first
    const byEmail = await this.findByEmail(clean);
    if (byEmail) return byEmail;

    // Try schoolCode
    const byCode = await this.findBySchoolCode(clean);
    if (byCode) return byCode;

    // Try phone
    for (const u of dbStore.users.values()) {
      if (u.phone && u.phone.trim() === clean) {
        return u;
      }
    }

    return null;
  }

  async create(user: Omit<UserDoc, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserDoc> {
    const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const doc: UserDoc = {
      ...user,
      id,
      createdAt: now,
      updatedAt: now,
    };
    dbStore.users.set(id, doc);
    return doc;
  }

  async update(id: string, data: Partial<UserDoc>): Promise<UserDoc | null> {
    const existing = dbStore.users.get(id);
    if (!existing) return null;

    const updated: UserDoc = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    dbStore.users.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return dbStore.users.delete(id);
  }
}

export const userRepository = new UserRepository();
