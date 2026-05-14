import { describe, it, expect } from 'vitest';

describe('getNextMigrationNumber', () => {
  it('returns a zero-padded 4-digit string', async () => {
    const { getNextMigrationNumber } = await import('../scaffold-context');
    const num = getNextMigrationNumber();
    expect(num).toMatch(/^\d{4}$/);
    expect(parseInt(num, 10)).toBeGreaterThan(0);
  });
});

describe('buildScaffoldContext', () => {
  it('returns an object with templateFiles array', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(Array.isArray(ctx.templateFiles)).toBe(true);
    expect(ctx.templateFiles.length).toBeGreaterThan(0);
  });

  it('each templateFile has name and content', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    for (const f of ctx.templateFiles) {
      expect(typeof f.name).toBe('string');
      expect(typeof f.content).toBe('string');
      expect(f.content.length).toBeGreaterThan(0);
    }
  });

  it('includes nextMigrationNumber', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(ctx.nextMigrationNumber).toMatch(/^\d{4}$/);
  });

  it('uses provider-neutral agent instruction naming', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(ctx).toHaveProperty('agentInstructionsExcerpt');
    expect(ctx).not.toHaveProperty('claudeMdExcerpt');
  });
});

describe('formatScaffoldContextForPrompt', () => {
  it('produces a string containing template file content', async () => {
    const { buildScaffoldContext, formatScaffoldContextForPrompt } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('my-codebase-index');
    const prompt = formatScaffoldContextForPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('my-codebase-index');
    expect(prompt).toContain('Module Scaffold Context');
  });
});
