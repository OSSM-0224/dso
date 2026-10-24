'use client';

/**
 * Wiring between useLiveScore and LiveScoreCard for the two reader surfaces:
 * - MyMatchLiveScore   → participant portal (cookie-authenticated, school-scoped)
 * - PublicMatchLiveScore → public bracket page (no auth)
 * Both render nothing until a score exists (none yet / access denied), so the
 * cards appear only when a scorer session is actually live or archived.
 */
import React, { useCallback } from 'react';

import { api } from '@/lib/api.ts';
import { useLiveScore } from '@/hooks/useLiveScore.ts';
import { LiveScoreCard } from './LiveScoreCard.tsx';

interface MyMatchLiveScoreProps {
  matchId: string;
  /** Gate from the host (modal open + match is a real, decided fixture). */
  enabled: boolean;
  title?: string;
  className?: string;
}

export const MyMatchLiveScore: React.FC<MyMatchLiveScoreProps> = ({ matchId, enabled, title, className }) => {
  const fetcher = useCallback(
    (version?: number) => api.my.getMatchScore(matchId, version),
    [matchId],
  );
  const { score, snapshotAt, status, error } = useLiveScore(fetcher, {
    enabled,
    pollIntervalMs: 5000,
  });

  if (!score) return null;
  return (
    <LiveScoreCard
      score={score}
      snapshotAt={snapshotAt}
      title={title}
      stale={status === 'error' && !!error}
      className={className}
    />
  );
};

interface PublicMatchLiveScoreProps {
  matchId: string;
  title?: string;
  className?: string;
}

export const PublicMatchLiveScore: React.FC<PublicMatchLiveScoreProps> = ({ matchId, title, className }) => {
  const fetcher = useCallback(
    (version?: number) => api.public.getMatchScore(matchId, version),
    [matchId],
  );
  const { score, snapshotAt, status, error } = useLiveScore(fetcher, {
    enabled: true,
    pollIntervalMs: 5000,
  });

  if (!score) return null;
  return (
    <LiveScoreCard
      score={score}
      snapshotAt={snapshotAt}
      title={title}
      stale={status === 'error' && !!error}
      className={className}
    />
  );
};
