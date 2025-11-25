import { z } from 'zod';

/**
 * Schema for updating user profile
 */
export const updateProfileSchema = z.object({
  display_name: z.string().max(255, 'Display name too long').optional(),
  bio: z.string().max(1000, 'Bio too long').optional(),
  organization: z.string().max(255, 'Organization name too long').optional(),
});

/**
 * Schema for changing password
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});
