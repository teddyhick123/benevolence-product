'use client';

import * as React from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-azure text-white shadow-sm hover:bg-azure-deep active:bg-azure-deep disabled:bg-azure/50',
  secondary:
    'border border-ink/10 bg-white text-ink shadow-sm hover:border-azure/35 hover:bg-azure/[0.04] disabled:bg-white',
  quiet:
    'bg-transparent text-azure hover:bg-azure/[0.08] hover:text-azure-deep disabled:text-ink/40',
  danger:
    'bg-coral text-white shadow-sm hover:bg-[#c9634a] active:bg-[#b95640] disabled:bg-coral/50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-xs',
  md: 'min-h-10 px-4 py-2 text-sm',
  lg: 'min-h-11 px-5 py-2.5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Loading',
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={clsx(
        'ui-focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : null}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
