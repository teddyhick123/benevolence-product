'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const DEBUG_GRID = false; // set to false to remove debug outlines

export type PeopleGridWidgetProps = {
  /** Total number of people served */
  total: number;
  /** How many people a single icon represents */
  perUnit?: number; // default 10
  /** Pixel size of each person icon */
  iconSize?: number; // default 16
  /** Icon color (theme-aware by default) */
  color?: string; // default var(--azure)
  /** Optional target for context */
  target?: number;
  /** Optional widget title */
  title?: string;
};

function PersonIcon({ size = 16, color = 'var(--azure, #0ea5e9)', fillFraction = 1 }: { size?: number; color?: string; fillFraction?: number }) {
  // Unique clip id per icon instance
  const clipId = useId().replace(/:/g, '-');
  const frac = Math.max(0, Math.min(1, fillFraction));
  const w = 24, h = 24; // viewBox
  const filledWidth = w * frac;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="block"
    >
      <defs>
        <clipPath id={`clip-${clipId}`}>
          <rect x={0} y={0} width={filledWidth} height={h} />
        </clipPath>
      </defs>
      {/* Base silhouette in neutral light for unfilled portion */}
      <g fill="#e5e7eb">
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </g>
      {/* Filled overlay clipped to fraction */}
      <g fill={color} clipPath={`url(#clip-${clipId})`}>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </g>
    </svg>
  );
}

export default function PeopleGridWidget({
  total,
  perUnit = 10,
  iconSize = 16,
  color = 'var(--azure, #0ea5e9)',
  target,
  title = 'People Helped',
}: PeopleGridWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 320, h: 220 });

  useEffect(() => {
    const gridEl = gridRef.current;
    const contEl = containerRef.current;
    if (!gridEl || !contEl) return;

    const update = (w: number, h: number) => setDims({ w: Math.round(w), h: Math.round(h) });

    const roGrid = new ResizeObserver((entries) => {
      for (const e of entries) {
        update(dims.w, e.contentRect.height);
      }
    });
    const roCont = new ResizeObserver((entries) => {
      for (const e of entries) {
        update(e.contentRect.width, dims.h);
      }
    });
    roGrid.observe(gridEl);
    roCont.observe(contEl);
    return () => { roGrid.disconnect(); roCont.disconnect(); };
  }, [dims.w, dims.h]);

  const gap = 4; // px gap between icons

  const units = useMemo(() => Math.max(0, Math.ceil(total / perUnit)), [total, perUnit]);
  const remainder = useMemo(() => (total % perUnit === 0 ? 0 : (total % perUnit) / perUnit), [total, perUnit]);

  const layout = useMemo(() => {
    if (units <= 0 || dims.w <= 0 || dims.h <= 0) return { cols: 1, rows: 1, size: 12 };

    const aspect = dims.w / Math.max(1, dims.h);
    const approxCols = Math.max(1, Math.round(Math.sqrt(units * aspect)));
    let best = { cols: 1, rows: units, size: 0 };
    const minCols = Math.max(1, approxCols - 6);
    const maxCols = approxCols + 6;

    for (let c = minCols; c <= maxCols; c++) {
      const r = Math.max(1, Math.ceil(units / c));
      const cellW = Math.floor((dims.w - (c - 1) * gap) / c);
      const cellH = Math.floor((dims.h - (r - 1) * gap) / r);
      const size = Math.max(0, Math.min(cellW, cellH));
      if (size > best.size) best = { cols: c, rows: r, size };
    }

    const maxCap = 160;
    const minCap = 8;
    // snap size down to ensure exact fit by construction (avoid fractional rounding overflow)
    const fitW = Math.floor((dims.w - (best.cols - 1) * gap) / best.cols);
    const fitH = Math.floor((dims.h - (best.rows - 1) * gap) / best.rows);
    const snapped = Math.min(best.size, fitW, fitH);
    // subtract a tiny safety margin to avoid 1px clipping from rounding/padding
    const finalSize = Math.max(minCap, Math.min(snapped - 1, maxCap));
    return { cols: best.cols, rows: best.rows, size: finalSize };
  }, [units, dims.w, dims.h]);

  const ariaLabel = useMemo(() => {
    const unitText = perUnit === 1 ? 'person per icon' : `${perUnit} people per icon`;
    return `${total.toLocaleString()} people helped (${unitText}), displayed as ${units} icons.`;
  }, [total, perUnit, units]);

  return (
    <div ref={containerRef} className={`w-full h-full flex flex-col overflow-hidden min-w-0 grow ${DEBUG_GRID ? 'border border-dashed border-green-400' : ''}`}>
      <div className="text-sm text-neutral-600 mb-2 flex items-center justify-between shrink-0">
        <span>{title}</span>
        {typeof target === 'number' && (
          <span className="text-[11px] text-neutral-500">{Math.min(100, Math.round((total / Math.max(1, target)) * 100))}% of target</span>
        )}
      </div>

      <div
        ref={gridRef}
        className={`flex-1 min-h-0 min-w-0 overflow-hidden relative ${DEBUG_GRID ? 'border border-dashed border-red-400' : ''}`}
        aria-label={ariaLabel}
      >
        {DEBUG_GRID && (
          <div className="absolute top-1 right-1 z-10 text-[10px] bg-white/80 rounded px-1 py-0.5 border border-dashed border-red-300">
            {`w:${dims.w} h:${dims.h} cols:${layout.cols} rows:${layout.rows} sz:${layout.size}`}
          </div>
        )}
        <div
          className={`grid ${DEBUG_GRID ? 'border border-dashed border-azure/40' : ''}`}
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, ${layout.size}px)`,
            gap: `${gap}px`,
            width: '100%',
            height: '100%',
            alignContent: 'center',
            justifyContent: 'space-between',
          }}
        >
          {Array.from({ length: units }).map((_, i) => {
            const isLast = i === units - 1 && remainder > 0;
            const fraction = isLast ? remainder : 1;
            return <PersonIcon key={i} size={layout.size} color={color} fillFraction={fraction} />;
          })}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-neutral-600 flex items-center justify-between shrink-0">
        <span>
          {total.toLocaleString()} people <span className="opacity-70">(1 icon = {perUnit.toLocaleString()})</span>
        </span>
        {typeof target === 'number' && (
          <span className="tabular-nums">
            {total.toLocaleString()} / {target.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}