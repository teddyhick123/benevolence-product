'use client';

import React, { useState } from 'react';
import { MapPin, Plus, Edit2, Trash2, X, Save } from 'lucide-react';

export type HoldingLocation = {
  id: string;
  holding_id: string;
  name: string;
  lon: number;
  lat: number;
  status: string | null;
  tags: string[];
};

type Props = {
  holdingId: string;
  portfolioId: string;
  locations: HoldingLocation[];
  onAdd?: (location: Omit<HoldingLocation, 'id'>) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<HoldingLocation>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
};

export default function LocationsManager({
  holdingId,
  portfolioId,
  locations,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<HoldingLocation>>({
    name: '',
    lon: 0,
    lat: 0,
    status: 'Active',
    tags: [],
  });

  const handleAdd = async () => {
    if (!formData.name?.trim()) {
      alert('Location name is required');
      return;
    }

    if (formData.lon === undefined || formData.lat === undefined) {
      alert('Coordinates are required');
      return;
    }

    try {
      await onAdd?.({
        holding_id: holdingId,
        name: formData.name.trim(),
        lon: formData.lon,
        lat: formData.lat,
        status: formData.status || 'Active',
        tags: formData.tags || [],
      });

      // Reset form
      setFormData({
        name: '',
        lon: 0,
        lat: 0,
        status: 'Active',
        tags: [],
      });
      setIsAdding(false);
    } catch (err) {
      console.error('Failed to add location:', err);
      alert('Failed to add location. Please try again.');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.name?.trim()) {
      alert('Location name is required');
      return;
    }

    try {
      await onUpdate?.(id, {
        name: formData.name.trim(),
        lon: formData.lon,
        lat: formData.lat,
        status: formData.status,
        tags: formData.tags,
      });

      setEditingId(null);
    } catch (err) {
      console.error('Failed to update location:', err);
      alert('Failed to update location. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location?')) {
      return;
    }

    try {
      await onDelete?.(id);
    } catch (err) {
      console.error('Failed to delete location:', err);
      alert('Failed to delete location. Please try again.');
    }
  };

  const startEdit = (location: HoldingLocation) => {
    setEditingId(location.id);
    setFormData({
      name: location.name,
      lon: location.lon,
      lat: location.lat,
      status: location.status,
      tags: location.tags,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: '',
      lon: 0,
      lat: 0,
      status: 'Active',
      tags: [],
    });
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setFormData({
      name: '',
      lon: 0,
      lat: 0,
      status: 'Active',
      tags: [],
    });
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-black/5">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">Locations</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage multiple physical locations for this holding
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        )}
      </div>

      {/* Add Form */}
      {isAdding && (
        <div className="p-5 bg-neutral-50/60 border-b border-black/5">
          <h4 className="text-sm font-medium text-neutral-800 mb-3">Add New Location</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-full">
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Location Name *
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Headquarters, Regional Office"
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Longitude *
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.lon ?? ''}
                onChange={(e) => setFormData({ ...formData, lon: e.target.value ? Number(e.target.value) : 0 })}
                placeholder="-122.4194"
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Latitude *
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.lat ?? ''}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value ? Number(e.target.value) : 0 })}
                placeholder="37.7749"
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
              />
            </div>

            <div className="col-span-full">
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Status
              </label>
              <select
                value={formData.status || 'Active'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Planned">Planned</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Location
            </button>
            <button
              type="button"
              onClick={cancelAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Locations List */}
      <div className="divide-y divide-neutral-100">
        {locations.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            <MapPin className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
            <p>No additional locations yet.</p>
            <p className="text-xs mt-1">Click &ldquo;Add Location&rdquo; to get started.</p>
          </div>
        ) : (
          locations.map((location) => (
            <div key={location.id} className="p-4">
              {editingId === location.id ? (
                // Edit Mode
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="col-span-full">
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                        Location Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">Longitude *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.lon ?? ''}
                        onChange={(e) => setFormData({ ...formData, lon: e.target.value ? Number(e.target.value) : 0 })}
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">Latitude *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.lat ?? ''}
                        onChange={(e) => setFormData({ ...formData, lat: e.target.value ? Number(e.target.value) : 0 })}
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                      />
                    </div>

                    <div className="col-span-full">
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">Status</label>
                      <select
                        value={formData.status || 'Active'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Planned">Planned</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleUpdate(location.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-azure flex-shrink-0" />
                      <h4 className="font-semibold text-neutral-900">{location.name}</h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        location.status === 'Active' ? 'bg-green-50 text-green-700 border border-green-200' :
                        location.status === 'Inactive' ? 'bg-neutral-100 text-neutral-600 border border-neutral-200' :
                        'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {location.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
                      <span className="flex items-center gap-1 text-xs text-neutral-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                      </span>
                    </div>

                    {location.tags && location.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {location.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-azure/10 text-azure border border-azure/20"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(location)}
                      className="p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
                      title="Edit location"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(location.id)}
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                      title="Delete location"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
