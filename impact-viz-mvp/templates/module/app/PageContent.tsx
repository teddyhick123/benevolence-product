'use client';

/**
 * {ModuleName} Page Content
 *
 * Client component for the {module_name} dashboard page.
 * Handles interactivity and state management.
 *
 * Place at: /app/dashboard/{module_name}/{ModuleName}PageContent.tsx
 */

import { useState } from 'react';
import {ModuleName}ItemList from '@/components/{module_name}/ItemList';
import {ModuleName}ItemForm from '@/components/{module_name}/ItemForm';

interface {ModuleName}PageContentProps {
  orgId: string;
  userRole: string;
}

// Type definitions
interface {ModuleName}Item {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
}

export default function {ModuleName}PageContent({
  orgId,
  userRole,
}: {ModuleName}PageContentProps) {
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedItem, setSelectedItem] = useState<{ModuleName}Item | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const canEdit = ['admin', 'owner'].includes(userRole);

  const handleItemClick = (item: {ModuleName}Item) => {
    if (canEdit) {
      setSelectedItem(item);
      setView('edit');
    }
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setView('create');
  };

  const handleSave = async (data: Partial<{ModuleName}Item>) => {
    const endpoint = selectedItem
      ? `/api/{module_name}/${selectedItem.id}`
      : '/api/{module_name}';

    const method = selectedItem ? 'PATCH' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedItem ? data : { ...data, org_id: orgId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save item');
    }

    // Refresh list and go back to list view
    setRefreshKey(k => k + 1);
    setView('list');
    setSelectedItem(null);
  };

  const handleCancel = () => {
    setView('list');
    setSelectedItem(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {ModuleName}
          </h1>
          <p className="text-neutral-500 mt-1">
            Manage your {module_name} items
          </p>
        </div>

        {canEdit && view === 'list' && (
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-azure text-white rounded-lg font-medium hover:bg-azure/90 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Item
          </button>
        )}
      </div>

      {/* Content */}
      {view === 'list' && (
        <{ModuleName}ItemList
          key={refreshKey}
          orgId={orgId}
          onItemClick={canEdit ? handleItemClick : undefined}
        />
      )}

      {(view === 'create' || view === 'edit') && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-lg font-medium text-neutral-900 mb-6">
            {view === 'create' ? 'Create New Item' : 'Edit Item'}
          </h2>
          <{ModuleName}ItemForm
            orgId={orgId}
            item={selectedItem}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
}
