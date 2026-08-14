# Organization-Controlled AI Runtime — Design

**Date:** 2026-08-08
**Status:** Phase 0 execution boundary complete; Phase 1 organization routing pending
**Last reviewed:** 2026-08-09

## Purpose

Let each organization control which AI connections and model deployments power each Benevolence AI workload. Organizations must be able to choose models for cost, capability, procurement, privacy, deployment, and product-fit reasons without coupling the platform to one AI vendor or routing intermediary.

OpenRouter is the first new organization-managed connection because it provides broad model access through one integration. It is not the provider abstraction, the model identity system, or a permanent requirement. The architecture must allow native Anthropic, OpenAI, Azure OpenAI, Amazon Bedrock, Google Vertex AI, OpenAI-compatible private endpoints, and organization-hosted models to be added later without changing the canonical storage model or rewriting product surfaces.

The north-star test is:

> Adding a model available through an existing connector requires deployment configuration and evaluation, not product-surface changes. Adding a new provider requires one connector and its contract tests, not a schema redesign.

## Design Principles

1. **Resolve by workload, not by global provider.** Assistant tool use, structured extraction, narrative generation, transcription, and future modalities have different requirements.
2. **Separate connection, deployment, route, and policy.** A model name alone does not identify credentials, endpoint, region, inference provider, or data-handling rules.
3. **Use capability-focused contracts.** Product code requests tool calling, structured output, text generation, or another operation; provider adapters translate those operations to native APIs.
4. **Make routing boundaries explicit.** Fallbacks may never cross credentials, providers, regions, or data policies unless the organization explicitly permits them.
5. **Offer verified defaults without closing the platform.** Benevolence maintains curated deployment templates, while the architecture supports organization-managed deployments.
6. **Centralize execution and observability.** Every client-facing invocation passes through one resolution and execution boundary.
7. **Treat credentials as isolated infrastructure secrets.** Secrets are never embedded in organization configuration, deployment records, logs, or browser responses.
8. **Preserve current behavior by default.** An organization with no AI configuration continues to use the platform-managed Anthropic defaults.

## Scope

### Phase 1

- Keep the platform-managed Anthropic connection and current defaults.
- Add OpenRouter as the first organization-managed connector.
- Let organization admins configure an OpenRouter connection and assign verified deployments to supported workloads.
- Route all post-organization client-facing AI workloads through the common execution gateway:
  - assistant chat
  - document-text extraction
  - import mapping, validation, reconciliation, and reporting
  - onboarding after an organization has been associated
  - letter generation
  - portfolio summaries
  - financial-profile generation
- Introduce provider-neutral workload, connection, deployment, route, policy, and invocation records.
- Add centralized capability validation, error mapping, usage recording, and audit events.

### Explicit Phase 1 behavior

- **Pre-organization onboarding:** there is no organization policy to resolve yet, so it uses the platform onboarding default. Once an onboarding session has an `org_id`, subsequent AI work uses that organization's route. The onboarding repository must load and pass this scope explicitly.
- **Document extraction:** the current extractor receives parsed text, not images or document binaries. Its Phase 1 requirement is structured JSON output from text. Vision becomes a requirement only for a future raw-image or raw-document workload.
- **Transcription:** remains on its current platform configuration in Phase 1, but is registered as a workload so it can adopt organization routing when an audio-capable connector is implemented.
- **Builder/constructor:** `app/api/constructor/chat/route.ts`, the org Builder route, and scaffold workers are Benevolence development tooling rather than an organization's client-facing AI runtime. Their Anthropic agent harness and model configuration remain separate.

### Deferred implementation, not architectural non-goals

- Native organization-managed Anthropic, OpenAI text/tool, Azure OpenAI, Bedrock, and Vertex connections
- Organization-hosted or private OpenAI-compatible endpoints
- VPC/private-network connectivity and customer-managed cloud identities
- Audio, embeddings, image generation, and additional modalities
- Per-conversation end-user model pickers
- Benevolence metering, credit resale, or rebilling

These items do not ship in Phase 1, but Phase 1 storage and contracts must not prevent them.

## Terminology

