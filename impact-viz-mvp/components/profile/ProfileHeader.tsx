'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ProfileHeaderProps = {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  organization: string | null;
};

export default function ProfileHeader({
  userId,
  email,
  displayName,
  avatarUrl,
  bio,
  organization
}: ProfileHeaderProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    display_name: displayName,
    bio: bio || '',
    organization: organization || ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-soft border border-black/5 p-6">
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-24 h-24 rounded-full object-cover border-2 border-neutral-200"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-azure/10 border-2 border-azure/20 flex items-center justify-center">
              <span className="text-2xl font-semibold text-azure">{initials}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {!isEditing ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900">{displayName}</h2>
                  <p className="text-sm text-neutral-600 mt-1">{email}</p>
                  {organization && (
                    <p className="text-sm text-neutral-500 mt-1">{organization}</p>
                  )}
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              </div>
              {bio && (
                <p className="mt-3 text-sm text-neutral-700 leading-relaxed">{bio}</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Organization
                </label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  placeholder="Company or organization"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Bio
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure/30 focus:border-azure resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-azure text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData({
                      display_name: displayName,
                      bio: bio || '',
                      organization: organization || ''
                    });
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 border border-neutral-300 rounded-lg font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
