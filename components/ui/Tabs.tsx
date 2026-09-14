'use client';

import * as React from 'react';
import clsx from 'clsx';

export type TabOption<_T extends string> = {
  value: _T;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
};

export type TabsProps<T extends string> = {
  tabs: readonly TabOption<T>[];
  value: T;
  onValueChange: (_value: T) => void;
  label: string;
  className?: string;
};

/** Horizontal tabs for switching peer views. Use `SegmentedControl` for compact filters. */
export function Tabs<T extends string>({ tabs, value, onValueChange, label, className }: TabsProps<T>) {
  return (
    <div className={clsx('border-b border-ink/10', className)} role="tablist" aria-label={label}>
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={tab.disabled}
              onClick={() => onValueChange(tab.value)}
              className={clsx(
                'ui-focus-ring inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                active ? 'border-azure text-azure-deep' : 'border-transparent text-ink/60 hover:border-ink/20 hover:text-ink',
              )}
            >
              {tab.label}
              {typeof tab.count === 'number' ? <span className={clsx('rounded-full px-1.5 py-0.5 text-xs', active ? 'bg-azure/10 text-azure-deep' : 'bg-ink/[0.06] text-ink/60')}>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SegmentedControlProps<T extends string> = TabsProps<T>;

export function SegmentedControl<T extends string>({ tabs, value, onValueChange, label, className }: SegmentedControlProps<T>) {
  return (
    <div className={clsx('inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-ink/10 bg-white p-1 shadow-sm', className)} role="group" aria-label={label}>
      {tabs.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            disabled={segment.disabled}
            onClick={() => onValueChange(segment.value)}
            className={clsx(
              'ui-focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              active ? 'bg-azure text-white shadow-sm' : 'text-ink/60 hover:bg-azure/[0.08] hover:text-ink',
            )}
          >
            {segment.label}
            {typeof segment.count === 'number' ? <span className={clsx('rounded-full px-1.5 py-0.5 text-xs', active ? 'bg-white/20 text-white' : 'bg-ink/[0.06] text-ink/60')}>{segment.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
