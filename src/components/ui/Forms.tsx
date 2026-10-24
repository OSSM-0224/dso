import React, { forwardRef, useId } from 'react';

const controlBase =
  'w-full text-[13px] text-ink bg-surface border border-hairline rounded-[6px] px-3 py-2 placeholder:text-faint transition-colors duration-200 hover:border-faint focus:outline-none focus:border-accent';

const labelBase = 'block text-xs font-medium text-muted mb-1.5';

const errorBase = 'mt-1 text-xs text-red-text';

interface FieldShellProps {
  label?: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

const FieldShell: React.FC<FieldShellProps> = ({ label, error, hint, children, htmlFor }) => (
  <div>
    {label && (
      <label htmlFor={htmlFor} className={labelBase}>
        {label}
      </label>
    )}
    {children}
    {error ? <p className={errorBase}>{error}</p> : hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
  </div>
);

/* ── Text Input ─────────────────────────────────────────────── */
export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null; hint?: string }
>(({ label, error, hint, className = '', id, ...rest }, ref) => {
  const autoId = useId();
  const inputId = id || autoId;
  const invalid = !!error;
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={invalid || undefined}
        className={`${controlBase} ${invalid ? 'border-red-text' : ''} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
});
Input.displayName = 'Input';

/* ── Select ─────────────────────────────────────────────────── */
export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string | null; hint?: string }
>(({ label, error, hint, className = '', id, children, ...rest }, ref) => {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={selectId}>
      <select
        ref={ref}
        id={selectId}
        className={`${controlBase} appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2378766f' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[right_0.6rem_center] bg-no-repeat pr-8 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});
Select.displayName = 'Select';

/* ── Checkbox ───────────────────────────────────────────────── */
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ label, className = '', id, ...rest }, ref) => {
  const autoId = useId();
  const checkId = id || autoId;
  return (
    <label htmlFor={checkId} className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}>
      <input
        ref={ref}
        id={checkId}
        type="checkbox"
        className="h-4 w-4 rounded-[4px] border border-hairline text-accent accent-[#1e5c38] focus:outline-none"
        {...rest}
      />
      {label && <span className="text-[13px] text-ink">{label}</span>}
    </label>
  );
});
Checkbox.displayName = 'Checkbox';

/* ── Switch ─────────────────────────────────────────────────── */
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, id }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full border transition-colors duration-200 ${
        checked ? 'bg-accent border-transparent' : 'bg-canvas border-hairline'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow-rest transition-transform duration-200 ${
          checked ? 'translate-x-[16px]' : ''
        }`}
      />
    </button>
    {label && <span className="text-[13px] text-ink">{label}</span>}
  </label>
);