| Concept | Meaning |
|---|---|
| **Connector** | Code adapter for one provider API family, such as Anthropic or OpenRouter |
| **Connection** | An organization's configured access path: connector, endpoint/region, non-secret settings, and credential reference |
| **Deployment** | A model available through one connection, identified by a provider-specific model or deployment id |
| **Workload** | A stable Benevolence use case with declared operation and capability requirements |
| **Route** | The deployment and execution policy assigned to one organization workload |
| **Execution plan** | The immutable, resolved connection, deployment, parameters, and policy for one invocation or durable assistant turn |
| **Invocation** | One provider request with provider-neutral usage, timing, outcome, and resolved endpoint metadata |

## Architecture

```text
AI workload request
  { scope: AIExecutionScope, workloadId: AIWorkloadId, request }
        │
        ▼
AIExecutionGateway
  1. load workload definition
  2. resolve org route or platform workload default
  3. load deployment + connection metadata
  4. merge and validate execution policy
  5. verify operation and input capabilities
  6. obtain the credential only inside the server execution boundary
  7. invoke the connector adapter
  8. normalize response, errors, and usage
  9. persist invocation metadata and audit linkage
        │
        ▼
existing product workflow / durable assistant lifecycle
```

Product surfaces do not call `createAIProvider()`, import provider SDKs, decrypt secrets, or choose raw model identifiers. They call the gateway with a workload id and a provider-neutral operation request.

### 1. Workload registry

`lib/ai/workloads.ts` owns a code-defined registry of stable Benevolence workloads:

```typescript
type AIOperation =
  | 'text_generation'
  | 'structured_generation'
  | 'tool_conversation'
  | 'transcription';

interface AIWorkloadDefinition {
  id: AIWorkloadId;
  displayName: string;
  operation: AIOperation;
  requiredCapabilities: AICapability[];
  inputDataClass: 'internal' | 'sensitive';
  defaultLimits: {
    maxOutputTokens: number;
    timeoutMs: number;
  };
  platformDefault: {
    connector: AIConnectorId;
    model: string;
  };
  toolRisk?: 'none' | 'read_only' | 'mutation';
}
```

Initial registry:

| Workload | Operation | Required capabilities | Phase 1 organization routing |
|---|---|---|---|
| `assistant` | tool conversation | tools, streaming, parallel tool results | Yes |
| `extraction` | structured generation | JSON Schema | Yes; text input only |
| `import` | structured generation | JSON Schema | Yes |
| `import_chat` | text generation | text, streaming | Yes |
| `onboarding` | tool conversation | tools | After organization association |
| `letters` | text generation | text | Yes |
| `summaries` | text generation | text | Yes |
| `financial_profile` | text generation | text | Yes |
| `transcription` | transcription | audio input | Platform default only in Phase 1 |

The registry is the source of workload requirements. Components and routes do not reproduce capability rules.

### 2. Capability-focused operation contracts

Phase 0 replaced product-surface use of the lowest-common-denominator `AIProvider.createMessage/createStream` boundary with provider-neutral operation contracts. Phase 1 extends these shipped contracts rather than introducing a competing connector shape. The internal message format must support:

- `system`, `developer`, `user`, `assistant`, and `tool` roles where applicable
- text, image, document, audio, tool-call, and tool-result parts
- JSON Schema response contracts with strictness controls
- tool choice and parallel-tool policy
- streaming and non-streaming responses
- abort signals, deadlines, token limits, and supported sampling controls
- normalized stop reasons, refusals, usage, provider request ids, and errors

Provider-specific extensions are permitted only through validated connection, deployment, or route configuration. Product surfaces may not pass arbitrary provider payloads.

The shipped connector surface is flat and operation-specific, so a connector implements only the optional methods it actually supports. The plan is passed separately and contains only resolved, non-secret execution metadata:

