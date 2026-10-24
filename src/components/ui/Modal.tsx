import React, { useCallback, useEffect, useRef } from 'react';
import { Icon } from './Icon.tsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Slide-over side panel instead of a centered dialog. */
  side?: boolean;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, side = false, maxWidth = 'max-w-lg', children, footer }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const labelId = `modal-title-${React.useId()}`.replace(/[:]/g, '');

  const onKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        // Focus trap: cycle within the panel
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', onKeydown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Autofocus the first focusable control
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onKeydown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      <button
        className="absolute inset-0 h-full w-full cursor-default bg-ink/25 backdrop-blur-[2px]"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`relative bg-surface border border-hairline rounded-[12px] shadow-raise max-h-full overflow-y-auto ${
          side
            ? 'absolute inset-y-0 right-0 max-h-full rounded-none sm:rounded-l-[12px] h-full max-w-md w-full'
            : `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full ${maxWidth}`
        }`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline">
          <h2 id={labelId} className="text-[15px] font-semibold text-ink tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 p-1.5 rounded-[6px] text-muted hover:text-ink hover:bg-canvas transition-colors duration-200"
          >
            <Icon name="xmark" size="sm" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-hairline bg-canvas/60 rounded-b-[12px]">{footer}</div>}
      </div>
    </div>
  );
};
