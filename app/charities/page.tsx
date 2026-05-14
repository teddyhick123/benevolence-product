'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, SlidersHorizontal } from 'lucide-react';
import CharityCard from '@/components/charities/CharityCard';
import CharityFilterSidebar from '@/components/charities/CharityFilterSidebar';
import AddToPortfolioModal from '@/components/charities/AddToPortfolioModal';

type ViewMode = 'discovery' | 'portfolio' | 'saved';

interface FilterState {
  sector?: string;
  state?: string;
  minRating?: number;
  maxRating?: number;
  minRevenue?: number;
  maxRevenue?: number;
  impactFocus?: string[];
  interactionStatus?: string;
}

export default function CharitiesPage() {
  const router = useRouter();

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('discovery');

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const [sortBy, setSortBy] = useState('relevance');

  // Data
  const [charities, setCharities] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Portfolio
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  // Modal
  const [addToPortfolioModal, setAddToPortfolioModal] = useState<{
    isOpen: boolean;
    charityName: string;
    charityEin: string;
  }>({
    isOpen: false,
    charityName: '',
    charityEin: '',
  });

  // Saved watchlist
  const [savedItems, setSavedItems] = useState<{ ein: string; name: string }[]>([]);

  // Mobile filter sidebar
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<{ id: string; ein: string; name: string; location: string }[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const autocompleteDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Fetch user's default portfolio for "My Portfolio" view
  useEffect(() => {
    if (viewMode === 'portfolio') {
      fetchDefaultPortfolio();
    }
    if (viewMode === 'saved') {
      try {
        setSavedItems(JSON.parse(localStorage.getItem('charity_watchlist') || '[]'));
      } catch { setSavedItems([]); }
    }
  }, [viewMode]);

  // Debounced search query for main charity fetch (avoids hitting DB on every keystroke)
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // Fetch charities when view, debounced search, filters, or page changes
  useEffect(() => {
    fetchCharities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, debouncedQuery, filters, sortBy, page, portfolioId]);

  const fetchDefaultPortfolio = async () => {
    try {
      const response = await fetch('/api/me');
      if (response.ok) {
        const data = await response.json();
        if (data.recommended_portfolio_id) {
          setPortfolioId(data.recommended_portfolio_id);
        }
      }
    } catch {
      // silent
    }
  };

  // Autocomplete: debounced fetch on searchQuery change
  useEffect(() => {
    if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);

    if (searchQuery.length < 2) {
      setSuggestions([]);
      setSuggestionsVisible(false);
      return;
    }

    autocompleteDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/charities/search/autocomplete?q=${encodeURIComponent(searchQuery)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setSuggestionsVisible(true);
        }
      } catch {
        // silent
      }
    }, 300);

    return () => {
      if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);
    };
  }, [searchQuery]);

  // Close autocomplete on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSuggestionsVisible(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCharities = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      // Search query
      if (debouncedQuery) {
        params.append('q', debouncedQuery);
      }

      // Filters
      if (filters.sector) params.append('sector', filters.sector);
      if (filters.state) params.append('state', filters.state);
      if (filters.minRating) params.append('min_rating', filters.minRating.toString());
      if (filters.maxRating) params.append('max_rating', filters.maxRating.toString());
      if (filters.minRevenue) params.append('min_revenue', filters.minRevenue.toString());
      if (filters.maxRevenue) params.append('max_revenue', filters.maxRevenue.toString());
      if (filters.impactFocus && filters.impactFocus.length > 0) {
        params.append('impact_focus', filters.impactFocus.join(','));
      }

      // Sort and pagination
      params.append('sort', sortBy);
      params.append('page', page.toString());
      params.append('limit', '20');

      // Portfolio-specific view
      if (viewMode === 'portfolio' && portfolioId) {
        params.append('portfolio_id', portfolioId);
      }

      const response = await fetch(`/api/charities?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setCharities(data.data.charities || []);
        setTotal(data.data.total || 0);
        setTotalPages(data.data.pages || 0);
      }
    } catch (err) {
      console.error('Error fetching charities:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCharities();
  };

  const handleClearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const handleAddToPortfolio = (ein: string) => {
    const charity = charities.find((c) => c.ein === ein);
    if (charity) {
      setAddToPortfolioModal({
        isOpen: true,
        charityName: charity.name,
        charityEin: charity.ein,
      });
    }
  };

  const handleModalClose = () => {
    setAddToPortfolioModal({
      isOpen: false,
      charityName: '',
      charityEin: '',
    });
  };

  const handleModalSuccess = () => {
    // Refresh data if in portfolio view
    if (viewMode === 'portfolio') {
      fetchCharities();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Charities</h1>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">
                {viewMode === 'discovery'
                  ? 'Search and discover charitable organizations'
                  : 'Manage charities in your portfolio'}
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setViewMode('discovery');
                  setPage(1);
                }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors ${
                  viewMode === 'discovery'
                    ? 'bg-azure text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Charities
              </button>
              <button
                onClick={() => {
                  setViewMode('portfolio');
                  setPage(1);
                }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors ${
                  viewMode === 'portfolio'
                    ? 'bg-azure text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Portfolio
              </button>
              <button
                onClick={() => {
                  setViewMode('saved');
                  setPage(1);
                }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition-colors ${
                  viewMode === 'saved'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ★ Saved
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div ref={searchContainerRef} className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                onFocus={() => suggestions.length > 0 && setSuggestionsVisible(true)}
                onKeyDown={(e) => e.key === 'Escape' && setSuggestionsVisible(false)}
                placeholder="Search by name, EIN, or location..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-azure"
              />
              {suggestionsVisible && suggestions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg max-h-72 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchQuery(s.name);
                        setSuggestionsVisible(false);
                        setPage(1);
                      }}
                      className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500">EIN: {s.ein}{s.location ? ` · ${s.location}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {/* Mobile Filter Toggle */}
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                <SlidersHorizontal className="w-5 h-5 text-gray-600" />
                <span className="text-gray-700">Filters</span>
                {Object.keys(filters).length > 0 && (
                  <span className="bg-azure text-white text-xs px-2 py-0.5 rounded-full">
                    {Object.keys(filters).length}
                  </span>
                )}
              </button>
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full sm:w-auto appearance-none pl-4 pr-10 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-azure focus:border-azure"
                >
                  <option value="relevance">Relevance</option>
                  <option value="rating">Rating (High to Low)</option>
                  <option value="revenue">Revenue (High to Low)</option>
                  <option value="name">Name (A-Z)</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex gap-6">
          {/* Filters Sidebar */}
          <CharityFilterSidebar
            filters={filters}
            onFiltersChange={setFilters}
            view={viewMode}
            onClearFilters={handleClearFilters}
            isOpen={mobileFiltersOpen}
            onClose={() => setMobileFiltersOpen(false)}
          />

          {/* Charities Grid */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="mb-6">
              <p className="text-gray-600">
                {isLoading ? (
                  'Loading...'
                ) : (
                  <>
                    Showing {charities.length} of {total.toLocaleString()} charities
                    {searchQuery && ` for "${searchQuery}"`}
                  </>
                )}
              </p>
            </div>

            {/* Saved watchlist view */}
            {viewMode === 'saved' ? (
              savedItems.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
                  <div className="text-5xl mb-3">☆</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No saved charities</h3>
                  <p className="text-sm text-gray-500 mb-4">Click &quot;Save for Later&quot; on any charity detail page to bookmark it here.</p>
                  <button onClick={() => setViewMode('discovery')} className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium">
                    Discover Charities
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedItems.map(item => (
                    <a key={item.ein} href={`/charities/${item.ein}`}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-azure/40 hover:shadow-sm transition-all">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-400">EIN {item.ein}</p>
                      </div>
                      <span className="text-amber-500 text-lg">★</span>
                    </a>
                  ))}
                </div>
              )
            ) : isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                  </div>
                ))}
              </div>
            ) : charities.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {charities.map((charity) => (
                    <CharityCard
                      key={charity.id}
                      charity={charity}
                      view={viewMode}
                      onAddToPortfolio={handleAddToPortfolio}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>

                    {/* Desktop: windowed page numbers */}
                    {(() => {
                      const delta = 2;
                      const left = Math.max(1, page - delta);
                      const right = Math.min(totalPages, page + delta);
                      const pages: (number | '...')[] = [];
                      if (left > 1) { pages.push(1); if (left > 2) pages.push('...'); }
                      for (let p = left; p <= right; p++) pages.push(p);
                      if (right < totalPages) { if (right < totalPages - 1) pages.push('...'); pages.push(totalPages); }
                      return pages.map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="hidden sm:block px-2 py-2 text-gray-500">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={`hidden sm:block px-4 py-2 rounded-md ${
                              page === p ? 'bg-azure text-white' : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      );
                    })()}

                    {/* Mobile: show current page indicator */}
                    <span className="sm:hidden px-3 py-2 text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
                {viewMode === 'discovery' && total === 0 && !searchQuery && Object.keys(filters).length === 0 ? (
                  // Empty database state
                  <div className="max-w-md mx-auto px-6">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Charities Yet</h3>
                    <p className="text-gray-600 mb-6">
                      The charity database is currently empty. Import charities from ProPublica to get started.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                      <p className="text-sm text-gray-700 font-medium mb-2">Run the import script:</p>
                      <code className="text-xs bg-gray-900 text-green-400 px-3 py-2 rounded block font-mono">
                        npx ts-node scripts/import-charities-propublica.ts
                      </code>
                    </div>
                    <p className="text-xs text-gray-500">
                      This will import charity data from the ProPublica API
                    </p>
                  </div>
                ) : viewMode === 'portfolio' ? (
                  // Empty portfolio state
                  <div className="max-w-md mx-auto px-6">
                    <div className="text-6xl mb-4">🎯</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Your Portfolio is Empty</h3>
                    <p className="text-gray-600 mb-6">
                      You haven&apos;t added any charities to your portfolio yet. Browse all charities to discover and add organizations.
                    </p>
                    <button
                      onClick={() => setViewMode('discovery')}
                      className="px-6 py-3 bg-azure text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                    >
                      Discover Charities
                    </button>
                  </div>
                ) : (
                  // No search results state
                  <div className="max-w-md mx-auto px-6">
                    <div className="text-6xl mb-4">🔍</div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Found</h3>
                    <p className="text-gray-600 mb-6">
                      No charities match your current search and filters. Try adjusting your criteria.
                    </p>
                    {(searchQuery || Object.keys(filters).length > 0) && (
                      <div className="space-y-3">
                        {searchQuery && (
                          <div className="flex items-center justify-center gap-2 text-sm">
                            <span className="text-gray-500">Search:</span>
                            <span className="px-3 py-1 bg-gray-100 rounded-full text-gray-700">{searchQuery}</span>
                            <button
                              onClick={() => setSearchQuery('')}
                              className="text-azure hover:text-azure/80"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                        {Object.keys(filters).length > 0 && (
                          <button
                            onClick={handleClearFilters}
                            className="text-azure hover:text-azure/80 text-sm font-medium"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add to Portfolio Modal */}
      <AddToPortfolioModal
        isOpen={addToPortfolioModal.isOpen}
        onClose={handleModalClose}
        charityName={addToPortfolioModal.charityName}
        charityEin={addToPortfolioModal.charityEin}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
