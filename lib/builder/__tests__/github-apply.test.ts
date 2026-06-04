import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('github-apply source', () => {
  const src = readFileSync('lib/builder/github-apply.ts', 'utf8');

  it('exports applyProposalToGitHub function', () => {
    expect(src).toMatch(/export async function applyProposalToGitHub/);
  });

  it('exports isGitHubConfigured function', () => {
    expect(src).toMatch(/export function isGitHubConfigured/);
  });

  it('fetches existing file SHA before PUT (required by GitHub Contents API)', () => {
    expect(src).toMatch(/contents.*\?ref=|GET.*contents/s);
    expect(src).toMatch(/existingSha|existing_sha|sha.*update/i);
  });

  it('creates branch before writing files', () => {
    const branchIdx = src.indexOf('git/refs');
    const contentsIdx = src.indexOf('/contents/');
    expect(branchIdx).toBeGreaterThan(-1);
    expect(contentsIdx).toBeGreaterThan(branchIdx);
  });

  it('opens PR after writing files', () => {
    const contentsIdx = src.lastIndexOf('/contents/');
    const prIdx = src.indexOf('/pulls');
    expect(prIdx).toBeGreaterThan(contentsIdx);
  });

  it('does not auto-merge the PR', () => {
    expect(src).not.toMatch(/merge.*pull|auto.merge/i);
  });

  it('uses fetch — no octokit or github dependency', () => {
    expect(src).not.toMatch(/@octokit|node-github/);
  });

  it('branch name includes proposalId prefix', () => {
    expect(src).toMatch(/builder\/scaffold-/);
  });
});

describe('isGitHubConfigured', () => {
  it('returns false when GITHUB_TOKEN is absent', async () => {
    const orig = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    const { isGitHubConfigured } = await import('../github-apply');
    expect(isGitHubConfigured()).toBe(false);
    if (orig !== undefined) process.env.GITHUB_TOKEN = orig;
  });
});
