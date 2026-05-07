'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type PreferencesProps = {
  userId: string;
};

export default function Preferences({ userId }: PreferencesProps) {
  const router = useRouter();
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    dataRefreshInterval: '30',
    theme: 'light'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`preferences_${userId}`);
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (e) {
        // Ignore invalid JSON
      }
    }
  }, [userId]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // Save to localStorage (could be extended to save to database)
      localStorage.setItem(`preferences_${userId}`, JSON.stringify(preferences));

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      // Preferences save failed
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-soft border border-black/5 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-4">Preferences</h2>

      <div className="space-y-5">
        {/* Email Notifications */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Email Notifications
            </label>
            <p className="text-xs text-neutral-500">
              Receive email updates about your portfolios and holdings
            </p>
          </div>
          <button
            onClick={() => setPreferences({ ...preferences, emailNotifications: !preferences.emailNotifications })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-azure/30 ${
              preferences.emailNotifications ? 'bg-azure' : 'bg-neutral-200'
            }`}
            role="switch"
            aria-checked={preferences.emailNotifications}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                preferences.emailNotifications ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Data Refresh Interval */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Data Refresh Interval
          </label>
          <select
            value={preferences.dataRefreshInterval}
            onChange={(e) => setPreferences({ ...preferences, dataRefreshInterval: e.target.value })}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure/30 focus:border-azure text-sm"
          >
            <option value="15">Every 15 seconds</option>
            <option value="30">Every 30 seconds</option>
            <option value="60">Every minute</option>
            <option value="300">Every 5 minutes</option>
          </select>
          <p className="mt-1.5 text-xs text-neutral-500">
            How often to refresh dashboard data automatically
          </p>
        </div>

        {/* Theme (placeholder for future implementation) */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Theme
          </label>
          <select
            value={preferences.theme}
            onChange={(e) => setPreferences({ ...preferences, theme: e.target.value })}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure/30 focus:border-azure text-sm"
            disabled
          >
            <option value="light">Light</option>
            <option value="dark">Dark (Coming soon)</option>
            <option value="auto">Auto (Coming soon)</option>
          </select>
          <p className="mt-1.5 text-xs text-neutral-500">
            Choose your preferred color theme
          </p>
        </div>

        {/* Save Button */}
        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </button>
          {saveSuccess && (
            <span className="text-sm text-green-600 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
