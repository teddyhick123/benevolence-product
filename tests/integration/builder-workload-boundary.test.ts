// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiRouteReplaceSchema } from '@/lib/schemas/ai-settings';

const ROOT = join(__dirname, '..', '..');

describe('builder workloads are not routable by an organization', () => {
  it('rejects a route replace for a builder workload', () => {
    const result = aiRouteReplaceSchema.safeParse({
      workloadId: 'builder_chat',
      targets: [{ kind: 'platform_default' }],
    });
    expect(result.success).toBe(false);
  });

  it('still accepts a route replace for a product workload', () => {
    const result = aiRouteReplaceSchema.safeParse({
      workloadId: 'assistant',
      targets: [{ kind: 'platform_default' }],
    });
    expect(result.success).toBe(true);
  });

  it('offers only routable workloads in the settings payload', () => {
    const source = readFileSync(join(ROOT, 'lib/api/repositories/ai-settings.ts'), 'utf8');
    expect(source).toMatch(/workloads:\s*orgRoutableWorkloads\(\)/);
    expect(source).not.toMatch(/workloads:\s*Object\.values\(AI_WORKLOADS\)/);
  });

  it('excludes non-routable workloads from deployment evaluation', () => {
    const source = readFileSync(
      join(ROOT, 'app/api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate/route.ts'),
      'utf8',
    );
    expect(source).toMatch(/orgRoutable/);
  });
});