```typescript
interface AIConnector {
  readonly id: AIConnectorId;
  readonly capabilities: readonly AICapability[];
  generateText?(plan: AIExecutionPlan, request: AIGenerationRequest): Promise<AITextResult>;
  streamText?(plan: AIExecutionPlan, request: AIGenerationRequest): AsyncIterable<AIStreamChunk>;
  generateStructured?<T>(
    plan: AIExecutionPlan,
    request: AIGenerationRequest,
    parse: (text: string) => T,
  ): Promise<AIStructuredResult<T>>;
  runToolConversation?(
    plan: AIExecutionPlan,
    request: AIToolConversationRequest,
  ): Promise<AIResponse>;
  streamToolConversation?(
    plan: AIExecutionPlan,
    request: AIToolConversationRequest,
  ): AsyncIterable<AIStreamChunk>;
  transcribe?(
    plan: AIExecutionPlan,
    request: AITranscriptionRequest,
  ): Promise<AITranscriptionResult>;
}
```

Phase 1 may enrich these request, result, plan, and capability types for strict JSON Schema and resolved route metadata, but it must preserve the flat operation boundary and the product-facing gateway entrypoint. A future audio connector can implement transcription without forcing every text connector to implement it.

### 3. Connector registry

`lib/ai/connectors/registry.ts` maps stable connector ids to server-only connector factories and capability metadata.

Phase 1 connectors:

- `anthropic` — platform-managed credentials and current default models
- `openrouter` — organization-managed OpenRouter connection
- `transcription_platform` — a platform-only adapter around the existing transcription runtime; organization routing remains deferred

The OpenRouter connector maps neutral requests to its API and normalizes responses, streaming events, tool calls, structured output, usage, and errors. It must implement provider-routing controls rather than relying on OpenRouter defaults:

- `allow_fallbacks`
- provider `only`, `ignore`, or ordered preferences
- `require_parameters`
- data-collection and zero-data-retention requirements
- price ceilings where configured
- region-specific base URL where supported

The execution record distinguishes:

- **connector/transport:** for example, `openrouter`
- **model vendor:** for example, `anthropic`
- **resolved inference provider/endpoint:** when the transport returns it

Adding another connector is a registry entry, adapter, credential/config validator, error mapper, and shared contract suite. It does not add provider branches to product surfaces.

Connection endpoint configuration is never passed to an arbitrary server-side fetch. Each connector validates allowed schemes, hosts, regions, and endpoint shapes. Phase 1 OpenRouter endpoints are restricted to supported OpenRouter domains; future private-endpoint connectors require explicit egress and SSRF controls.

### 4. Verified deployment catalog

`lib/ai/catalog.ts` contains Benevolence-owned verified deployment templates. A template uses a stable Benevolence id and keeps provider identifiers as adapter data:

```typescript
interface VerifiedDeploymentTemplate {
  id: string;                         // stable Benevolence id
  connector: AIConnectorId;
  providerModelId: string;            // e.g. an OpenRouter slug
  displayName: string;
  modelVendor: string;
  openWeight: boolean;
  versionPolicy: 'pinned' | 'moving_alias';
  advertisedCapabilities: AICapability[];
  verifiedWorkloads: Partial<Record<AIWorkloadId, {
    evalSuiteVersion: string;
    verifiedAt: string;
    result: 'passed' | 'conditional';
  }>>;
  notes?: string;
}
```

Important distinctions:

- Provider-advertised parameter support is not the same as Benevolence verification.
- Capabilities belong to a model through a specific connector/deployment, not to a vendor label alone.
- `JSON Schema` support is a transport capability; output reliability is an evaluation result.
- Moving model aliases must be re-evaluated periodically and after material provider changes.
- At runtime, the connector requests only endpoints supporting required parameters when the provider offers that control.

Phase 1 settings offer curated OpenRouter templates. The canonical deployment model also supports a later organization-managed deployment whose model id is not in the curated catalog. Such a deployment remains `unverified` until it passes the applicable evaluation suite.

### 5. Tool safety policy

Model verification and tool authorization are separate controls.

- A deployment with current passing evidence for the assistant workload may use the tool risk level allowed by the organization route and the authenticated user's capabilities.
- A deployment without current passing verification evidence for the assistant workload defaults to read-only tools.
- Enabling mutation tools for a deployment without current passing assistant evidence requires an explicit organization-admin route-policy decision and audit event.
- Tools with external or irreversible side effects may require confirmation regardless of model tier.
- Undo/redo is useful recovery behavior but is not treated as an authorization or safety boundary.

The existing authenticated, tenant-scoped `AssistantToolCapabilities` boundary remains authoritative. Model output never grants a tool capability.

