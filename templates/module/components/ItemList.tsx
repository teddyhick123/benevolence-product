'use client';

/**
 * {ModuleName} Item List Component
 *
 * Displays a list of {module_name} items with filtering and actions.
 * Place at: /components/{module_name}/ItemList.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@/lib/supabase';

// Type definitions
interface {ModuleName}Item {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
}

interface ItemListProps {
  orgId: string;
  onItemClick?: (item: {ModuleName}Item) => void;
}

export default function {ModuleName}ItemList({ orgId, onItemClick }: ItemListProps) {
  const [items, setItems] = useState<{ModuleName}Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = createBrowserClient();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('{module_name}_items')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, searchTerm, supabase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-neutral-100 text-neutral-600',
      archived: 'bg-amber-100 text-amber-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors] || colors.inactive}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-azure border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchItems}
          className="mt-2 text-sm text-red-700 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/20 focus:border-azure"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/20 focus:border-azure"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Item count */}
      <p className="text-sm text-neutral-500">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </p>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500">No items found</p>
          <p className="text-sm text-neutral-400 mt-1">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first item to get started'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick?.(item)}
              className={`
                p-4 rounded-lg border border-neutral-200 bg-white
                transition-all duration-200
                ${onItemClick ? 'cursor-pointer hover:border-azure hover:shadow-sm' : ''}
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-neutral-900 truncate">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-neutral-400">
                <span>
                  Created {new Date(item.created_at).toLocaleDateString()}
                </span>
                <span>
                  Updated {new Date(item.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
