import "server-only";

import { UserSession } from "../../shared/types.ts";
import { ApiError } from "../apiError.ts";
import { teamRepository } from "../repositories/teamRepository.ts";
import { playerRepository } from "../repositories/playerRepository.ts";
import { playerService } from "../services/playerServices";
import {
  createPlayerSchema,
  updatePlayerSchema,
  bulkImportPlayersSchema,
} from "../validations/schemas.ts";
import { requireSchoolOwnerOrAdmin } from "../auth/guards.ts";

export const playerController = {
  async list(
    user: UserSession,
    params: {
      teamId?: string;
      schoolId?: string;
      search?: string;
    } = {},
  ) {
    // Participants can only see their own school's players.
    const schoolId =
      user.role === "participant" ? user.schoolId! : params.schoolId;

    if (params.teamId) {
      const team = await teamRepository.findById(params.teamId);

      if (!team) {
        throw new ApiError(404, "Team not found");
      }

      await requireSchoolOwnerOrAdmin(user, team.schoolId);
    }

    return playerService.findAll({
      ...params,
      schoolId,
    });
  },

  async getById(user: UserSession, id: string) {
    const player = await playerRepository.findById(id);

    if (!player) {
      throw new ApiError(404, "Player not found");
    }

    await requireSchoolOwnerOrAdmin(user, player.schoolId);

    return player;
  },

  async create(user: UserSession, body: unknown) {
    const parsed = createPlayerSchema.parse(body);

    const team = await teamRepository.findById(parsed.teamId);

    if (!team) {
      throw new ApiError(404, "Team not found");
    }

    await requireSchoolOwnerOrAdmin(user, team.schoolId);

    return playerService.create(parsed);
  },

  async update(user: UserSession, id: string, body: unknown) {
    const parsed = updatePlayerSchema.parse(body);

    const existing = await playerRepository.findById(id);

    if (!existing) {
      throw new ApiError(404, "Player not found");
    }

    // Verify ownership of the existing player's school.
    await requireSchoolOwnerOrAdmin(user, existing.schoolId);

    // If player is being transferred, validate destination team too.
    if (parsed.teamId) {
      const team = await teamRepository.findById(parsed.teamId);

      if (!team) {
        throw new ApiError(404, "Team not found");
      }

      await requireSchoolOwnerOrAdmin(user, team.schoolId);
    }

    const updated = await playerService.update(id, parsed);

    if (!updated) {
      throw new ApiError(404, "Player not found");
    }

    return updated;
  },

  async delete(user: UserSession, id: string) {
    const existing = await playerRepository.findById(id);

    if (!existing) {
      throw new ApiError(404, "Player not found");
    }

    await requireSchoolOwnerOrAdmin(user, existing.schoolId);

    return playerService.delete(id);
  },

  /**
   * CSV bulk import for ONE team (preview with commit=false, import with
   * commit=true). Ownership of the team's school is enforced before either
   * step, so a coach can never validate (and thereby inspect rows of) a
   * team that is not theirs.
   */
  async importAndValidate(user: UserSession, body: unknown) {
    const parsed = bulkImportPlayersSchema.parse(body);

    const team = await teamRepository.findById(parsed.teamId);

    if (!team) {
      throw new ApiError(404, "Team not found");
    }

    await requireSchoolOwnerOrAdmin(user, team.schoolId);

    return playerService.validateAndImportCsv(
      parsed.rows as {
        name: string;
        jerseyNumber?: number;
        dateOfBirth?: string;
        gender?: "boys" | "girls";
        ageGroup?: string;
      }[],
      parsed.teamId,
      parsed.commit,
    );
  },
};
