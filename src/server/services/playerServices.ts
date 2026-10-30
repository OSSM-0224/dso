import "server-only";
import {
  PlayerCsvImportReport,
  PlayerCsvRow,
  PlayerCsvValidationItem,
  PlayerDoc,
} from "../../shared/types.ts";
import {
  playerRepository,
  PlayerCreateInput,
} from "../repositories/playerRepository.ts";
import { teamRepository } from "../repositories/teamRepository.ts";

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

  /**
   * Validate (payload clean-up) and optionally commit a CSV batch of players
   * all belonging to ONE team. Mirrors teamService.validateAndImportCsv:
   * preview with commit=false, import with commit=true.
   */
  async validateAndImportCsv(
    rows: PlayerCsvRow[],
    teamId: string,
    commit: boolean = false,
  ): Promise<PlayerCsvImportReport> {
    const team = await teamRepository.findById(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const existingPlayers = await playerRepository.findAll({ teamId });

    const items: PlayerCsvValidationItem[] = [];
    const seenJerseysInCsv = new Set<number>();
    const seenNamesInCsv = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const errors: string[] = [];
      const warnings: string[] = [];

      const name = (row.name || "").trim();
      const jerseyNumber = row.jerseyNumber;
      const dateOfBirth = (row.dateOfBirth || "").trim();
      const gender = row.gender;
      const ageGroup = (row.ageGroup || "").trim();

      if (!name || name.length < 2) {
        errors.push("Player name is required (at least 2 characters)");
      }

      // Column overrides only; otherwise the team's own category applies.
      const effectiveGender = gender ?? team.gender;
      if (gender && gender !== team.gender) {
        warnings.push(
          `Gender "${gender}" overrides the team gender (${team.gender}).`,
        );
      }
      const effectiveAgeGroup = ageGroup || team.ageGroup;
      if (ageGroup && ageGroup !== team.ageGroup) {
        warnings.push(
          `Age group "${ageGroup}" overrides the team age group (${team.ageGroup}).`,
        );
      }

      if (dateOfBirth) {
        const dob = new Date(dateOfBirth);
        if (Number.isNaN(dob.getTime())) {
          errors.push(`Invalid date of birth "${dateOfBirth}"`);
        } else if (dob.getTime() > Date.now()) {
          errors.push("Date of birth cannot be in the future");
        }
      }

      // Jersey checks (only meaningful when provided).
      let isDuplicate = false;
      let duplicateOf: "csv" | "database" | undefined;

      if (jerseyNumber !== undefined) {
        if (!Number.isInteger(jerseyNumber) || jerseyNumber <= 0) {
          errors.push(
            `Jersey number "${jerseyNumber}" must be a positive integer`,
          );
        } else if (seenJerseysInCsv.has(jerseyNumber)) {
          isDuplicate = true;
          duplicateOf = "csv";
          errors.push(
            `Duplicate jersey number ${jerseyNumber} within the same CSV upload.`,
          );
        } else if (
          existingPlayers.some((p) => p.jerseyNumber === jerseyNumber)
        ) {
          isDuplicate = true;
          duplicateOf = "database";
          errors.push(
            `Jersey number ${jerseyNumber} is already assigned in team "${team.name}".`,
          );
        } else {
          seenJerseysInCsv.add(jerseyNumber);
        }
      }

      // Name duplicate detection (name match is case-insensitive).
      const nameKey = name.toLowerCase();
      if (name && name.length >= 2) {
        if (seenNamesInCsv.has(nameKey)) {
          isDuplicate = true;
          duplicateOf = "csv";
          errors.push("Duplicate player name within the same CSV upload.");
        } else if (
          existingPlayers.some((p) => p.name.toLowerCase() === nameKey)
        ) {
          isDuplicate = true;
          duplicateOf = "database";
          errors.push(
            `Player "${name}" is already registered in team "${team.name}".`,
          );
        } else {
          seenNamesInCsv.add(nameKey);
        }
      }

      let status: "valid" | "duplicate" | "error" = "valid";
      if (isDuplicate) {
        status = "duplicate";
      } else if (errors.length > 0) {
        status = "error";
      }

      items.push({
        rowIndex: i + 1,
        data: {
          name,
          jerseyNumber,
          dateOfBirth: dateOfBirth || undefined,
          gender: effectiveGender,
          ageGroup: effectiveAgeGroup,
        },
        status,
        errors,
        warnings,
        duplicateOf,
      });
    }

    const validCount = items.filter((item) => item.status === "valid").length;
    const duplicateCount = items.filter(
      (item) => item.status === "duplicate",
    ).length;
    const errorCount = items.filter((item) => item.status === "error").length;

    let createdCount = 0;

    if (commit && validCount > 0) {
      const validItems = items.filter((item) => item.status === "valid");
      for (const item of validItems) {
        const input: PlayerCreateInput = {
          teamId,
          name: item.data.name,
          jerseyNumber: item.data.jerseyNumber,
          dateOfBirth: item.data.dateOfBirth,
          gender: item.data.gender,
          ageGroup: item.data.ageGroup,
          isActive: true,
        };
        await playerRepository.create(input);
        createdCount++;
      }
    }

    return {
      teamId,
      teamName: team.name,
      totalRows: rows.length,
      validCount,
      duplicateCount,
      errorCount,
      items,
      committed: commit,
      createdCount,
    };
  }
}

export const playerService = new PlayerService();
