import { existsSync, readFileSync } from 'fs';
import path from 'path';
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

  it('includes the schema decision and AI durability rules', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(ctx.agentInstructionsExcerpt).toContain('Schema Change Decision Protocol');
    expect(ctx.agentInstructionsExcerpt).toContain('never per-client DDL');
    expect(ctx.agentInstructionsExcerpt).toContain('ai_turns');
    expect(ctx.agentInstructionsExcerpt).toContain('(user_id, request_id)');
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
    expect(prompt).toContain('Use this number only for a genuine platform product increment');
    expect(prompt).toContain('Do not create DDL for client-variable configuration');
  });
});

// The scaffold prompt embeds real files as worked examples. Both lookups are
// guarded by existsSync, so a path that goes stale degrades silently: the model
// is handed "(donors component not found)" under a heading promising real code,
// and every scaffolded module gets worse without anything failing.
describe('scaffold example paths', () => {
  const source = readFileSync('lib/builder/scaffold-context.ts', 'utf8');

  function embeddedPath(constantName: string): string {
    const match = source.match(
      new RegExp(`const ${constantName} = path\\.join\\(\\s*PROJECT_ROOT,?\\s*'([^']+)'`)
    );
    if (!match) throw new Error(`Could not read ${constantName} from scaffold-context.ts`);
    return match[1];
  }

  it.each(['DONORS_ROUTE_PATH', 'DONORS_COMPONENT_PATH'])(
    '%s points at a file that still exists',
    constantName => {
      const relativePath = embeddedPath(constantName);
      expect(
        existsSync(path.join(process.cwd(), relativePath)),
        `${constantName} points at ${relativePath}, which no longer exists`
      ).toBe(true);
    }
  );

  it('names the component file it actually reads in the prompt heading', () => {
    expect(source).toContain(
      `### Example: donors module screen (${embeddedPath('DONORS_COMPONENT_PATH')})`
    );
  });

  it('embeds real content rather than the not-found placeholder', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(ctx.exampleModule).not.toContain('not found)');
  });
});
