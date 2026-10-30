'use client';

import React from 'react';

export const KhoKhoLiveView: React.FC<any> = ({ match }) => {
  if (!match) return null;
  return (
    <div className="flex items-center justify-between text-xs text-ink">
      <div className="truncate">
        {match.teamA?.name || 'TBD'} <span className="text-muted">vs</span> {match.teamB?.name || 'TBD'}
      </div>
      {match.status ? <span className="uppercase text-muted">{match.status}</span> : null}
    </div>
  );
};
