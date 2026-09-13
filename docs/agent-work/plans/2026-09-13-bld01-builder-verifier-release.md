# BLD-01 — Builder Verifier Production Release

**Status:** Release implementation complete on 2026-09-13; publishing and worker deployment remain operational actions on merged `main`.

**Goal:** Ensure production Builder verification runs proposal-modified code only in a reproducible, digest-pinned container image, never on the worker host.

## Delivered

- `docker/builder-verifier/Dockerfile` pins its Node 20 slim base by digest and installs the committed dependency graph. It explicitly mirrors the repository's `legacy-peer-deps` lockfile setting because Docker excludes `.npmrc` from build context.
- `.github/workflows/publish-builder-verifier.yml` builds only from `main`, pushes `ghcr.io/<owner>/benevolence-builder-verifier`, and puts its immutable digest reference in the GitHub Actions summary. The mutable commit tag is traceability only.
- `.env.example` and `docs/engineering/BUILDER_OPERATIONS.md` define the exact worker handoff: use the published digest, a Docker-capable worker host, and a real checkout with fetchable `origin`.
- A release contract test protects the `main`-only trigger, registry permission, digest handoff, base-image pin, and operational documentation.

## Verified locally

- Focused release-contract and verifier-runner tests pass.
- TypeScript compilation passes.
- The image builds from the pinned base and runs Node 20.20.2 and TypeScript 5.5.4 with no network and a read-only root filesystem.

## Required production handoff

1. Merge the release commit to `main`; wait for **Publish Builder Verifier** to complete.
2. Copy `ghcr.io/<owner>/benevolence-builder-verifier@sha256:<digest>` from its job summary into the production worker's `BUILDER_VERIFIER_IMAGE` setting.
3. On the worker host, pull that image; prove Docker can run it; confirm the service checkout has `git remote get-url origin` and `git fetch origin` access; restart `npm run builder:worker` with `NODE_ENV=production`.
4. Submit a non-migration canary proposal and retain its persisted verification runs, authoritative diff, and image digest in the release record.

Migration-touching proposals must remain blocked until an isolated disposable Supabase verification environment exists. The verifier container deliberately has neither network access nor a Docker socket, so weakening that boundary is not an acceptable workaround.
