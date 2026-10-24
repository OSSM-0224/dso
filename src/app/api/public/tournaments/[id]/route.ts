import { NextResponse } from 'next/server';

import { handler } from '@/server/validations/helpers';
import {
  PublicTournamentNotPublishedError,
  getSanitizedPublicTournamentPayload,
} from '@/server/controllers/publicTournamentController';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/public/tournaments/:id (public bracket, read-only, strict whitelist DTO)
export async function GET(_req: Request, ctx: Ctx) {
  return handler(async () => {
    const { id } = await ctx.params;
    try {
      const payload = await getSanitizedPublicTournamentPayload(id);
      return NextResponse.json({ success: true, data: payload });
    } catch (err) {
      if (err instanceof PublicTournamentNotPublishedError) {
        return NextResponse.json(
          { success: false, error: 'Tournament fixtures have not been published yet.' },
          { status: 403 }
        );
      }
      throw err;
    }
  });
}
