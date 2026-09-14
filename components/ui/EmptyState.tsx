import * as React from 'react';
import clsx from 'clsx';

export type EmptyStateProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section className={clsx('card flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-azure/[0.1] text-azure">{icon}</div> : null}
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      {description ? <div className="mt-2 max-w-md text-sm leading-6 text-ink/60">{description}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
