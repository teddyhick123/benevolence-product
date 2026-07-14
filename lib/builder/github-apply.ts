// lib/builder/github-apply.ts

export interface GitHubFile {
  path: string;
  content: string;
}

export interface ApplyResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
  baseSha: string;
  headSha: string;
}

export function isGitHubConfigured(): boolean {
  return !!(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPO_OWNER &&
    process.env.GITHUB_REPO_NAME
  );
}

/**
 * Reads the current tip SHA of the repo's default (main) branch. Used both
 * by applyProposalToGitHub (to branch off of) and by the build-claim route
 * (to stamp base_commit_sha on a freshly claimed revision, best-effort).
 */
export async function getDefaultBranchSha(): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    throw new Error('GitHub integration not configured');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const refRes = await fetch(`${base}/git/ref/heads/main`, { headers });
  if (!refRes.ok) {
    const refErr = await refRes.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`Failed to read main branch: ${refRes.status} — ${refErr.message ?? JSON.stringify(refErr)}`);
  }
  const refData = await refRes.json() as { object: { sha: string } };
  return refData.object.sha;
}

async function readGitHubError(res: Response): Promise<string> {
  const err = await res.json().catch(() => ({})) as Record<string, unknown>;
  return String(err.message ?? JSON.stringify(err));
}

function normalizeBase64(value: string): string {
  return value.replace(/\s/g, '');
}

function githubContentsPath(path: string): string {
  return path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

export async function applyProposalToGitHub(
  proposalId: string,
  moduleName: string,
  files: GitHubFile[],
  facts?: { attemptNumber?: number; policyVersion?: string },
): Promise<ApplyResult> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    throw new Error('GitHub integration not configured');
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  // 1. Get main branch SHA
  const mainSha = await getDefaultBranchSha();

  // 2. Create or reuse branch. Reusing makes retries safe after partial failures.
  const branchName = `builder/scaffold-${proposalId.slice(0, 8)}`;
  const branchRefRes = await fetch(`${base}/git/ref/heads/${branchName}`, { headers });
  if (!branchRefRes.ok && branchRefRes.status !== 404) {
    throw new Error(`Failed to check builder branch: ${branchRefRes.status} — ${await readGitHubError(branchRefRes)}`);
  }

  if (branchRefRes.status === 404) {
    const createBranchRes = await fetch(`${base}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha }),
    });
    if (!createBranchRes.ok) {
      throw new Error(`Failed to create branch: ${createBranchRes.status} — ${await readGitHubError(createBranchRes)}`);
    }
  } else {
    const openPrRes = await fetch(
      `${base}/pulls?head=${encodeURIComponent(`${owner}:${branchName}`)}&state=open`,
      { headers }
    );
    if (!openPrRes.ok) {
      throw new Error(`Failed to check existing PR: ${openPrRes.status} — ${await readGitHubError(openPrRes)}`);
    }
    const openPrs = await openPrRes.json() as Array<{ number?: number; html_url?: string; head?: { sha?: string } }>;
    const openPr = openPrs[0];
    if (openPr?.html_url && openPr.number != null && openPr.head?.sha) {
      return { prUrl: openPr.html_url, prNumber: openPr.number, branchName, baseSha: mainSha, headSha: openPr.head.sha };
    }
  }

  // 3. Write each file (GET existing SHA first — required for updates)
  for (const file of files) {
    const cleanPath = file.path.replace(/^\//, '');
    const contentB64 = Buffer.from(file.content, 'utf-8').toString('base64');
    const encodedPath = githubContentsPath(cleanPath);

    // Check for existing file to get its SHA
    const existingRes = await fetch(
      `${base}/contents/${encodedPath}?ref=${encodeURIComponent(branchName)}`,
      { headers }
    );
    let existingSha: string | undefined;
    if (existingRes.ok) {
      const existingData = await existingRes.json() as { type?: string; sha?: string; content?: string };
      if (existingData.type === 'file') {
        existingSha = existingData.sha;
        if (existingData.content && normalizeBase64(existingData.content) === contentB64) {
          continue;
        }
      } else {
        throw new Error(`Cannot write ${cleanPath}: existing GitHub object is not a file`);
      }
    } else if (existingRes.status !== 404) {
      throw new Error(`Failed to check ${cleanPath}: ${existingRes.status} — ${await readGitHubError(existingRes)}`);
    }

    const body: Record<string, unknown> = {
      message: `feat(builder): add ${cleanPath}`,
      content: contentB64,
      branch: branchName,
    };
    if (existingSha) body.sha = existingSha;

    const putRes = await fetch(`${base}/contents/${encodedPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      throw new Error(
        `Failed to write ${cleanPath}: ${putRes.status} — ${await readGitHubError(putRes)}`
      );
    }
  }

  // 4. Open PR
  const existingPrRes = await fetch(
    `${base}/pulls?head=${encodeURIComponent(`${owner}:${branchName}`)}&state=open`,
    { headers }
  );
  if (!existingPrRes.ok) {
    throw new Error(`Failed to check existing PR: ${existingPrRes.status} — ${await readGitHubError(existingPrRes)}`);
  }
  const existingPrs = await existingPrRes.json() as Array<{ number?: number; html_url?: string; head?: { sha?: string } }>;
  const existingPr = existingPrs[0];
  if (existingPr?.html_url && existingPr.number != null && existingPr.head?.sha) {
    return { prUrl: existingPr.html_url, prNumber: existingPr.number, branchName, baseSha: mainSha, headSha: existingPr.head.sha };
  }

  // PR body states verification facts, never a score — a model score is never
  // an authorization signal (audit Phase 0, item 2).
  const attemptFact = facts?.attemptNumber != null && facts?.policyVersion
    ? `**Verification:** review attempt ${facts.attemptNumber} passed under ${facts.policyVersion}`
    : '**Verification:** review gate passed under the durable review policy';
  const prBody = [
    `## AI-Generated Module: ${moduleName}`,
    '',
    attemptFact,
    '',
    '**Files changed:**',
    files.map(f => `- \`${f.path}\``).join('\n'),
    '',
    '> This PR was generated by the Builder AI. Review all code carefully before merging.',
    '',
    `Proposal ID: \`${proposalId}\``,
  ].join('\n');

  const prRes = await fetch(`${base}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `feat(builder): scaffold ${moduleName}`,
      body: prBody,
      head: branchName,
      base: 'main',
    }),
  });
  if (!prRes.ok) {
    throw new Error(
      `Failed to create PR: ${prRes.status} — ${await readGitHubError(prRes)}`
    );
  }
  const prData = await prRes.json() as { number: number; html_url: string; head?: { sha?: string } };

  // Prefer the PR's head SHA; fall back to the branch tip if the create
  // response omitted it (some GitHub error shapes / test doubles do).
  const headSha = prData.head?.sha ?? (await readBranchHeadSha(base, branchName, headers));

  return { prUrl: prData.html_url, prNumber: prData.number, branchName, baseSha: mainSha, headSha };
}

/** Reads the current tip SHA of an arbitrary branch (used to resolve a PR head SHA). */
async function readBranchHeadSha(
  base: string,
  branchName: string,
  headers: Record<string, string>,
): Promise<string> {
  const res = await fetch(`${base}/git/ref/heads/${branchName}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to read branch head: ${res.status} — ${await readGitHubError(res)}`);
  }
  const data = await res.json() as { object?: { sha?: string } };
  if (!data.object?.sha) throw new Error('Failed to read branch head: missing sha');
  return data.object.sha;
}
