'use client';

import { useState, useEffect } from 'react';

type SearchResult = {
  name: string;
  ein: string;
  location: string;
  website?: string;
  sector?: string;
  mission?: string;
};

type Props = {
  onSelect: (result: SearchResult) => void;
};

export default function CharitySearchWidget({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 3) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      searchCharities(query);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const searchCharities = async (searchQuery: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/external/charity-search?q=${encodeURIComponent(searchQuery)}`, {
        cache: 'no-store'
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to search charities');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-neutral-600 mb-4">
          Search the IRS database of tax-exempt organizations to find and add recommendations quickly.
        </p>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by organization name..."
            className="w-full px-4 py-3 pl-10 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="inline-block w-6 h-6 border-4 border-azure/30 border-t-azure rounded-full animate-spin mr-3"></div>
          <span className="text-neutral-600">Searching...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <div className="text-sm text-neutral-600 mb-2">
            Found {results.length} organization{results.length !== 1 ? 's' : ''}
          </div>
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(result)}
              className="w-full text-left p-4 border border-neutral-200 rounded-lg hover:border-azure/40 hover:bg-azure/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-neutral-900 group-hover:text-azure transition-colors">
                    {result.name}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-600">
                    {result.ein && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        EIN: {result.ein}
                      </span>
                    )}
                    {result.location && (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {result.location}
                      </span>
                    )}
                  </div>
                  {result.mission && (
                    <p className="text-sm text-neutral-600 mt-2 line-clamp-2">
                      {result.mission}
                    </p>
                  )}
                </div>
                <div className="text-azure opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && query.length >= 3 && results.length === 0 && !error && (
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-neutral-600">No organizations found matching "{query}"</p>
          <p className="text-sm text-neutral-500 mt-1">Try adjusting your search terms</p>
        </div>
      )}

      {/* Instructions */}
      {!query && (
        <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
          <h4 className="text-sm font-medium text-neutral-900 mb-2">Search Tips</h4>
          <ul className="text-sm text-neutral-600 space-y-1">
            <li>• Enter at least 3 characters to start searching</li>
            <li>• Search by full or partial organization name</li>
            <li>• Click a result to auto-fill the form with organization details</li>
            <li>• You can edit any details before saving</li>
          </ul>
        </div>
      )}
    </div>
  );
}
