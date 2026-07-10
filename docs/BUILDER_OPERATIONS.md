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

Generic code proposals already contain their proposed files and are opened as PRs directly by an implementation reviewer. Scaffolded proposals use the worker to generate and review code before their PR can open.