### 6. Route resolution and fallback

The shipped call shape is `gateway.resolve(workloadId)`, backed in Phase 0 by `resolveAIExecution(scope, workloadId)`. Phase 1 preserves that scope-plus-workload boundary and makes resolution asynchronous when it introduces the tenant-scoped route repository. It does not add caller-supplied provider, raw-model, or unconstrained `inputProfile` arguments, and it never exposes decrypted credential material to the caller.

Resolution order:

1. The organization route row for the exact workload; if present, it must be enabled and valid
2. The platform default declared by that workload, only when no organization route row exists

There is no implicit organization-wide model fallback because one deployment may not satisfy every workload. The settings UI may offer “assign to all compatible workloads,” which creates or updates explicit workload routes.

Fallback rules:

- No organization route configured: use the platform workload default.
- Organization route configured but invalid, disabled, missing credentials, or out of credit: return an actionable organization-configuration error.
- Model or endpoint unavailable: follow only the route's explicit fallback chain.
- Platform-funded fallback is disabled unless the organization route explicitly opts into it.
- A fallback candidate must pass the same capability and data-policy checks as the primary deployment.
- Removing a credential, connection, or deployment must either be rejected while a route references it or atomically reset the affected routes after explicit admin confirmation. It may not silently orphan routes.

The ordered fallback chain and policy are part of the immutable execution-plan snapshot. A stateless non-streaming workload may advance to the next explicit target only before a result is returned to product code. A streaming workload may advance only before the first provider event is accepted or any output reaches the client. Once streaming output begins, a failure terminates that invocation; the gateway never splices output from another deployment into the same stream.

For the assistant, one execution plan is resolved and snapshotted for the entire durable turn, including the ordered target chain and all multi-tool model iterations. Fallback is allowed only while establishing the first provider response, before any content/tool event is accepted and before any tool executes. After the first provider event is accepted, the selected target is pinned for the remainder of the turn; a later or mid-stream failure follows `fail_ai_turn` and never silently changes models. A settings change applies to the next turn, never halfway through a turn. Retry and replay use the stored snapshot and preserve the `(user_id, request_id)` idempotency boundary. Every attempted target is a separate invocation record with its fallback position and outcome.

### 7. Central execution gateway

`lib/ai/gateway.ts` owns the runtime sequence:

1. resolve an execution plan
2. validate input modality, capabilities, limits, and policy
3. load the credential through the server-only credential repository
4. invoke the connector with timeout and cancellation
5. normalize response and errors
6. persist invocation metadata in a `finally`-safe path
7. return only the provider-neutral result

Thin convenience functions such as `generateTextForWorkload` or `generateObjectForWorkload` may wrap the gateway. They require workload and organization scope rather than a caller-supplied raw model string.

## Canonical Data Model

This is a genuine platform product increment. The stable concepts are canonical tables because routing, audit, reporting, evaluation, and every AI product surface consume them across organizations. Provider-variable non-secret settings remain in validated JSONB extension fields; credentials remain isolated.

The increment ships in one new numbered migration. Any changes to the existing `ai_usage_log` and `ai_turns` canon are included deliberately in that increment, followed by database type regeneration and migration verification.

The current `onboarding_sessions.organization_id` name conflicts with the platform's `org_id` canon. Because that is a prerelease correction to an existing concept, it is normalized to `onboarding_sessions.org_id` in the owning `0034_onboarding.sql` migration rather than patched in the new AI-routing migration. Product code, tests, and generated database types are updated with it.

Actor references must not make organization configuration or audit history dependent on an auth user continuing to exist. Phase 1 therefore also corrects the prerelease `org_audit_log` definition in its owning `0024_settings_ops_hub.sql` migration: `actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` becomes the nullable link to a current user, while `actor_subject_id UUID NOT NULL` is a non-FK snapshot of the UUID that performed the action. Existing rows are backfilled from `actor_id` before the new non-null constraint is applied, and every subsequent audit insert writes both fields. New AI configuration `created_by`/`updated_by` fields follow the same nullable `ON DELETE SET NULL` rule. They are convenience links, not the durable audit record.

### `org_ai_connections`

One organization may have multiple connections, including multiple connections using the same connector.

