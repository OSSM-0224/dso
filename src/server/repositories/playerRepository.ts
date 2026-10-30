import "server-only";
import { collections } from "../db/docStore.ts";
import { PlayerDoc } from "../../shared/types.ts";
import { teamRepository } from "./teamRepository.ts";
import { schoolRepository } from "./schoolRepository.ts";

export interface PlayerCreateInput {
  teamId: string;
  name: string;
  jerseyNumber?: number;
  ageGroup?: string;
  gender?: "boys" | "girls";
  isActive?: boolean;
  dateOfBirth?: string;
}

export class PlayerRepository {
  private async validateTeam(teamId: string) {
    const team = await teamRepository.findById(teamId);

    if (!team) {
      throw new Error("Team not found");
    }

    const school = await schoolRepository.findById(team.schoolId);

    if (!school) {
      throw new Error("Associated school not found");
    }

    return { team, school };
  }

  private async validateJerseyNumber(
    teamId: string,
    jerseyNumber?: number,
    excludePlayerId?: string,
  ): Promise<void> {
    if (jerseyNumber === undefined) return;

    const players = await collections.players.all();

    const exists = players.some(
      (p) =>
        p.teamId === teamId &&
        p.jerseyNumber === jerseyNumber &&
        p.id !== excludePlayerId,
    );

    if (exists) {
      throw new Error(
        `Jersey number ${jerseyNumber} is already assigned to another player in this team`,
      );
    }
  }

  async findAll(filter?: {
    teamId?: string;
    schoolId?: string;
    search?: string;
  }): Promise<PlayerDoc[]> {
    let list = await collections.players.all();

    if (filter?.teamId) {
      list = list.filter((p) => p.teamId === filter.teamId);
    }

    if (filter?.schoolId) {
      list = list.filter((p) => p.schoolId === filter.schoolId);
    }

    if (filter?.search?.trim()) {
      const search = filter.search.trim().toLowerCase();

      list = list.filter((p) => p.name.toLowerCase().includes(search));
    }

    // Enrich school information from the associated team
    const teamCache = new Map<string, string>();

    for (const player of list) {
      if (!teamCache.has(player.teamId)) {
        const team = await teamRepository.findById(player.teamId);
        teamCache.set(player.teamId, team?.schoolName || "Unknown School");
      }

      player.schoolName = teamCache.get(player.teamId)!;
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(id: string): Promise<PlayerDoc | null> {
    const player = await collections.players.get(id);

    if (!player) return null;

    const team = await teamRepository.findById(player.teamId);

    player.schoolName = team?.schoolName || "Unknown School";

    return player;
  }

  async create(data: PlayerCreateInput): Promise<PlayerDoc> {
    const { team, school } = await this.validateTeam(data.teamId);

    await this.validateJerseyNumber(data.teamId, data.jerseyNumber);

    const now = new Date().toISOString();

    const doc: PlayerDoc = {
      id: `player-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      teamId: team.id,
      schoolId: team.schoolId,
      schoolName: school.name,
      name: data.name.trim(),
      jerseyNumber: data.jerseyNumber,
      ageGroup: data.ageGroup ?? team.ageGroup,
      gender: data.gender ?? team.gender,
      isActive: data.isActive !== undefined ? data.isActive : true,
      dateOfBirth: data.dateOfBirth,
      createdAt: now,
      updatedAt: now,
    };

    await collections.players.set(doc);

    return doc;
  }

  async update(
    id: string,
    data: Partial<PlayerDoc>,
  ): Promise<PlayerDoc | null> {
    const existing = await collections.players.get(id);

    if (!existing) return null;

    const teamId = data.teamId ?? existing.teamId;
    const { team, school } = await this.validateTeam(teamId);

    const jerseyNumber =
      data.jerseyNumber !== undefined
        ? data.jerseyNumber
        : existing.jerseyNumber;

    await this.validateJerseyNumber(teamId, jerseyNumber, id);

    const updated: PlayerDoc = {
      ...existing,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      teamId: team.id,
      schoolId: team.schoolId,
      schoolName: school.name,
      jerseyNumber,
      ageGroup:
        data.ageGroup !== undefined
          ? data.ageGroup
          : teamId !== existing.teamId
            ? team.ageGroup
            : existing.ageGroup,
      gender:
        data.gender !== undefined
          ? data.gender
          : teamId !== existing.teamId
            ? team.gender
            : existing.gender,
      isActive: data.isActive ?? existing.isActive,
      dateOfBirth:
        data.dateOfBirth !== undefined
          ? data.dateOfBirth
          : existing.dateOfBirth,
      updatedAt: new Date().toISOString(),
    };

    await collections.players.set(updated);

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return collections.players.delete(id);
  }

  async findByTeamId(teamId: string): Promise<PlayerDoc[]> {
    return this.findAll({ teamId });
  }
  async findBySchoolId(schoolId: string): Promise<PlayerDoc[]> {
    return this.findAll({ schoolId });
  }
}
export const playerRepository = new PlayerRepository();
