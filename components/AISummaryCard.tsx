// components/AISummaryCard.tsx
'use client';
import { useEffect, useState } from 'react';

export default function AISummaryCard({ portfolioId }: { portfolioId: string }) {
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/summary`, { cache: 'no-store' });
        const j = await r.json();
        if (mounted) setSummary(j?.summary || 'No summary available.');
      } catch {
        if (mounted) setSummary('AI summary unavailable.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId]);

  return (
    <div className="card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
      {loading ? (
        <div className="space-y-2">
          <div className="h-4 w-3/4 bg-neutral-200 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-neutral-200 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-neutral-200 rounded animate-pulse" />
        </div>
      ) : (
        <p className="text-sm leading-6">{summary}</p>
      )}
    </div>
  );
}