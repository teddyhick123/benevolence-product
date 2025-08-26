'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KpiTrend from '@/components/vis/KpiTrend';
import SectorEmissionsBar from '@/components/vis/SectorEmissionsBar';

export type CarouselItem = {
  id: string;   // e.g., 'kpi_waci', 'kpi_femiss', 'sector_emissions'
  label: string;
};

type Props = {
  items: CarouselItem[];
  portfolioId: string;
  initialId?: string;
  autoPlayMs?: number;        // default 8000
  onChange?: (id: string) => void;
};

/**
 * VisualCarousel: smooth, accessible carousel for portfolio visualizations.
 * - Keyboard support (←/→, Home/End)
 * - Autoplay with hover/focus pause
 * - Swipe on touch devices
 * - Pills to jump to a specific viz
 */
export default function VisualCarousel({ items, portfolioId, initialId, autoPlayMs = 8000, onChange }: Props) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const startIndex = useMemo(() =>
    hasItems ? Math.max(0, items.findIndex(i => i.id === (initialId || ''))) : 0,
  [hasItems, items, initialId]);

  const [index, setIndex] = useState(startIndex === -1 ? 0 : startIndex);
  const [isPaused, setPaused] = useState(false);
  const wrap = useCallback((n: number) => (n + items.length) % items.length, [items.length]);
  const go = useCallback((n: number) => {
    const next = wrap(n);
    setIndex(next);
    onChange?.(items[next].id);
  }, [items, onChange, wrap]);
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  // Autoplay with hover/focus pause
  useEffect(() => {
    if (!hasItems || autoPlayMs <= 0 || isPaused) return;
    const t = setInterval(next, autoPlayMs);
    return () => clearInterval(t);
  }, [hasItems, autoPlayMs, isPaused, next]);

  // Touch swipe
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(dx) > 40) {
      dx < 0 ? next() : prev();
    }
    touchStartX.current = null;
  };

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(items.length - 1); }
  };

  if (!hasItems) {
    return <div className="card p-4 text-sm text-neutral-600">No visualizations configured.</div>;
  }

  return (
    <div
      className="card p-4 space-y-3 select-none"
      role="region"
      aria-label="Portfolio visualizations carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-600">Visualization</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous visualization"
            className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-white shadow-sm"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next visualization"
            className="px-2 py-1 rounded-2xl border border-black/10 hover:bg-white shadow-sm"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Slides */}
      <CarouselSlides index={index}>
        {items.map((it, i) => (
          <div key={it.id} className="w-full">
            {/* Only mount neighbors for perf */}
            {Math.abs(i - index) <= 1 || Math.abs(i - index) >= items.length - 1 ? (
              it.id === 'kpi_waci' ? (
                <KpiTrend portfolioId={portfolioId} metric="WACI" title="WACI trend" />
              ) : it.id === 'kpi_femiss' ? (
                <KpiTrend portfolioId={portfolioId} metric="FEMISS" title="FEMISS trend" />
              ) : it.id === 'sector_emissions' ? (
                <SectorEmissionsBar portfolioId={portfolioId} />
              ) : (
                <div className="card p-4 text-sm text-neutral-600">Unknown widget: {it.label}</div>
              )
            ) : null}
          </div>
        ))}
      </CarouselSlides>

      {/* Pills */}
      <div className="flex flex-wrap gap-1 pt-2">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => go(i)}
            aria-current={i === index ? 'true' : 'false'}
            className={`text-xs px-2 py-1 rounded-full border transition ${
              i === index ? 'bg-azure/10 text-azure border-azure/20' : 'border-black/10 hover:bg-white'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Slides wrapper with smooth translate/opacity transitions.
 * Keeps DOM simple and avoids layout thrash.
 */
function CarouselSlides({ index, children }: { index: number; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-hidden" aria-live="polite">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * (width || 1)}px)` }}
      >
        {React.Children.map(children, (child, i) => (
          <div
            className={`shrink-0 w-full transition-opacity duration-500 ${i === index ? 'opacity-100' : 'opacity-70'}`}
            aria-hidden={i !== index}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}