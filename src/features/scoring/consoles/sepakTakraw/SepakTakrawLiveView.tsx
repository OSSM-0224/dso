'use client';

/**
 * Sepak Takraw LiveView (registry entry for hub cards + school/public live
 * panels). Renders the shared LiveScoreCard, which carries a generic
 * non-kho-kho fallback card (sets, points, winner) until the dedicated
 * sepak live view ships.
 */
import React from 'react';
import { LiveScoreCard } from '@/features/scoring/LiveScoreCard';
import type { SportLiveViewProps } from '../registry';

export const SepakTakrawLiveView: React.FC<SportLiveViewProps> = ({
  match,
  score,
  snapshotAt = 0,
  stale = false,
  title,
}) => {
  if (!match) return null;
  if (!score) {
    return (
      <div className="flex items-center justify-between text-xs text-ink">
        <div className="truncate">
          {match.teamA?.name || 'TBD'} <span className="text-muted">vs</span> {match.teamB?.name || 'TBD'}
        </div>
        {match.status ? <span className="uppercase text-muted">{match.status}</span> : null}
      </div>
    );
  }
  return (
    <LiveScoreCard score={score} snapshotAt={snapshotAt} stale={stale} title={title} />
  );
};
