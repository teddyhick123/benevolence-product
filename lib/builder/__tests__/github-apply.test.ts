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
    const prIdx = src.lastIndexOf('/pulls');
    expect(prIdx).toBeGreaterThan(contentsIdx);
  });

  it('checks for an existing PR so retries are safe', () => {
    expect(src).toMatch(/pulls\?head=/);
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

  it('does not embed a review score in the PR body (score is never an authorization signal)', () => {
    expect(src).not.toMatch(/Review Score/i);
    expect(src).not.toMatch(/reviewScore/);
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

  function makeFetch(
    fileExists: boolean,
    fileSha?: string,
    options: { branchExists?: boolean; existingPrUrl?: string; existingContent?: string } = {}
  ) {
    return vi.fn().mockImplementation(async (url: string, reqOpts?: RequestInit) => {
      const u = String(url);
      // GET main branch SHA
      if (u.includes('/git/ref/heads/main') && !reqOpts?.method) {
        return { ok: true, json: async () => ({ object: { sha: 'mainsha123' } }) };
      }
      // GET builder branch SHA
      if (u.includes('/git/ref/heads/builder/scaffold-') && !reqOpts?.method) {
        if (options.branchExists) return { ok: true, json: async () => ({ object: { sha: 'branchsha123' } }) };
        return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      }
      // POST create branch
      if (u.includes('/git/refs') && reqOpts?.method === 'POST') {
        return { ok: true, json: async () => ({}) };
      }
      // GET existing PRs for branch
      if (u.includes('/pulls?') && !reqOpts?.method) {
        const existingPrUrl = options.existingPrUrl;
        return {
          ok: true,
          json: async () => existingPrUrl ? [{ number: 42, html_url: existingPrUrl, head: { sha: 'existingprsha' } }] : [],
        };
      }
      // GET existing file contents
      if (u.includes('/contents/') && (!reqOpts?.method || reqOpts.method === 'GET')) {
        if (!fileExists) return { ok: false, status: 404, json: async () => ({}) };
        return {
          ok: true,
          json: async () => ({
            type: 'file',
            sha: fileSha ?? 'existingsha',
            content: options.existingContent,
          }),
        };
      }
      // PUT file contents
      if (u.includes('/contents/') && reqOpts?.method === 'PUT') {
        return { ok: true, json: async () => ({}) };
      }
      // POST create PR
      if (u.includes('/pulls') && reqOpts?.method === 'POST') {
        return { ok: true, json: async () => ({ number: 1, html_url: 'https://github.com/owner/repo/pull/1', head: { sha: 'newprsha' } }) };
      }
      return { ok: false, status: 500, json: async () => ({ message: 'unexpected' }) };
    });
  }

  it('omits sha in PUT body when file does not exist (404)', async () => {
    const mockFetch = makeFetch(false);
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'export {}' }]);

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

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'export {}' }]);

    const putCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/contents/') && (args[1] as RequestInit)?.method === 'PUT'
    );
    const putBody = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(putBody.sha).toBe('abc123sha');
  });

  it('throws when GET /contents returns a non-404 error', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const u = String(url);
      if (u.includes('/git/ref/heads/main')) return { ok: true, json: async () => ({ object: { sha: 'mainsha' } }) };
      if (u.includes('/git/ref/heads/builder/scaffold-')) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      if (u.includes('/git/refs') && opts?.method === 'POST') return { ok: true, json: async () => ({}) };
      if (u.includes('/pulls?') && !opts?.method) return { ok: true, json: async () => [] };
      if (u.includes('/contents/') && (!opts?.method || opts.method === 'GET')) {
        return { ok: false, status: 500, json: async () => ({ message: 'internal error' }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await expect(
      applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }])
    ).rejects.toThrow(/Failed to check/);
  });

  it('returns prUrl and branchName on success', async () => {
    vi.stubGlobal('fetch', makeFetch(false) as unknown as typeof fetch);

    const result = await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }]);

    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/1');
    expect(result.prNumber).toBe(1);
    expect(result.branchName).toBe('builder/scaffold-aabbccdd');
    expect(result.baseSha).toBe('mainsha123');
    expect(result.headSha).toBe('newprsha');
  });

  it('writes a PR body that states verification facts, never a score', async () => {
    const mockFetch = makeFetch(false);
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub(
      'aabbccdd-1234-5678',
      'MyModule',
      [{ path: 'lib/foo.ts', content: 'x' }],
      { attemptNumber: 2, policyVersion: 'builder-review-policy/v1' },
    );

    const prCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).endsWith('/pulls') && (args[1] as RequestInit)?.method === 'POST'
    );
    const prBody = JSON.parse((prCall![1] as RequestInit).body as string).body as string;
    expect(prBody).not.toMatch(/score/i);
    expect(prBody).toMatch(/attempt 2/);
    expect(prBody).toMatch(/builder-review-policy\/v1/);
  });

  it('reuses an existing branch instead of failing on retry', async () => {
    const mockFetch = makeFetch(false, undefined, { branchExists: true });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }]);

    const createBranchCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/git/refs') && (args[1] as RequestInit)?.method === 'POST'
    );
    expect(createBranchCall).toBeUndefined();
  });

  it('returns an existing open PR without rewriting files', async () => {
    const mockFetch = makeFetch(false, undefined, {
      branchExists: true,
      existingPrUrl: 'https://github.com/owner/repo/pull/42',
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    const result = await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content: 'x' }]);

    const putCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/contents/') && (args[1] as RequestInit)?.method === 'PUT'
    );
    expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42');
    expect(result.prNumber).toBe(42);
    expect(result.headSha).toBe('existingprsha');
    expect(putCall).toBeUndefined();
  });

  it('skips PUT when the branch already has identical file content', async () => {
    const content = 'export const x = 1;';
    const mockFetch = makeFetch(true, 'abc123sha', {
      existingContent: Buffer.from(content, 'utf-8').toString('base64'),
    });
    vi.stubGlobal('fetch', mockFetch as unknown as typeof fetch);

    await applyProposalToGitHub('aabbccdd-1234-5678', 'MyModule', [{ path: 'lib/foo.ts', content }]);

    const putCall = mockFetch.mock.calls.find((args: unknown[]) =>
      String(args[0]).includes('/contents/') && (args[1] as RequestInit)?.method === 'PUT'
    );
    expect(putCall).toBeUndefined();
  });
});
