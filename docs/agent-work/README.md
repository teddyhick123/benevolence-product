# Agent Work Records

This is the durable home for AI coding-agent plans and design specs. It keeps
implementation context available without making dated working material compete
with the current product and schema canon.

## Start Here

1. Read [`AGENTS.md`](../../AGENTS.md) for non-negotiable implementation and
   schema rules.
2. Choose work from the [consolidated open backlog](BACKLOG.md).
   It is the single current queue for product, reliability, security, Builder,
   and test-infrastructure work.
3. Verify the chosen item against current code and `db/migrations/` before
   writing a plan or changing code.
4. Read a related record below only when it supplies useful context; neither a
   plan nor a spec overrides current code, migrations, or `AGENTS.md`.

## Contents

| Path | Purpose |
|---|---|
| [`plans/`](plans/) | Dated implementation plans and their completion records |
| [`specs/`](specs/) | Dated design and discovery material that informed plans |

## Creating A New Record

- Put a new plan in `plans/YYYY-MM-DD-short-topic.md`.
- Put a new design or discovery record in `specs/YYYY-MM-DD-short-topic.md`.
- Start each plan with its status, scope, prerequisites, and verification
  expectations. Link the backlog item it addresses.
- When work finishes, update the plan's status and keep it here as delivery
history; move any remaining actionable work into `BACKLOG.md`.

These records are intentionally retained for future agents, but they are not
implementation authority. The precedence order is documented in
[`docs/README.md`](../README.md).
