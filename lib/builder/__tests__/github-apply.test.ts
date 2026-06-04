import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { isGitHubConfigured, applyProposalToGitHub } from '../github-apply';

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
  afterEach(() => vi.unstubAllEnvs());

  it('returns false when GITHUB_TOKEN is absent', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_REPO_OWNER', 'owner');
    vi.stubEnv('GITHUB_REPO_NAME', 'repo');
    expect(isGitHubConfigured()).toBe(false);
  });

  it('returns false when GITHUB_REPO_OWNER is absent', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('GITHUB_REPO_OWNER', '');
    vi.stubEnv('GITHUB_REPO_NAME', 'repo');
    expect(isGitHubConfigured()).toBe(false);
  });

  it('returns false when GITHUB_REPO_NAME is absent', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('GITHUB_REPO_OWNER', 'owner');
    vi.stubEnv('GITHUB_REPO_NAME', '');
    expect(isGitHubConfigured()).toBe(false);
  });

  it('returns true when all three env vars are set', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('GITHUB_REPO_OWNER', 'owner');
    vi.stubEnv('GITHUB_REPO_NAME', 'repo');
    expect(isGitHubConfigured()).toBe(true);
  });
});

describe('applyProposalToGitHub', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('GITHUB_REPO_OWNER', 'owner');
    vi.stubEnv('GITHUB_REPO_NAME', 'repo');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function makeFetch(fileExists: boolean, fileSha?: string) {
    return vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      // GET main branch SHA
      if (u.includes('/git/ref/') && !opts?.method) {
        return { ok: true, json: async () => ({ object: { sha: 'mainsha123' } }) };
      }
      // POST create branch
      if (u.includes('/git/refs') && opts?.method === 'POST') {
        return { ok: true, json: async () => ({}) };
      }
      // GET existing file contents
      if (u.includes('/contents/') && (!opts?.method || opts.method === 'GET')) {
        if (!fileExists) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, json: async () => ({ type: 'file', sha: fileSha ?? 'existingsha' }) };
      }
      // PUT file contents
      if (u.includes('/contents/') && opts?.method === 'PUT') {
        return { ok: true, json: async () => ({}) };
      }
      // POST create PR
      if (u.includes('/pulls') && opts?.method === 'POST') {
        return { ok: true, json: async () => ({ html_url: 'https://github.com/owner/repo/pull/1' }) };
      }
      return { ok: false, status: 500, json: async () => ({ message: 'unexpected' }) };
    });
  }

  it('omits sha in PUT body when file does not exist (404)', async () => {
    const mockFetch = makeFetch(false);
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'export {}' }], 85);

    const putCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/contents/') && (args[1] as RequestInit)?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const putBody = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(putBody.sha).toBeUndefined();
  });

  it('includes sha in PUT body when file exists', async () => {
    const mockFetch = makeFetch(true, 'abc123sha');
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'export {}' }], 85);

    const putCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/contents/') && (args[1] as RequestInit)?.method === 'PUT'
    );
    const putBody = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(putBody.sha).toBe('abc123sha');
  });

  it('throws when GET /contents returns a non-404 error', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes('/git/ref/')) return { ok: true, json: async () => ({ object: { sha: 'mainsha' } }) };
      if (u.includes('/git/refs') && opts?.method === 'POST') return { ok: true, json: async () => ({}) };
      if (u.includes('/contents/') && (!opts?.method || opts.method === 'GET')) {
        return { ok: false, status: 500, json: async () => ({ message: 'internal error' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await expect(
      applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }], 80)
    ).rejects.toThrow(/Failed to check/);
  });

  it('returns prUrl and branchName on success', async () => {
    vi.stubGlobal('fetch', makeFetch(false) as unknown as typeof fetch);

    const result = await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }], 90);

    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/1');
    expect(result.branchName).toBe('builder/scaffold-aabbccdd');
  });
});
