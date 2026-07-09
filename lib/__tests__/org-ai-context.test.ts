// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatOrgAiContextForPrompt, normalizeContextKey } from '@/lib/org-ai-context';

describe('org AI context helpers', () => {
  it('normalizes stable context keys', () => {
    expect(normalizeContextKey('We call grants Awards!')).toBe('we_call_grants_awards');
    expect(normalizeContextKey('123 policy')).toBe('context_123_policy');
  });

  it('formats active context records by type', () => {
    const prompt = formatOrgAiContextForPrompt([
      {
        id: '1',
        org_id: 'org-1',
        context_type: 'naming_convention',
        context_key: 'grant_vocabulary',
        context_value: 'Use "awards" when referring to grants.',
        source: 'builder_chat',
        is_active: true,
        created_by: 'user-1',
      },
      {
        id: '2',
        org_id: 'org-1',
        context_type: 'operating_norm',
        context_key: 'site_visit_policy',
        context_value: 'First-time grantees require a site visit before recommendation.',
        source: 'builder_chat',
        is_active: true,
        created_by: 'user-1',
      },
      {
        id: '3',
        org_id: 'org-1',
        context_type: 'preference',
        context_key: 'inactive',
        context_value: 'Do not show this.',
        source: 'builder_chat',
        is_active: false,
        created_by: 'user-1',
      },
    ]);

    expect(prompt).toContain('Operating Norms:');
    expect(prompt).toContain('First-time grantees require a site visit');
    expect(prompt).toContain('Naming Conventions:');
    expect(prompt).toContain('Use "awards"');
    expect(prompt).not.toContain('Do not show this.');
  });
});
