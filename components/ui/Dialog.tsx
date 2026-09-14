'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

type DialogSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

export type DialogProps = {
  open: boolean;
  /** Preferred controlled-state callback. */
  onOpenChange?: (_open: boolean) => void;
  /** Compatibility callback for simple, conditionally mounted dialogs. */
  onClose?: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  initialFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  bodyClassName?: string;
  /** Compatibility alias for `className`. */
  contentClassName?: string;
  /** Set false when a form must be dismissed explicitly. Escape still closes. */
  closeOnBackdrop?: boolean;
};

/**
 * A controlled, accessible modal foundation. It restores focus on close,
 * closes on Escape/backdrop click, and keeps keyboard focus within the dialog.
 */
export function Dialog({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  className,
  bodyClassName,
  contentClassName,
  closeOnBackdrop = true,
}: DialogProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const [mounted, setMounted] = React.useState(false);
  const requestClose = React.useCallback(() => {
    if (onOpenChange) onOpenChange(false);
    else onClose?.();
  }, [onClose, onOpenChange]);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      initialFocusRef?.current?.focus() ?? getFocusable(dialogRef.current)[0]?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef, open]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
        : currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, requestClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-ink/35 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? requestClose : undefined}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx('relative z-10 max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl', sizeClasses[size], className, contentClassName)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-serif text-xl leading-snug text-ink">{title}</h2>
            {description ? <div id={descriptionId} className="mt-1 text-sm leading-6 text-ink/60">{description}</div> : null}
          </div>
          <button type="button" className="ui-focus-ring -mr-1 rounded-lg p-2 text-ink/60 hover:bg-ink/[0.06] hover:text-ink" onClick={requestClose} aria-label="Close dialog">
            <CloseIcon />
          </button>
        </div>
        <div className={clsx('px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-ink/10 px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}
