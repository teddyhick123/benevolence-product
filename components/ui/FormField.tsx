import * as React from 'react';
import clsx from 'clsx';

export type FormFieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Provides consistent label, help, and error spacing around any form control.
 * Pass the matching `id` to the control and `htmlFor` to this wrapper.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-coral" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-[#b95640]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink/60">{hint}</p>
      ) : null}
    </div>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={ariaInvalid}
      className={clsx('ui-input', ariaInvalid && 'border-coral focus:border-coral focus:ring-coral/20', className)}
      {...props}
    />
  );
});

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={ariaInvalid}
      className={clsx('ui-input min-h-28 resize-y', ariaInvalid && 'border-coral focus:border-coral focus:ring-coral/20', className)}
      {...props}
    />
  );
});

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={ariaInvalid}
      className={clsx('ui-input appearance-none pr-10', ariaInvalid && 'border-coral focus:border-coral focus:ring-coral/20', className)}
      {...props}
    />
  );
});
