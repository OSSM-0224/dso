import React from 'react';

/* ── PageHeader ─────────────────────────────────────────────── */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, className = '' }) => (
  <section className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="max-w-[65ch]">
      <h1 className="font-serif text-[26px] leading-tight font-semibold text-ink tracking-[-0.02em] [text-wrap:balance]">
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </section>
);

/* ── EmptyState ─────────────────────────────────────────────── */
export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, className = '' }) => (
  <div className={`rounded-[12px] border border-dashed border-hairline bg-surface px-4 py-10 sm:px-8 sm:py-14 text-center ${className}`}>
    <h3 className="font-serif text-lg text-ink">{title}</h3>
    {description && <p className="mx-auto mt-1.5 max-w-[44ch] text-[13px] leading-relaxed text-muted">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

/* ── Skeleton (visible=false variants matching layouts) ─────── */
export const SkeletonText: React.FC<{ className?: string; lines?: number }> = ({ className = '', lines = 1 }) => (
  <span className={`block space-y-1.5 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <span key={i} className="block h-3 rounded-full bg-canvas-strong [background:linear-gradient(90deg,#efeee9,#f7f6f3,#efeee9)]" />
    ))}
  </span>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-[12px] border border-hairline bg-surface p-5 ${className}`} aria-hidden="true">
    <SkeletonText lines={2} />
    <div className="mt-4 h-4 w-1/2 skew bg-[linear-gradient(90deg,#efeee9,#f7f6f3,#efeee9)]" />
  </div>
);

/* ── TeamMonogram (avatar, squircle) ────────────────────────── */
export const TeamMonogram: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-[11px] font-bold text-accent-strong ${className}`}
    >
      {initials || '?'}
    </span>
  );
};

/* ── Tooltip (CSS-only, focus/hover) ────────────────────────── */
export const Tooltip: React.FC<{ label: string; children: React.ReactElement; className?: string }> = ({
  label,
  children,
  className = '',
}) => (
  <span className={`group/tt relative inline-flex ${className}`}>
    {children}
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 translate-y-1 max-w-[70vw] whitespace-normal break-words sm:whitespace-nowrap rounded-[6px] bg-ink px-2 py-1 text-[11px] text-white opacity-0 shadow-rest transition-all duration-200 group-hover/tt:translate-y-0 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100"
    >
      {label}
    </span>
  </span>
);
