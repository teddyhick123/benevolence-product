// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AI_WORKLOADS, orgRoutableWorkloads } from '@/lib/ai/workloads';

const BUILDER_WORKLOADS = ['builder_chat', 'builder_plan', 'builder_build', 'builder_review'] as const;

describe('builder workloads', () => {
  it('defines one workload per builder phase', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id], `${id} is missing`).toBeDefined();
    }
  });

  // Builder runs on the platform's credential. Routing it to an organization
  // deployment would reprice the platform's code generation onto their key.
  it('marks every builder workload as not org-routable', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id].orgRoutable, `${id} must not be org-routable`).toBe(false);
    }
  });

  it('keeps every product workload org-routable', () => {
    const product = Object.values(AI_WORKLOADS).filter(w => !w.id.startsWith('builder_'));
    expect(product).toHaveLength(9);
    for (const workload of product) {
      expect(workload.orgRoutable, `${workload.id} should be org-routable`).toBe(true);
    }
  });

  it('excludes builder workloads from orgRoutableWorkloads', () => {
    const ids = orgRoutableWorkloads().map(w => w.id);
    expect(ids).toHaveLength(9);
    for (const id of BUILDER_WORKLOADS) expect(ids).not.toContain(id);
  });

  it('preserves each phase model, so behaviour is unchanged by default', () => {
    expect(AI_WORKLOADS.builder_plan.platformDefault.model).toBe(AI_WORKLOADS.builder_review.platformDefault.model);
    expect(AI_WORKLOADS.builder_build.platformDefault.model).not.toBe(AI_WORKLOADS.builder_plan.platformDefault.model);
  });

  it('takes each builder connector from the environment, defaulting to anthropic', () => {
    for (const id of BUILDER_WORKLOADS) {
      expect(AI_WORKLOADS[id].platformDefault.connector).toBe('anthropic');
    }
  });

  it('declares tool capability for the chat workload only', () => {
    expect(AI_WORKLOADS.builder_chat.requiredCapabilities).toContain('tools');
    expect(AI_WORKLOADS.builder_build.requiredCapabilities).not.toContain('tools');
  });
});