```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
connector        TEXT NOT NULL,             -- validated application registry id
name             TEXT NOT NULL,
endpoint_url     TEXT,                      -- nullable; validated and server-only where sensitive
region           TEXT,
auth_type        TEXT NOT NULL,
config           JSONB NOT NULL DEFAULT '{}', -- validated, non-secret connector config
status           TEXT NOT NULL CHECK (status IN ('active', 'invalid', 'disabled')),
last_tested_at   TIMESTAMPTZ,
last_test_status TEXT,
created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (org_id, name),
UNIQUE (id, org_id)
```

There is intentionally no `CHECK (connector = 'openrouter')`. Connector ids are validated against the server registry so new connectors do not require a storage redesign.

### `org_ai_credentials`

```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id              UUID NOT NULL,
connection_id       UUID NOT NULL,
encrypted_payload   TEXT NOT NULL,
encryption_key_id   TEXT NOT NULL,
secret_fingerprint  TEXT NOT NULL,
fingerprint_key_id  TEXT NOT NULL,
display_hint        TEXT,
created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
rotated_at          TIMESTAMPTZ,
created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (connection_id),
FOREIGN KEY (connection_id, org_id)
  REFERENCES org_ai_connections(id, org_id) ON DELETE CASCADE
```

- No `authenticated` policies or grants.
- Service-role-only access through a dedicated credential repository.
- `encrypted_payload` may contain an API key or another validated credential shape; it is not assumed to be one string key forever.
- AES-256-GCM payloads are versioned by `encryption_key_id` so secrets can be rotated. A deployment-provided KMS or secret manager is preferred where available.
- `secret_fingerprint` is `HMAC-SHA-256` over the canonical credential payload using a server-held fingerprint key that is distinct from encryption keys. `fingerprint_key_id` identifies that key version. The fingerprint exists only to detect credential reuse or an unchanged rotation without exposing a brute-forceable bare hash; it is never used for authentication or decryption and is never returned to the browser.
- The raw credential is accepted only on create/rotate and never returned afterward.

### `org_ai_deployments`

```sql
id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id             UUID NOT NULL,
connection_id      UUID NOT NULL,
name               TEXT NOT NULL,
catalog_template_id TEXT,
provider_model_id  TEXT NOT NULL,
config             JSONB NOT NULL DEFAULT '{}',
verified_workloads JSONB NOT NULL DEFAULT '{}',
status             TEXT NOT NULL CHECK (status IN ('active', 'invalid', 'disabled')),
created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (org_id, name),
UNIQUE (id, org_id),
FOREIGN KEY (connection_id, org_id)
  REFERENCES org_ai_connections(id, org_id) ON DELETE CASCADE
```

`verified_workloads` is the sole persisted verification authority and contains server-authored evaluation evidence by workload. An overall verification badge is derived: current passing evidence for a workload means verified for that workload; conditional evidence means conditional; missing or stale evidence means unverified. There is no independently writable `verification_tier` column that can contradict the evidence. Experimental use is a route-policy/admin-acceptance decision, not a second deployment truth. Capabilities and verification metadata are server-validated, and an organization cannot self-assert that an untested deployment is Benevolence-verified.

### `org_ai_routes` and `org_ai_route_targets`

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
workload_id    TEXT NOT NULL,
policy         JSONB NOT NULL DEFAULT '{}', -- validated privacy, cost, and tool policy
is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
updated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (org_id, workload_id),
UNIQUE (id, org_id)
```

Ordered primary and fallback deployments are normalized rather than stored as ids inside policy JSON:

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
org_id         UUID NOT NULL,
route_id       UUID NOT NULL,
position       INTEGER NOT NULL CHECK (position >= 0),
target_kind    TEXT NOT NULL CHECK (target_kind IN ('deployment', 'platform_default')),
deployment_id  UUID,
created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
UNIQUE (route_id, position),
UNIQUE (route_id, deployment_id),
FOREIGN KEY (route_id, org_id)
  REFERENCES org_ai_routes(id, org_id) ON DELETE CASCADE,
FOREIGN KEY (deployment_id, org_id)
  REFERENCES org_ai_deployments(id, org_id) ON DELETE RESTRICT,
CHECK (
  (target_kind = 'deployment' AND deployment_id IS NOT NULL)
  OR (target_kind = 'platform_default' AND deployment_id IS NULL)
)
```

