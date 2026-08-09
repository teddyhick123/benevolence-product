# Repository Hygiene

Phase 7 makes repository hygiene reproducible instead of relying on occasional
manual sweeps.

## Required checks

- `npm run audit:dead` runs Knip against unused files, direct dependencies,
  undeclared/unresolved imports, and duplicate exports.
- `npm run audit:deps` provides an independent dependency cross-check.
- `npm run verify:hygiene` runs both and is part of repository CI.

The Knip export report was reviewed during Phase 7. Many remaining exported
schemas, constants, and types are deliberate domain-library surfaces used by
tests, generated consumers, workers, or future module composition even when no
current runtime importer exists. CI therefore blocks objective dead files,
dependency drift, unresolved imports, and duplicate aliases without forcing
domain libraries to become private merely to satisfy a heuristic.

## Narrow analyzer exceptions

- `@tailwindcss/postcss`, `postcss`, and `tailwindcss` are loaded through build
  configuration rather than ordinary imports.
- `tsconfig-paths` is loaded by the `builder:worker` command line.
- Template placeholders are not valid TypeScript until rendered. They are
  excluded from generic analyzers and enforced by
  `tests/integration/module-template-contract.test.ts`.
- `lib/database.types.ts` is generated and guarded by the database-type drift
  check, not edited or judged as a hand-authored public API.

Do not add a broad ignore to silence a finding. First prove the file,
dependency, or export is an intentional entry point; then add the smallest
configuration exception and document why it cannot be discovered statically.

## Schema and documentation hygiene

`db/migrations` is the sole active schema history. Superseded SQL is recoverable
from Git and must not be copied into a `db/legacy` tree. Non-canonical SQL under
`db/demo`, `db/scripts`, `db/seeds`, `scripts/verify`, and module templates must
identify its bounded purpose and must never override the migration canon.

Current implementation guidance lives in `AGENTS.md`, `CLAUDE.md`,
`docs/ARCHITECTURE.md`, `docs/MODULES.md`, and `templates/module/README.md`.
Files under `docs/archive` and explicitly labeled historical design notes are
evidence, not implementation authority.
