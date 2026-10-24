import 'server-only';
import { dbStore } from '../db/memoryStore.ts';
import { TeamDoc } from '../../shared/types.ts';
import { schoolRepository } from './schoolRepository.ts';

export class TeamRepository {
  async findAll(filter?: { ageGroup?: string; gender?: string; schoolId?: string }): Promise<TeamDoc[]> {
    let list = Array.from(dbStore.teams.values());

    if (filter) {
      if (filter.ageGroup) {
        list = list.filter((t) => t.ageGroup === filter.ageGroup);
      }
      if (filter.gender) {
        list = list.filter((t) => t.gender === filter.gender);
      }
      if (filter.schoolId) {
        list = list.filter((t) => t.schoolId === filter.schoolId);
      }
    }

    // Enrich with school name if missing
    for (const t of list) {
      if (!t.schoolName) {
        const school = await schoolRepository.findById(t.schoolId);
        t.schoolName = school ? school.name : 'Unknown School';
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<TeamDoc | null> {
    const t = dbStore.teams.get(id);
    if (!t) return null;
    if (!t.schoolName) {
      const school = await schoolRepository.findById(t.schoolId);
      t.schoolName = school ? school.name : 'Unknown School';
    }
    return t;
  }

  async findByIds(ids: string[]): Promise<TeamDoc[]> {
    const results: TeamDoc[] = [];
    for (const id of ids) {
      const t = await this.findById(id);
      if (t) results.push(t);
    }
    return results;
  }

  async findBySchoolId(schoolId: string): Promise<TeamDoc[]> {
    return this.findAll({ schoolId });
  }

  async create(data: {
    name: string;
    schoolId: string;
    medium: string;
    ageGroup: string;
    gender: 'boys' | 'girls';
    isActive?: boolean;
  }): Promise<TeamDoc> {
    const id = `team-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const school = await schoolRepository.findById(data.schoolId);

    const doc: TeamDoc = {
      id,
      name: data.name.trim(),
      schoolId: data.schoolId,
      schoolName: school ? school.name : '',
      medium: data.medium,
      ageGroup: data.ageGroup,
      gender: data.gender,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date().toISOString(),
    };
    dbStore.teams.set(id, doc);
    return doc;
  }

  async update(id: string, data: Partial<TeamDoc>): Promise<TeamDoc | null> {
    const existing = dbStore.teams.get(id);
    if (!existing) return null;

    let schoolName = existing.schoolName;
    if (data.schoolId && data.schoolId !== existing.schoolId) {
      const school = await schoolRepository.findById(data.schoolId);
      schoolName = school ? school.name : existing.schoolName;
    }

    const updated: TeamDoc = {
      ...existing,
      ...data,
      schoolName,
    };
    dbStore.teams.set(id, updated);
    return updated;
  }

  async findByNameAndSchool(
    name: string,
    schoolId: string,
    ageGroup: string,
    gender: 'boys' | 'girls'
  ): Promise<TeamDoc | null> {
    const list = Array.from(dbStore.teams.values());
    const match = list.find(
      (t) =>
        t.schoolId === schoolId &&
        t.name.toLowerCase() === name.trim().toLowerCase() &&
        t.ageGroup === ageGroup &&
        t.gender === gender
    );
    if (!match) return null;
    if (!match.schoolName) {
      const school = await schoolRepository.findById(match.schoolId);
      match.schoolName = school ? school.name : 'Unknown School';
    }
    return match;
  }

  async bulkCreate(
    teamsData: Array<{
      name: string;
      schoolId: string;
      medium: string;
      ageGroup: string;
      gender: 'boys' | 'girls';
      isActive?: boolean;
    }>
  ): Promise<TeamDoc[]> {
    const created: TeamDoc[] = [];
    for (const data of teamsData) {
      const doc = await this.create(data);
      created.push(doc);
    }
    return created;
  }

  async delete(id: string): Promise<boolean> {
    return dbStore.teams.delete(id);
  }
}

export const teamRepository = new TeamRepository();
