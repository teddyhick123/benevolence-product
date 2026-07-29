// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('admin upload schema contract', () => {
  it('keeps restricted metric selections on canonical upload records', () => {
    const migration = readFileSync('db/migrations/0040_holdings_org_alignment.sql', 'utf8');

    expect(migration).toMatch(/ALTER TABLE uploads[\s\S]*ADD COLUMN IF NOT EXISTS selected_metrics text\[\]/);
  });
});
