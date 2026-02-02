'use client';

import { useState, useEffect, useRef } from 'react';

interface CharityResult {
  id?: string;
  ein: string;
  name: string;
  city?: string;
  state?: string;
  sector?: string;
  annual_revenue?: number;
  source: 'local' | 'propublica';
}

interface LinkedCharity {
  id: string;
  ein: string;
  name: string;
  sector?: string;
  city?: string;
  state?: string;
}

export default function CharityLinkSearch({
  holdingId,
  linkedCharity,
  onLinked,
}: {
  holdingId: string;
  linkedCharity?: LinkedCharity | null;
  onLinked?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CharityResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/holdings/${holdingId}/search-charity?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setShowResults(true);
        }
      } catch {
        // Search failed silently
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, holdingId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLink = async (ein: string) => {
    setLinking(true);
    try {
      const res = await fetch(`/api/holdings/${holdingId}/link-charity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ein }),
      });
      if (res.ok) {
        setQuery('');
        setResults([]);
        setShowResults(false);
        onLinked?.();
      }
    } catch {
      // Link failed
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/holdings/${holdingId}/link-charity`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onLinked?.();
      }
    } catch {
      // Unlink failed
    } finally {
      setUnlinking(false);
    }
  };

  const formatRevenue = (amount?: number) => {
    if (!amount) return '';
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  // If already linked, show the linked charity with unlink option
  if (linkedCharity) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{linkedCharity.name}</p>
            <p className="text-xs text-neutral-500">
              EIN: {linkedCharity.ein}
              {linkedCharity.city && linkedCharity.state && ` \u00B7 ${linkedCharity.city}, ${linkedCharity.state}`}
            </p>
          </div>
        </div>
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-red-600 border border-neutral-300 hover:border-red-300 rounded-lg transition-colors disabled:opacity-50"
        >
          {unlinking ? 'Unlinking...' : 'Unlink'}
        </button>
      </div>
    );
  }

  // Search UI
  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by nonprofit name or EIN..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure/50 bg-white transition-all"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-azure/30 border-t-azure rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Search results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-xl border border-neutral-200 shadow-lg max-h-72 overflow-y-auto">
          {results.map((r, idx) => (
            <button
              key={`${r.ein}-${idx}`}
              onClick={() => handleLink(r.ein)}
              disabled={linking}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left border-b border-neutral-100 last:border-b-0 disabled:opacity-50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 truncate">{r.name}</p>
                <p className="text-xs text-neutral-500">
                  EIN: {r.ein}
                  {r.city && r.state && ` \u00B7 ${r.city}, ${r.state}`}
                  {r.sector && ` \u00B7 ${r.sector}`}
                  {r.annual_revenue ? ` \u00B7 ${formatRevenue(r.annual_revenue)} revenue` : ''}
                </p>
              </div>
              <span className="flex-shrink-0 ml-3 text-xs text-azure font-medium">
                {linking ? 'Linking...' : 'Link'}
              </span>
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-xl border border-neutral-200 shadow-lg p-4">
          <p className="text-sm text-neutral-500 text-center">No charities found for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
