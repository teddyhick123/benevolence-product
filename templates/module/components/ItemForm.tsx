'use client';

/**
 * {ModuleName} Item Form Component
 *
 * Form for creating/editing {module_name} items.
 * Place at: /components/{module_name}/ItemForm.tsx
 */

import { useState } from 'react';

// Type definitions
interface {ModuleName}Item {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
}

interface ItemFormProps {
  orgId: string;
  item?: {ModuleName}Item | null;  // If provided, edit mode
  onSave: (data: Partial<{ModuleName}Item>) => Promise<void>;
  onCancel: () => void;
}

export default function {ModuleName}ItemForm({
  orgId,
  item,
  onSave,
  onCancel,
}: ItemFormProps) {
  const isEditing = !!item;

  const [formData, setFormData] = useState({
    name: item?.name || '',
    description: item?.description || '',
    status: item?.status || 'active',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 200) {
      newErrors.name = 'Name must be 200 characters or less';
    }

    if (formData.description && formData.description.length > 2000) {
      newErrors.description = 'Description must be 2000 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSave({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        status: formData.status as 'active' | 'inactive' | 'archived',
      });
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Failed to save item',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name field */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Name *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter item name"
          className={`
            w-full px-4 py-2 border rounded-lg transition-colors
            focus:outline-none focus:ring-2 focus:ring-azure/20
            ${errors.name
              ? 'border-red-300 focus:border-red-500'
              : 'border-neutral-200 focus:border-azure'
            }
          `}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
        )}
      </div>

      {/* Description field */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Description
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Enter description (optional)"
          rows={4}
          className={`
            w-full px-4 py-2 border rounded-lg transition-colors resize-none
            focus:outline-none focus:ring-2 focus:ring-azure/20
            ${errors.description
              ? 'border-red-300 focus:border-red-500'
              : 'border-neutral-200 focus:border-azure'
            }
          `}
        />
        <div className="flex justify-between mt-1">
          {errors.description ? (
            <p className="text-sm text-red-600">{errors.description}</p>
          ) : (
            <span />
          )}
          <span className="text-xs text-neutral-400">
            {formData.description.length}/2000
          </span>
        </div>
      </div>

      {/* Status field (only in edit mode) */}
      {isEditing && (
        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Status
          </label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            className="w-full px-4 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/20 focus:border-azure"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      )}

      {/* Submit error */}
      {errors.submit && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{errors.submit}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-neutral-600 hover:text-neutral-900 font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-azure text-white rounded-lg font-medium hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Saving...
            </span>
          ) : isEditing ? (
            'Save Changes'
          ) : (
            'Create Item'
          )}
        </button>
      </div>
    </form>
  );
}