The migration also adds a partial unique index, allowing at most one platform-default target:

```sql
CREATE UNIQUE INDEX org_ai_route_targets_one_platform_default
  ON org_ai_route_targets(route_id)
  WHERE target_kind = 'platform_default';
```

`UNIQUE (route_id, deployment_id)` prevents a deployment from appearing twice while still permitting the one nullable platform-default row governed by that partial index.

Every persisted route has at least one target, exactly one position `0`, and contiguous positions `0..n-1`; an enabled empty route is never valid. Position `0` is the primary target and higher positions are explicit fallbacks. A route may include the platform workload default only through the single `platform_default` target created by an explicit admin choice. These cross-row invariants, unknown workloads, target/deployment compatibility, and policy shapes are validated by the only write path: the tenant-scoped settings repository.

`PUT .../routes` does not reorder rows in place. Inside one database transaction it locks the route, validates the complete proposed target list in memory, deletes the old targets, bulk-inserts the complete replacement with final positions, updates the route, writes its audit event, and commits. Readers see either the old valid list or the new valid list; the temporary empty state is not externally visible, and unique-position conflicts cannot occur mid-reorder.

### Invocation and durable-turn records

Expand the existing `ai_usage_log` rather than creating a second competing usage history. It becomes the centralized invocation record for every AI workload and includes at least:

- `org_id`, nullable `user_id REFERENCES auth.users(id) ON DELETE SET NULL`, nullable `portfolio_id`, session and turn linkage
- `workload_id`, connection and deployment ids
- connector/transport, model vendor, requested model, resolved model, and resolved inference provider
- provider request id
- input, output, cached, reasoning, image, and audio usage where reported
- reported or estimated cost and currency where available
- latency, status, normalized error code, and retry/fallback position
- a non-secret execution-policy snapshot or hash

No prompts, responses, tool arguments, credentials, or document contents are written to usage records.

Add an execution-plan snapshot to `ai_turns`. `begin_ai_turn`, `complete_ai_turn`, and `fail_ai_turn` remain the only atomic assistant lifecycle. The snapshot augments those semantics; it does not replace them or move conversation state into session JSONB.

### RLS and repository boundaries

- Connections, deployments, routes, and route targets: organization admins may read their non-secret settings; authenticated roles receive no direct mutation grants because connector, workload, and policy validity depends on server registries.
- Credentials: service-role-only with no authenticated access.
- `ai_usage_log`: service-role-only writes. Authenticated users retain self-read for rows whose `user_id = auth.uid()`; organization admins may read rows with a matching non-null `org_id` through `is_org_admin(org_id)`; app admins may read all rows through `is_app_admin()`. Platform rows with no user or organization remain invisible to ordinary authenticated users and are available only to app-admin/elevated reporting repositories. No authenticated role receives insert, update, or delete privileges.
- Cross-table composite foreign keys enforce matching `org_id` values.
- API routes call shared organization access guards first and construct tenant-scoped repositories from the proven access context.
- All settings mutations plus elevated credential and invocation access live behind repository capabilities. Routes and product surfaces do not construct feature-local service clients.
- Connection, credential, deployment, route, verification, and mutation-tool policy changes emit `org_audit_log` events without secret values.

## Settings Experience and API

**Page:** `/dashboard/settings/ai`, organization-admin gated. It is an organization capability setting, not gated solely by the `ai_assistant` module, because multiple modules own AI workloads.

The page has three sections:

1. **Connections** — add, test, rotate, disable, or remove an AI connection; show connector, status, region, last test, and a non-secret credential hint.
2. **Deployments** — add a curated deployment template in Phase 1; show connector, model vendor, the verification state derived for each workload, compatible workloads, and evaluation freshness.
3. **Workload routing** — assign deployments and explicit fallback/privacy/cost/tool policy to each workload. Offer “assign to all compatible workloads” as a bulk action rather than a hidden global fallback.

Phase 1 routes:

