'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function NewDonorPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = params.orgId as string;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    is_organization: false,
    first_name: '',
    last_name: '',
    organization_name: '',
    contact_name: '',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'USA',
    is_anonymous: false,
    communication_preference: 'email',
    do_not_contact: false,
    notes: '',
    tags: [] as string[],
  });

  const [tagInput, setTagInput] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/org/${organizationId}/donors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create donor');
      }

      const { donor } = await response.json();
      router.push(`/org/${organizationId}/donors/${donor.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isOrganization = formData.is_organization;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center gap-2 text-sm">
          <li>
            <a href={`/org/${organizationId}/donors`} className="text-neutral-500 hover:text-neutral-700">
              Donors
            </a>
          </li>
          <li className="text-neutral-400">/</li>
          <li className="text-ink font-medium">New Donor</li>
        </ol>
      </nav>

      <h1 className="text-2xl font-bold text-ink mb-6">Add New Donor</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Donor Type */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Donor Type
          </label>
          <select
            name="is_organization"
            value={formData.is_organization ? 'organization' : 'individual'}
            onChange={(e) => setFormData((prev) => ({ ...prev, is_organization: e.target.value !== 'individual' }))}
            className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          >
            <option value="individual">Individual</option>
            <option value="organization">Organization / Foundation / Corporation</option>
          </select>
        </div>

        {/* Name Fields */}
        {isOrganization ? (
          <>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                name="organization_name"
                value={formData.organization_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Contact Name
              </label>
              <input
                type="text"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                First Name
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Last Name
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
          </div>
        )}

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-ink">Address</h3>
          <div>
            <input
              type="text"
              name="address_line1"
              value={formData.address_line1}
              onChange={handleChange}
              placeholder="Street Address"
              className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div>
            <input
              type="text"
              name="address_line2"
              value={formData.address_line2}
              onChange={handleChange}
              placeholder="Apt, Suite, etc. (optional)"
              className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div className="grid grid-cols-6 gap-4">
            <div className="col-span-3">
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="City"
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div className="col-span-1">
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="State"
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div className="col-span-2">
              <input
                type="text"
                name="zip"
                value={formData.zip}
                onChange={handleChange}
                placeholder="ZIP Code"
                className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-ink">Preferences</h3>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Communication Preference
            </label>
            <select
              name="communication_preference"
              value={formData.communication_preference}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="mail">Mail</option>
              <option value="none">No Contact</option>
            </select>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_anonymous"
                checked={formData.is_anonymous}
                onChange={handleChange}
                className="rounded text-azure"
              />
              <span className="text-sm text-neutral-700">Anonymous donor</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="do_not_contact"
                checked={formData.do_not_contact}
                onChange={handleChange}
                className="rounded text-azure"
              />
              <span className="text-sm text-neutral-700">Do not contact</span>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Tags
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              placeholder="Add a tag..."
              className="flex-1 px-4 py-2 border border-black/10 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-4 py-2 text-azure border border-azure rounded-2xl hover:bg-azure/10"
            >
              Add
            </button>
          </div>
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-neutral-100 rounded-full text-sm flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 text-neutral-700 hover:bg-neutral-100 rounded-2xl"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Donor'}
          </button>
        </div>
      </form>
    </div>
  );
}
