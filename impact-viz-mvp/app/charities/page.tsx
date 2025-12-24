'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ChevronDown } from 'lucide-react';
import CharityCard from '@/components/charities/CharityCard';
import CharityFilterSidebar from '@/components/charities/CharityFilterSidebar';
import AddToPortfolioModal from '@/components/charities/AddToPortfolioModal';

type ViewMode = 'discovery' | 'portfolio';

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
  const searchParams = useSearchParams();

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

  // Fetch user's default portfolio for "My Portfolio" view
  useEffect(() => {
    if (viewMode === 'portfolio') {
      fetchDefaultPortfolio();
    }
  }, [viewMode]);

  // Fetch charities when view, search, filters, or page changes
  useEffect(() => {
    fetchCharities();
  }, [viewMode, searchQuery, filters, sortBy, page, portfolioId]);

  const fetchDefaultPortfolio = async () => {
    try {
      const response = await fetch('/api/portfolios');
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          setPortfolioId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err);
    }
  };

  const fetchCharities = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();

      // Search query
      if (searchQuery) {
        params.append('q', searchQuery);
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Charities</h1>
              <p className="text-gray-600 mt-1">
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
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'discovery'
                    ? 'bg-blue-600 text-white'
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
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'portfolio'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Portfolio
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, EIN, or location..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none pl-4 pr-10 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="relevance">Relevance</option>
                <option value="rating">Rating (High to Low)</option>
                <option value="revenue">Revenue (High to Low)</option>
                <option value="name">Name (A-Z)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          {/* Filters Sidebar */}
          <CharityFilterSidebar
            filters={filters}
            onFiltersChange={setFilters}
            view={viewMode}
            onClearFilters={handleClearFilters}
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

            {/* Charities Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <div className="mt-8 flex justify-center gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>

                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-4 py-2 rounded-md ${
                            page === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {totalPages > 5 && (
                      <>
                        <span className="px-4 py-2">...</span>
                        <button
                          onClick={() => setPage(totalPages)}
                          className={`px-4 py-2 rounded-md ${
                            page === totalPages
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-600">No charities found. Try adjusting your filters or search query.</p>
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
