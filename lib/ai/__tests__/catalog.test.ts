// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AI_DEPLOYMENT_CATALOG, getAIDeploymentTemplate } from '@/lib/ai/catalog';

describe('AI deployment catalog', () => {
  it('keeps template ids stable for already-stored deployments', () => {
    expect(() => getAIDeploymentTemplate('openrouter-anthropic-claude-sonnet')).not.toThrow();
    expect(() => getAIDeploymentTemplate('openrouter-openai-gpt-4o')).not.toThrow();
  });

  it('offers a current-generation option from each vendor', () => {
    const vendors = new Set(AI_DEPLOYMENT_CATALOG.map(t => t.modelVendor));
    expect(vendors).toContain('anthropic');
    expect(vendors).toContain('openai');
    expect(AI_DEPLOYMENT_CATALOG.length).toBeGreaterThanOrEqual(4);
  });

  it('declares tool and streaming capability on every assistant-eligible template', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.advertisedCapabilities).toContain('tools');
      expect(template.advertisedCapabilities).toContain('streaming');
    }
  });

  it('makes no unearned verification claim', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.verifiedWorkloads).toEqual({});
    }
  });
});

describe('direct provider templates', () => {
  it('offers direct Anthropic and OpenAI deployments', () => {
    const connectors = new Set(AI_DEPLOYMENT_CATALOG.map(t => t.connector));
    expect(connectors).toContain('anthropic');
    expect(connectors).toContain('openai');
  });

  it('uses first-party model ids on direct connectors, not OpenRouter slugs', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      if (template.connector === 'openrouter') {
        expect(template.providerModelId).toContain('/');
      } else {
        expect(template.providerModelId).not.toContain('/');
      }
    }
  });

  it('never carries a date suffix on a model id', () => {
    for (const template of AI_DEPLOYMENT_CATALOG) {
      expect(template.providerModelId).not.toMatch(/-\d{8}$/);
    }
  });
});
