import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';

/* ── Tabs ───────────────────────────────────────────────────── */
interface TabsProps {
  items: Array<{ id: string; label: string; badge?: string | number }>;
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ items, active, onChange, className = '' }) => (
  <div
    role="tablist"
    className={`flex items-center gap-1 border-b border-hairline ${className}`}
  >
    {items.map((item) => {
      const selected = item.id === active;
      return (
        <button
          key={item.id}
          role="tab"
          aria-selected={selected}
          onClick={() => onChange(item.id)}
          className={`relative px-3 py-2 text-[13px] transition-colors duration-200 flex items-center gap-1.5 ${
            selected ? 'text-ink font-semibold' : 'text-muted hover:text-ink'
          }`}
        >
          {item.label}
          {item.badge !== undefined && item.badge !== 0 && (
            <span className="text-[10px] font-mono tabular-nums text-muted">{item.badge}</span>
          )}
          {selected && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" aria-hidden="true" />
          )}
        </button>
      );
    })}
  </div>
);

/* ── Stepper ────────────────────────────────────────────────── */
interface StepperProps {
  steps: Array<{ id: string; label: string }>;
  current: string;
  /** Completed step ids (user may navigate back). */
  done?: string[];
  onSelect?: (id: string) => void;
}

export const Stepper: React.FC<StepperProps> = ({ steps, current, done = [], onSelect }) => {
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-start gap-0 overflow-x-auto" aria-label="Workflow steps">
      {steps.map((step, i) => {
        const isDone = done.includes(step.id) && step.id !== current;
        const isCurrent = step.id === current;
        const state = isDone ? 'done' : isCurrent ? 'current' : 'todo';
        return (
          <li key={step.id} className="flex items-start min-w-0 flex-1">
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(step.id)}
              className="group flex flex-col items-center text-center px-2 min-w-[64px] grow"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold font-mono transition-colors duration-200 ${
                  state === 'done'
                    ? 'bg-accent-soft border-accent-soft text-accent-strong'
                    : state === 'current'
                      ? 'bg-accent border-accent text-white'
                      : 'bg-surface border-hairline text-faint group-hover:border-faint'
                }`}
              >
                {isDone ? <Icon name="check" size="xs" /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-[11px] leading-tight font-medium ${
                  isCurrent ? 'text-ink' : 'text-muted'
                }`}
              >
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`mt-3 h-px w-6 shrink-0 ${isDone ? 'bg-accent-soft' : 'bg-hairline'}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
};

/* ── Toast ──────────────────────────────────────────────────── */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Minimal toast host: screens keep their own toasts array and render this. */
export const ToastHost: React.FC<{ toasts: ToastItem[]; onDismiss: (id: number) => void }> = ({
  toasts,
  onDismiss,
}) => (
  <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(92vw,340px)]" role="status" aria-live="polite">
    {toasts.map((t) => (
      <Toast key={t.id} kind={t.kind} message={t.message} onDismiss={() => onDismiss(t.id)} />
    ))}
  </div>
);

const Toast: React.FC<{ kind: ToastKind; message: string; onDismiss: () => void }> = ({ kind, message, onDismiss }) => {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const hide = setTimeout(() => setLeaving(true), 3200);
    const remove = setTimeout(onDismiss, 3600);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, [onDismiss]);

  return (
    <div
      className={`flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-[13px] shadow-raise transition-all duration-300 ${
        kind === 'success'
          ? 'bg-green-soft border-green-soft text-green-text'
          : kind === 'error'
            ? 'bg-red-soft border-red-soft text-red-text'
            : 'bg-surface border-hairline text-ink'
      } ${leaving ? 'opacity-0 translate-y-1' : 'opacity-100'}`}
    >
      <span className="grow">{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss notification" className="shrink-0 opacity-60 hover:opacity-100">
        <Icon name="xmark" size="sm" />
      </button>
    </div>
  );
};
