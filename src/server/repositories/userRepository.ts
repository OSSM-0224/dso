import 'server-only';
import { collections } from '../db/docStore.ts';
import { UserDoc } from '../../shared/types.ts';

export class UserRepository {
  async findAll(): Promise<UserDoc[]> {
    const list = await collections.users.all();
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<UserDoc | null> {
    return collections.users.get(id);
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    const cleanEmail = email.trim().toLowerCase();
    const list = await collections.users.all();
    return list.find((u) => !!u.email && u.email.toLowerCase() === cleanEmail) || null;
  }

  async findBySchoolCode(schoolCode: string): Promise<UserDoc | null> {
    const cleanCode = schoolCode.trim().toUpperCase();
    const list = await collections.users.all();
    return list.find((u) => !!u.schoolCode && u.schoolCode.toUpperCase() === cleanCode) || null;
  }

  async findBySchoolId(schoolId: string): Promise<UserDoc | null> {
    const list = await collections.users.all();
    return list.find((u) => u.schoolId === schoolId) || null;
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    const clean = identifier.trim();

    const byEmail = await this.findByEmail(clean);
    if (byEmail) return byEmail;

    const byCode = await this.findBySchoolCode(clean);
    if (byCode) return byCode;

    const list = await collections.users.all();
    return list.find((u) => !!u.phone && u.phone.trim() === clean) || null;
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
    await collections.users.set(doc);
    return doc;
  }

  async update(id: string, data: Partial<UserDoc>): Promise<UserDoc | null> {
    const existing = await collections.users.get(id);
    if (!existing) return null;

    const updated: UserDoc = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await collections.users.set(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return collections.users.delete(id);
  }
}

export const userRepository = new UserRepository();
