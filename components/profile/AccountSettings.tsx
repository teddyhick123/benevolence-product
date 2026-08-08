'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';

type AccountSettingsProps = {
  userId: string;
  email: string;
};

export default function AccountSettings({ userId, email }: AccountSettingsProps) {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordChange = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await apiRequest('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (!response.ok) {
        const error = await readJson(response);
        throw new Error(error.message || 'Failed to change password');
      }

      setPasswordSuccess(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (error: any) {
      setPasswordError(error.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-soft border border-black/5 p-6">
      <h2 className="text-lg font-semibold text-neutral-900 mb-4">Account Settings</h2>

      <div className="space-y-4">
        {/* Email (Read-only) */}
        <div>
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
            Email Address
          </label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              disabled
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 text-neutral-600 cursor-not-allowed"
            />
            <div className="px-3 py-2 text-xs text-neutral-500 bg-neutral-100 rounded-lg border border-neutral-200">
              Verified
            </div>
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            Contact support to change your email address
          </p>
        </div>

        {/* Password Change */}
        <div>
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
            Password
          </label>
          {!showPasswordChange ? (
            <button
              onClick={() => setShowPasswordChange(true)}
              className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Change Password
            </button>
          ) : (
            <div className="space-y-3 p-4 border border-neutral-200 rounded-lg bg-neutral-50">
              <div>
                <input
                  type="password"
                  placeholder="Current password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="New password (min 6 characters)"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>

              {passwordError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
                  Password changed successfully!
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePasswordChange}
                  disabled={isChangingPassword}
                  className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isChangingPassword ? 'Changing...' : 'Update Password'}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    setPasswordError(null);
                  }}
                  disabled={isChangingPassword}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User ID */}
        <div>
          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1.5">
            User ID
          </label>
          <div className="px-3 py-2 border border-neutral-200 rounded-lg bg-neutral-50 font-mono text-xs text-neutral-600 break-all">
            {userId}
          </div>
        </div>
      </div>
    </div>
  );
}
