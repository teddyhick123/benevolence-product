import { describe, expect, it } from 'vitest';
import {
  canManageOwnership,
  canManageWorkspace,
  canOperateOrg,
  isOrgOperator,
  isOrgOwner,
  isOrgRole,
  isWorkspaceManager,
} from '@/lib/roles';

describe('canonical organization roles', () => {
  it('accepts only the four database-backed roles', () => {
    expect(isOrgRole('viewer')).toBe(true);
    expect(isOrgRole('member')).toBe(true);
    expect(isOrgRole('admin')).toBe(true);
    expect(isOrgRole('owner')).toBe(true);
    expect(isOrgRole('editor')).toBe(false);
  });

  it('keeps operational, workspace, and ownership permissions distinct', () => {
    expect(canOperateOrg('viewer')).toBe(false);
    expect(canOperateOrg('member')).toBe(true);
    expect(canManageWorkspace('member')).toBe(false);
    expect(canManageWorkspace('admin')).toBe(true);
    expect(canManageOwnership('admin')).toBe(false);
    expect(canManageOwnership('owner')).toBe(true);
  });

  it('offers safe guards for values received from API boundaries', () => {
    expect(isOrgOperator('member')).toBe(true);
    expect(isOrgOperator('viewer')).toBe(false);
    expect(isWorkspaceManager('admin')).toBe(true);
    expect(isWorkspaceManager('member')).toBe(false);
    expect(isOrgOwner('owner')).toBe(true);
    expect(isOrgOwner('admin')).toBe(false);
    expect(isWorkspaceManager('editor')).toBe(false);
  });
});
