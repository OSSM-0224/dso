import "server-only";
import { PlayerDoc } from "../../shared/types.ts";
import {
  playerRepository,
  PlayerCreateInput,
} from "../repositories/playerRepository.ts";

type PlayerUpdateInput = Partial<
  Pick<
    PlayerDoc,
    | "teamId"
    | "name"
    | "jerseyNumber"
    | "ageGroup"
    | "gender"
    | "isActive"
    | "dateOfBirth"
  >
>;

export class PlayerService {
  private validateName(name: string): void {
    if (!name || !name.trim()) {
      throw new Error("Player name is required");
    }
  }

  private validateJerseyNumber(jerseyNumber?: number): void {
    if (
      jerseyNumber !== undefined &&
      (!Number.isInteger(jerseyNumber) || jerseyNumber <= 0)
    ) {
      throw new Error("Jersey number must be a positive integer");
    }
  }

  async findAll(filter?: {
    teamId?: string;
    schoolId?: string;
    search?: string;
  }): Promise<PlayerDoc[]> {
    return playerRepository.findAll(filter);
  }

  async findById(id: string): Promise<PlayerDoc | null> {
    if (!id) throw new Error("Player ID is required");

    return playerRepository.findById(id);
  }

  async create(data: PlayerCreateInput): Promise<PlayerDoc> {
    this.validateName(data.name);
    this.validateJerseyNumber(data.jerseyNumber);

    if (!data.teamId) {
      throw new Error("Team ID is required");
    }

    return playerRepository.create(data);
  }

  async update(id: string, data: PlayerUpdateInput): Promise<PlayerDoc | null> {
    if (!id) throw new Error("Player ID is required");

    if (data.name !== undefined) {
      this.validateName(data.name);
    }

    this.validateJerseyNumber(data.jerseyNumber);

    return playerRepository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    if (!id) throw new Error("Player ID is required");

    return playerRepository.delete(id);
  }

  async findByTeamId(teamId: string): Promise<PlayerDoc[]> {
    if (!teamId) throw new Error("Team ID is required");

    return playerRepository.findByTeamId(teamId);
  }

  async findBySchoolId(schoolId: string): Promise<PlayerDoc[]> {
    if (!schoolId) throw new Error("School ID is required");

    return playerRepository.findBySchoolId(schoolId);
  }
}

export const playerService = new PlayerService();
