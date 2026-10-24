import React, { forwardRef } from 'react';

/* ── Card ───────────────────────────────────────────────────── */
export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = '', children, ...rest }, ref) => (
    <div
      ref={ref}
      className={`bg-surface border border-hairline rounded-[12px] shadow-rest ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

/* ── Badge ──────────────────────────────────────────────────── */
type BadgeTone = 'neutral' | 'accent' | 'upcoming' | 'live' | 'won' | 'lost' | 'bye';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-muted border-hairline',
  accent: 'bg-accent-soft text-accent-strong border-accent-soft',
  upcoming: 'bg-blue-soft text-blue-text border-blue-soft',
  live: 'bg-red-soft text-red-text border-red-soft',
  won: 'bg-green-soft text-green-text border-green-soft',
  lost: 'bg-red-soft text-red-text border-red-soft',
  bye: 'bg-sand-soft text-sand-text border-sand-soft',
};

export const Badge: React.FC<React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }> = ({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ${tones[tone]} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

/** StatusPill maps domain states onto badge tones. */
export const StatusPill: React.FC<{ status: string; className?: string }> = ({ status, className = '' }) => {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    draft: { tone: 'neutral', label: 'Draft' },
    'fixtures-generated': { tone: 'upcoming', label: 'Fixtures ready' },
    published: { tone: 'live', label: 'Live' },
    completed: { tone: 'won', label: 'Completed' },
    upcoming: { tone: 'upcoming', label: 'Upcoming' },
    scheduled: { tone: 'upcoming', label: 'Scheduled' },
    live: { tone: 'live', label: 'Live' },
    won: { tone: 'won', label: 'Won' },
    lost: { tone: 'lost', label: 'Lost' },
    bye: { tone: 'bye', label: 'Bye' },
  };
  const entry = map[status] || { tone: 'neutral' as BadgeTone, label: status };
  return <Badge tone={entry.tone} className={className}>{entry.label}</Badge>;
};
