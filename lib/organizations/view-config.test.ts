// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  normalizeVocabulary,
  pluralizeLabel,
  resolveDashboardSections,
  resolveGrantsTableColumns,
} from '@/lib/organizations/view-config';

describe('view config helpers', () => {
  it('normalizes entity vocabulary', () => {
    expect(pluralizeLabel('Award')).toBe('Awards');
    expect(pluralizeLabel('Community')).toBe('Communities');
    expect(normalizeVocabulary({ singular: 'Award' }, 'grant')).toEqual({
      singular: 'Award',
      plural: 'Awards',
    });
  });

  it('resolves dashboard sections with hidden sections and defaults', () => {
    expect(resolveDashboardSections({
      sections: ['payout', 'kpis'],
      hidden_sections: ['map'],
    })).toEqual(['payout', 'kpis', 'tasks', 'summary', 'holdings_widgets', 'grants']);
  });

  it('resolves grant table columns and custom field columns', () => {
    expect(resolveGrantsTableColumns({
      columns: ['name', 'custom:alignment_score', 'not_real', 'stage'],
    })).toEqual(['name', 'custom:alignment_score', 'stage']);
  });
});
