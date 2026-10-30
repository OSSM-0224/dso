'use client';

/**
 * Wiring between useLiveScore and the registry LIVE VIEW for the two reader
 * surfaces:
 * - MyMatchLiveScore   → participant portal (cookie-authenticated, school-scoped)
 * - PublicMatchLiveScore → public bracket page (no auth)
 * Both render nothing until a score exists (none yet / access denied), so the
 * cards appear only when a scorer session is actually live or archived.
 * The LiveView component is resolved from the sport REGISTRY via
 * `score.scoreboard.sport` (spec §2) — never imported per-sport directly.
 */
import React, { useCallback, useMemo } from 'react';

import { api } from '@/lib/api.ts';
import { useLiveScore } from '@/hooks/useLiveScore.ts';
import type { MatchDoc, MatchScoreViewDto } from '@/shared/types.ts';
import { getSportLiveView } from './consoles/registry.ts';
import { LiveScoreCard } from './LiveScoreCard.tsx';

/** Minimal match stub — reader LiveViews only need stable keys/titles. */
const matchStubFor = (matchId: string): MatchDoc => ({ id: matchId }) as unknown as MatchDoc;

/** Registry dispatch: falls back to the generic card for unknown sports. */
function LiveViewRenderer({
  score,
  matchId,
  snapshotAt,
  stale,
  title,
  className,
}: {
  score: MatchScoreViewDto;
  matchId: string;
  snapshotAt: number;
  stale: boolean;
  title?: string;
  className?: string;
}) {
  const LiveView = useMemo(
    () => getSportLiveView(score?.scoreboard?.sport ?? 'kho-kho') ?? LiveScoreCard,
    [score?.scoreboard?.sport]
  );
  return (
    <div className={className}>
      <LiveView
        match={matchStubFor(matchId)}
        score={score}
        snapshotAt={snapshotAt}
        stale={stale}
        title={title}
      />
    </div>
  );
}

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

  if (!score || !('scoreboard' in score)) return null;
  return (
    <LiveViewRenderer
      score={score}
      matchId={matchId}
      snapshotAt={snapshotAt}
      stale={status === 'error' && !!error}
      title={title}
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

  if (!score || !('scoreboard' in score)) return null;
  return (
    <LiveViewRenderer
      score={score}
      matchId={matchId}
      snapshotAt={snapshotAt}
      stale={status === 'error' && !!error}
      title={title}
      className={className}
    />
  );
};
