'use client';

import * as React from 'react';
import clsx from 'clsx';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  /** If true, show a small Edit button on the right */
  canEdit?: boolean;
  /** Fired when the Edit button is clicked */
  onEdit?: () => void;
  /** Override the default label "Edit" (e.g., "Edit holdings") */
  editLabel?: string;
  /** Optional right-side custom actions; placed to the left of the Edit button */
  actionsRight?: React.ReactNode;
  /** Extra classnames for the outer wrapper */
  className?: string;
  /** If true, render a subtle bottom border under the header */
  withDivider?: boolean;
};

export default function SectionHeader({
  title,
  subtitle,
  canEdit,
  onEdit,
  editLabel = 'Edit',
  actionsRight,
  className,
  withDivider = true,
}: SectionHeaderProps) {
  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-3',
        withDivider && 'border-b border-black/5',
        className,
      )}
    >
      <div className="min-w-0 py-2">
        <h2 className="text-base font-serif text-neutral-900 truncate">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-neutral-600 truncate">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 py-2">
        {actionsRight}
        {canEdit && typeof onEdit === 'function' ? (
          <button
            type="button"
            onClick={onEdit}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-2xl border text-sm px-3 py-1.5',
              'border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
            )}
            aria-label={editLabel}
          >
            <PencilIcon className="h-4 w-4" />
            <span className="whitespace-nowrap">{editLabel}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 13.5V16h2.5l7.36-7.36-2.5-2.5L4 13.5zm9.85-8.35l1.99 1.99a.5.5 0 010 .7l-1.14 1.14-2.69-2.69 1.14-1.14a.5.5 0 01.7 0z" />
    </svg>
  );
}