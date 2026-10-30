'use client';

/**
 * STAFF-ONLY organizer overview route (admins/organizers). The scoring
 * service enforces `STAFF_ONLY` on the data; the screen renders the
 * restricted card as a fallback.
 */
import React from 'react';
import { ScoringOrganizerOverview } from '@/features/scoring/ScoringOrganizerOverview.tsx';

export default function ScoreOrganizerPage() {
  return <ScoringOrganizerOverview />;
}
