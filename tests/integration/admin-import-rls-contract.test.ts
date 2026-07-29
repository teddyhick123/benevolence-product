// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/0023_admin_superuser_policies.sql'),
  'utf8'
);

const importTables = [
  'import_mapping_profiles',
  'import_jobs',
  'import_ai_suggestions',
  'staging_import_donors',
  'staging_import_investees',
  'staging_import_holdings',
  'staging_import_contributions',
  'staging_import_metrics',
  'import_audit_log',
] as const;

describe('app-admin import RLS contract', () => {
  it.each(importTables)('grants authenticated app admins explicit access to %s', table => {
    const policy = new RegExp(
      `CREATE POLICY "[^"]*app admin[^"]*"\\s+ON ${table} FOR ALL TO authenticated` +
      `[\\s\\S]*?USING \\(is_app_admin\\(\\)\\)` +
      `[\\s\\S]*?WITH CHECK \\(is_app_admin\\(\\)\\)`,
      'i'
    );

    expect(migration).toMatch(policy);
  });

  it('grants app admins access only to the private imports bucket', () => {
    expect(migration).toMatch(
      /CREATE POLICY "imports bucket: app admin full access"[\s\S]*?ON storage\.objects FOR ALL TO authenticated[\s\S]*?USING \(bucket_id = 'imports' AND public\.is_app_admin\(\)\)[\s\S]*?WITH CHECK \(bucket_id = 'imports' AND public\.is_app_admin\(\)\)/
    );
  });
});
