'use client';

import { useState, useEffect } from 'react';
import { X, Filter } from 'lucide-react';

interface FilterState {
  sector?: string;
  state?: string;
  minRating?: number;
  maxRating?: number;
  minRevenue?: number;
  maxRevenue?: number;
  impactFocus?: string[];
  // Portfolio-specific filters
  interactionStatus?: string;
  assignedTo?: string;
}

interface CharityFilterSidebarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  view?: 'discovery' | 'portfolio';
  onClearFilters: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const SECTORS = [
  'Education',
  'Health',
  'Environment',
  'Human Services',
  'Arts & Culture',
  'International',
  'Animals',
  'Religion',
  'Community Development',
  'Research & Public Policy',
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const IMPACT_FOCUS_AREAS = [
  'Climate Action',
  'Youth Programs',
  'Education Access',
  'Healthcare Access',
  'Poverty Alleviation',
  'Disaster Relief',
  'Conservation',
  'Mental Health',
  'Food Security',
  'Housing',
];

const INTERACTION_STATUSES = [
  'new',
  'reviewing',
  'contacted',
  'in_discussion',
  'committed',
  'declined',
];

export default function CharityFilterSidebar({
  filters,
  onFiltersChange,
  view = 'discovery',
  onClearFilters,
  isOpen = false,
  onClose,
}: CharityFilterSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleImpactFocus = (focus: string) => {
    const current = filters.impactFocus || [];
    const updated = current.includes(focus)
      ? current.filter((f) => f !== focus)
      : [...current, focus];
    updateFilter('impactFocus', updated.length > 0 ? updated : undefined);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const sidebarContent = (
    <div className={`bg-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-80'}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <>
            <div className="flex items-center">
              <Filter className="w-5 h-5 mr-2 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            </div>
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="text-sm text-azure hover:text-azure/80 font-medium"
              >
                Clear All
              </button>
            )}
          </>
        )}
        {/* Desktop collapse button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:block p-1 hover:bg-gray-100 rounded"
        >
          {isCollapsed ? <Filter className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Filters Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* Sector Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sector
            </label>
            <select
              value={filters.sector || ''}
              onChange={(e) => updateFilter('sector', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
            >
              <option value="">All Sectors</option>
              {SECTORS.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </div>

          {/* State Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              State
            </label>
            <select
              value={filters.state || ''}
              onChange={(e) => updateFilter('state', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
            >
              <option value="">All States</option>
              {US_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>

          {/* Rating Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Charity Navigator Rating
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Minimum</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.minRating || 0}
                  onChange={(e) => updateFilter('minRating', parseInt(e.target.value) || undefined)}
                  className="w-full"
                />
                <div className="text-sm text-gray-600">{filters.minRating || 0}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Maximum</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.maxRating || 100}
                  onChange={(e) => updateFilter('maxRating', parseInt(e.target.value) || undefined)}
                  className="w-full"
                />
                <div className="text-sm text-gray-600">{filters.maxRating || 100}</div>
              </div>
            </div>
          </div>

          {/* Revenue Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Annual Revenue
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Minimum</label>
                <select
                  value={filters.minRevenue || ''}
                  onChange={(e) => updateFilter('minRevenue', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Any</option>
                  <option value="100000">$100K+</option>
                  <option value="500000">$500K+</option>
                  <option value="1000000">$1M+</option>
                  <option value="5000000">$5M+</option>
                  <option value="10000000">$10M+</option>
                  <option value="50000000">$50M+</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Maximum</label>
                <select
                  value={filters.maxRevenue || ''}
                  onChange={(e) => updateFilter('maxRevenue', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Any</option>
                  <option value="1000000">Up to $1M</option>
                  <option value="5000000">Up to $5M</option>
                  <option value="10000000">Up to $10M</option>
                  <option value="50000000">Up to $50M</option>
                  <option value="100000000">Up to $100M</option>
                </select>
              </div>
            </div>
          </div>

          {/* Impact Focus Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Impact Focus
            </label>
            <div className="space-y-2">
              {IMPACT_FOCUS_AREAS.map((focus) => (
                <label key={focus} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={(filters.impactFocus || []).includes(focus)}
                    onChange={() => toggleImpactFocus(focus)}
                    className="rounded border-gray-300 text-azure focus:ring-azure"
                  />
                  <span className="ml-2 text-sm text-gray-700">{focus}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Portfolio-Specific Filters */}
          {view === 'portfolio' && (
            <>
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Portfolio Filters
                </h3>
              </div>

              {/* Interaction Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interaction Status
                </label>
                <select
                  value={filters.interactionStatus || ''}
                  onChange={(e) => updateFilter('interactionStatus', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                >
                  <option value="">All Statuses</option>
                  {INTERACTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <div className="hidden lg:block border-r border-gray-200 flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          {/* Sidebar panel */}
          <div className="relative z-10 h-full overflow-y-auto border-r border-gray-200 shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
