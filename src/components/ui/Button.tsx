import React, { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-1.5 font-medium rounded-[6px] border transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none sm:whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white border-transparent hover:bg-accent-strong shadow-rest',
  secondary: 'bg-surface text-ink border-hairline hover:bg-canvas',
  ghost: 'bg-transparent text-muted border-transparent hover:text-ink hover:bg-canvas',
  danger: 'bg-surface text-red-text border-hairline hover:border-red-soft hover:bg-red-soft',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 min-h-[36px] sm:min-h-0',
  md: 'text-[13px] px-3.5 py-2 min-h-[40px] sm:min-h-0',
  lg: 'text-sm px-5 py-2.5 min-h-[44px] sm:min-h-0',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading = false, className = '', children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
