import * as React from 'react';
import clsx from 'clsx';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padding?: CardPadding;
};

export function Card({ className, padding = 'md', ...props }: CardProps) {
  return <div className={clsx('card', paddingClasses[padding], className)} {...props} />;
}

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

export function CardHeader({ title, description, action, className, ...props }: CardHeaderProps) {
  return (
    <div className={clsx('flex items-start justify-between gap-4', className)} {...props}>
      <div className="min-w-0">
        <h2 className="font-serif text-xl leading-snug text-ink">{title}</h2>
        {description ? <div className="mt-1 text-sm leading-6 text-ink/60">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mt-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('mt-5 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4', className)} {...props} />;
}
