# Builder Operations

Builder Studio uses a separate BullMQ process for implementation proposals created through the scaffold workflow.

## Required services

- The web application (`npm run dev` locally)
- Redis, configured through `REDIS_URL` (defaults to `redis://localhost:6379`)
- The Builder worker:

```bash
npm run builder:worker
```

The worker advances a reviewed plan through build and automated review. It must run separately from Next.js in every environment where implementation review is enabled.

## Proposal review gate

Every code proposal — generic (`submit_code_proposal`) and scaffolded (`scaffold_module`) — starts in `plan_ready` and must pass the automated review gate before a pull request can open:

1. An implementation reviewer starts a run (`POST /api/org/[orgId]/builder/proposals/[proposalId]/build`). The start is an atomic claim: duplicate requests while a run is active return `alreadyRunning` and never enqueue a second job. Runs can be retried from `needs_repair` and `failed`.
2. The worker generates files (scaffold) or takes the supplied files (generic), enforces the protected-path policy (`lib/builder/path-policy.ts`), and runs the automated review.
3. Blocking findings, protected paths, or an unreadable review report leave the proposal in `needs_repair`; an infrastructure failure leaves it in `failed`.
4. Only a proposal in `ready_to_apply` whose stored review report passes the gate (`lib/builder/review-gate.ts` — blocking findings, not score) can open a PR. The apply endpoint re-checks the report and the path policy before writing to GitHub.
5. Proposals stop at `pr_opened`. Merge and deployment are handled through the normal engineering release process; the manual "mark shipped" action is retired until verified delivery records exist.
