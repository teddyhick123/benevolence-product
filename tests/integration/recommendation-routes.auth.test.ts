// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(path, 'utf8');

describe('recommendation route auth contracts', () => {
  it('reserves recommendation administration for app admins or portfolio owners', () => {
    const route = source('app/api/recommendations/[id]/route.ts');
    expect(route.match(/requireRecommendationManagerOrAppAdmin\(id\)/g)).toHaveLength(2);
  });

  it('separates recommendation reads from member interactions', () => {
    const status = source('app/api/recommendations/[id]/status/route.ts');
    const comments = source('app/api/recommendations/[id]/comments/route.ts');
    const ratings = source('app/api/recommendations/[id]/ratings/route.ts');

    expect(status).toContain('requireRecommendationAccess(id)');
    expect(status).toContain("requireRecommendationAccess(id, 'member')");
    expect(comments).toContain('requireRecommendationAccess(recommendation_id)');
    expect(comments).toContain("requireRecommendationAccess(recommendation_id, 'member')");
    expect(ratings.match(/requireRecommendationAccess\(recommendationId, 'member'\)/g))
      .toHaveLength(2);
  });

  it('uses scoped recommendation or user principals for personal interactions', () => {
    const favorite = source('app/api/recommendations/[id]/favorite/route.ts');
    const comment = source('app/api/recommendations/comments/[commentId]/route.ts');
    const charitySearch = source('app/api/search-charities/route.ts');

    expect(favorite.match(/requireRecommendationAccess\(id\)/g)).toHaveLength(2);
    expect(comment.match(/requireUserAccess\(\)/g)).toHaveLength(2);
    expect(charitySearch).toContain('requireUserAccess()');
  });

  it('does not construct session clients inside the family routes', () => {
    for (const path of [
      'app/api/recommendations/[id]/route.ts',
      'app/api/recommendations/[id]/status/route.ts',
      'app/api/recommendations/[id]/favorite/route.ts',
      'app/api/recommendations/[id]/ratings/route.ts',
      'app/api/recommendations/[id]/comments/route.ts',
      'app/api/recommendations/comments/[commentId]/route.ts',
      'app/api/search-charities/route.ts',
    ]) {
      const route = source(path);
      expect(route, path).not.toContain('createServerClient');
      expect(route, path).not.toContain('createSupabaseServerClient');
    }
  });
});
