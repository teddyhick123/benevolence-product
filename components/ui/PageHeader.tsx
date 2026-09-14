import * as React from 'react';
import clsx from 'clsx';

export type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/** A predictable, editorial page introduction with a responsive actions area. */
export function PageHeader({ title, description, eyebrow, actions, children, className }: PageHeaderProps) {
  return (
    <header className={clsx('flex flex-col gap-5 border-b border-ink/10 pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 max-w-3xl flex-1">
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-azure-deep">{eyebrow}</p> : null}
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
        {description ? <div className="mt-2 text-sm leading-6 text-ink/60 sm:text-base">{description}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