- `GET /api/org/[orgId]/ai-settings` — settings view, workload registry projection, and verified catalog
- `POST /api/org/[orgId]/ai-settings/connections` — create connection metadata and initial credential
- `PATCH /api/org/[orgId]/ai-settings/connections/[connectionId]` — update or disable metadata
- `DELETE /api/org/[orgId]/ai-settings/connections/[connectionId]` — remove only when unreferenced, or reset routes with explicit confirmation
- `PUT /api/org/[orgId]/ai-settings/connections/[connectionId]/credential` — set or rotate credential
- `POST /api/org/[orgId]/ai-settings/connections/[connectionId]/test` — validate authentication and endpoint access; apply a strict authenticated limiter keyed by organization, actor, and connection, reject concurrent probes for the same connection, and emit usage/audit metadata because the probe may consume provider credit
- `POST /api/org/[orgId]/ai-settings/deployments` — create from a verified catalog template
- `DELETE /api/org/[orgId]/ai-settings/deployments/[deploymentId]` — remove only when no route references it, or atomically replace/reset affected routes after explicit confirmation
- `POST /api/org/[orgId]/ai-settings/deployments/[deploymentId]/evaluate` — run compatible workload smoke evaluations
- `PUT /api/org/[orgId]/ai-settings/routes` — atomically validate and update workload routes and ordered targets

All routes use shared access guards, `jsonOk`/`jsonError`, and a tenant-scoped repository. Browser state belongs in `lib/ai/hooks.ts`, backed by `lib/api/client-hooks.ts`; mutations use `requestJson`. Assistant streaming continues through `requestStream` with its stable request id.

Provider-backed deployment evaluation is rate-limited separately from ordinary product AI and connection tests because it can be substantially more expensive. Limits are enforced server-side after access is proven and before credentials are loaded.

## Error Model

Connectors map native errors into a provider-neutral taxonomy:

| Error | Product behavior |
|---|---|
| `credential_invalid` | Admin-actionable connection error; no implicit platform fallback |
| `credit_exhausted` | Admin-actionable spend error |
| `rate_limited` | Retry only according to route policy and provider guidance |
| `deployment_unavailable` | Use explicit compatible fallback or return named deployment error |
| `capability_mismatch` | Reject before invocation and identify the missing workload capability |
| `policy_unsatisfied` | Reject rather than route to a provider or region outside policy |
| `credential_decryption_failed` | Disable use of the connection and surface an admin-actionable error |
| `timeout` / `aborted` | Preserve the existing durable turn failure path |
| `provider_error` | Sanitized user message plus internal provider metadata in the invocation record |

Errors shown to ordinary users never contain secret hints, raw provider payloads, endpoint credentials, or admin-only configuration details.

## Evaluation

`npm run ai:smoke -- --connector <id> --model <provider-model-id>` runs workload-specific live evaluations and emits a machine-readable report:

- assistant: portfolio read, mutation argument fidelity, create + undo, multi-tool turn, streaming assembly
- extraction: text fixture to strict schema-valid facts
- import: mapping, validation, reconciliation, and report fixtures with strict schema validation
- onboarding: extraction/tool flow and recommendation shape
- letters/summaries/financial profile: bounded output, instruction fidelity, and representative domain fixtures

Evaluation records include connector, provider model id, resolved provider when available, workload, suite version, timestamp, and result. Live smoke tests remain outside ordinary CI, but catalog invariant tests require valid, non-stale evaluation references for every `verified` workload claim.

A moving model alias losing a required capability automatically makes its route invalid on the next connection/deployment validation; it never silently downgrades the request shape.

## Testing

- **Connector contract suite:** the same text, structured-output, tool, streaming, error, cancellation, and usage cases run against every connector implementation.
- **OpenRouter contract tests:** request mapping, structured output, multi-tool streaming, provider policy fields, usage, resolved-provider metadata, and normalized errors.
- **Gateway tests:** workload resolution, capability enforcement, secret isolation, timeout behavior, centralized invocation recording, and no caller-supplied raw model bypass.
- **Resolver tests:** organization route precedence, platform defaults, complete snapshotted fallback chains, policy preservation, disabled connections, missing credentials, and no silent fallback.
- **Durable assistant tests:** one execution snapshot per turn, unchanged request-id idempotency, deterministic multi-tool routing, fallback only before the first accepted provider event, no mid-stream or later-iteration model switch, completion/failure lifecycle, and settings changes applying only to subsequent turns.
- **Settings API tests:** member/admin/cross-org access, composite tenant scoping, route/deployment compatibility, atomic replace-all reordering, contiguous target positions, primary/platform-default/deployment uniqueness, nonempty routes, referenced-connection/deployment deletion, credential non-disclosure, rate-limited probes, and audit events.
- **Migration assertions:** RLS and grants for all new tables and expanded `ai_usage_log`, composite foreign keys, route-target uniqueness, credential isolation, nullable actor links with durable audit subjects, nullable non-user invocation actors, and idempotent migration behavior.
- **Credential tests:** authenticated encryption, tamper detection, key-version rotation, redaction, and no secret serialization.
- **Provider-neutral surface tests:** every client-facing surface supplies an explicit workload and organization scope when available and imports no provider SDK.
- **Tool safety tests:** user capabilities remain authoritative; deployments without current passing assistant evidence default read-only; irreversible tools require their configured confirmation boundary.
- **Telemetry tests:** every invocation path records normalized success or failure metadata without prompts, responses, or secrets.

Every migration change is followed by `npm run db:types:generate` and `npm run verify:migrations`. Focused repository, RLS, durable-turn, and provider-neutrality contracts run alongside the normal verification suite.

## Rollout

### Phase 0 — neutral execution boundary

- Introduce the workload registry, capability-focused contracts, gateway, and normalized invocation recording.
- Route current platform Anthropic and transcription calls through the gateway adapters.
- Preserve current model choices and behavior.
- Resolve organization scope for every post-organization surface and make pre-organization onboarding behavior explicit.

Phase 0 deliberately keeps the database unchanged. It emits a complete
provider-neutral invocation event and projects the fields representable by the
current `ai_usage_log`; the Phase 1 product increment remains the single
canonical migration that expands invocation/turn storage and adds connection,
deployment, and route tables. This avoids a temporary schema that would be
immediately replaced. Because the Phase 0 table requires `user_id`, its
compatibility recorder deliberately skips actor-less platform invocations.
Phase 1 removes that projection limit by making `user_id` nullable and persists
those invocations with an explicit platform scope.

### Phase 1 — organization-managed OpenRouter

- Add the OpenRouter connector and credential type.
- Ship the canonical connection, deployment, and route tables.
- Seed a small verified catalog across vendors and open-weight models.
- Release organization-admin settings and route policy controls.
- Do not enable a deployment for a workload until its workload evaluation passes or the admin explicitly accepts experimental restrictions.

### Phase 2 — native and private connections

- Add native provider connectors according to customer demand.
- Add cloud identity, region, and private endpoint credential/configuration types.
- Permit organization-managed deployments and evaluation from the settings experience.
- Add transcription and future modalities to organization routing as connectors support them.

No Phase 2 connector requires new route, deployment, or credential tables.

## Acceptance Criteria

- An organization with no configuration receives today's platform Anthropic behavior.
- An organization can fund and route supported workloads through its OpenRouter connection without exposing its credential.
- Each workload resolves a compatible deployment and explicit policy; raw provider/model selection is absent from product surfaces.
- Adding another model to an existing connector does not change product surfaces or canonical schema.
- Adding another connector does not change product surfaces or canonical schema.
- OpenRouter routing cannot select a disallowed inference provider, fallback, retention policy, or region.
- Configured organization routes never silently consume the platform credential.
- Deployments without current passing verification evidence for the assistant workload do not receive mutation tools by default.
- Every Phase 1 invocation emits a normalized, content-free record attributable to its workload and explicit organization or platform scope; actor, connection, deployment, and resolved provider are recorded when they exist rather than fabricated for platform-only work. The Phase 1 sink accepts actor-less records, and persistence failures remain observable without replacing a successful model result.
- Every durable assistant turn snapshots one execution plan while preserving atomic `begin_ai_turn`, `complete_ai_turn`, and `fail_ai_turn` semantics.
- Pre-organization onboarding and platform-only workloads have explicit, tested default behavior.
- Credentials remain unreadable to authenticated users, absent from logs and responses, rotatable, and auditable.
