# Platform Vision

## The Promise

Foundations, family offices, and philanthropic organizations all run on fundamentally different internal logic. A $10M family foundation run by two people has different grant workflows, different compliance obligations, different reporting cadences, and different definitions of "done" than a $200M community foundation with a program staff of twelve. The premise of this platform is that each of them deserves software that fits their actual operation — not a lowest-common-denominator system they adapt themselves to, and not an enterprise configuration project that costs more than it saves. The goal is a platform where an org admin, not a developer, can sit down and describe how their organization works, and the platform reconfigures itself to match. AI is the mechanism that makes that possible at a price point and complexity level that's actually accessible to the philanthropic sector.

That is a harder goal than "a good grants management system." It requires the platform to be simultaneously solid in the workflows every org shares and genuinely flexible in the workflows that differ by org. This document is the compass for building toward that goal.

---

## What Exists Today

Being honest about where the platform stands is the prerequisite for building toward where it needs to go.

**What orgs can configure right now:**

- **Module selection** — enable or disable feature sets (grants, tax, donors, compliance, analytics, etc.). Changes take effect immediately across nav, API guards, AI tools, and RLS.
- **Builder** — an org-admin-facing AI chat that understands the org's current module state and can propose module configuration changes, KPI definitions, and metric structures. Proposals are reviewed before being applied.
- **AI assistant tool filtering** — the AI assistant only surfaces tools for enabled modules. An org without the grant module never sees grant tools.
- **Coarse AI instructions** — org admins can store free-text instructions that are injected into assistant sessions, useful for tone, vocabulary, or broad operating guidance.
- **Branding** — app name, logo, colors, and support contact via environment variables.
- **Role-based access** — owner/admin/member/viewer roles enforced at the API and database level.

**What requires a developer today:**

- Any workflow-level customization within a module (e.g., custom due diligence checklists, org-specific grant stages beyond the canonical 14, required fields that differ by org)
- Custom fields on any entity (holdings, grants, donors, contributions)
- Custom views or report templates beyond what's shipped
- Structured, auditable AI behavior for a specific org beyond module filtering and coarse free-text instructions
- New module creation of any kind

---

## The Gap

The distance between "enable modules" and "build your dream operating system" is the gap this platform needs to close. Concretely, the gap is three layers:

### Layer 1: Runtime Workflow Configuration

Orgs don't just differ in which modules they use — they differ in *how* they use them. One foundation's due diligence checklist has eight items. Another's has twenty-two and requires a site visit before the recommended stage. Today both get the same hardcoded workflow. True tailoring means an admin can configure the steps, required fields, and stage rules for their org's grant process without touching code.

### Layer 2: Custom Fields and Views

Every org has data that matters to them that doesn't fit the canonical schema. A foundation that tracks its grantees' organizational budget as a ratio to grant size. A family office that tags each holding by the family member who championed it. A DAF sponsor that tracks advisor relationship tiers on donor records. Today, that data lives in spreadsheets alongside the platform because there's nowhere to put it. Custom fields — org-scoped, typed, indexed, and AI-readable — are the missing primitive.

### Layer 3: Org-Specific AI Behavior

The AI assistant today is module-filtered and can receive coarse org-level instructions, but it does not have structured, auditable knowledge of how the org actually operates. Every org using the grant module gets the same grant tools with the same underlying behavior. A platform that truly learns an org's workflows would surface the right context automatically: knowing that this foundation always requires a site visit before recommending, knowing that this org's naming convention for grants is "Program Area — Grantee — Year," knowing that the finance director wants payment confirmations flagged immediately. That richer layer of personalization — stored as managed configuration, recalled predictably, and applied by the AI — doesn't exist yet.

---

## Concrete Examples

These are real scenarios a foundation admin faces. They illustrate the gap between current state and what the vision requires.

### 1. Custom due diligence checklist

**Today:** A program officer opens a grant in `due_diligence` stage. There's no checklist. They maintain their DD checklist in a separate Google Doc and manually track completion there.

**Vision:** The org admin configured a DD checklist in Builder: "Site visit completed," "Financial statements reviewed," "Board references checked," "IRS determination letter on file." The grant detail shows this checklist. The stage transition to `recommended` is blocked until all required items are checked. The AI assistant can report: "The Greenfield grant is missing two DD checklist items before it can advance."

### 2. Custom field on a grant

**Today:** A foundation tracks its "strategic alignment score" (1–5) for each grant. This lives in a Notes field as unstructured text. The AI can't reason about it. Reports can't filter by it.

**Vision:** The org admin added a custom field: `strategic_alignment_score` (integer, 1–5, required at `recommended` stage). It appears on the grant form, is stored in the org's custom fields schema, is available in table view as a sortable column, and the AI can answer "Show me all active grants with a strategic alignment score below 3."

### 3. Org-specific AI context

**Today:** A new program staff member asks the AI "How do we handle site visits?" Unless an admin has written that policy into broad free-text AI instructions, the AI has no structured answer — it knows about grant stages but nothing about this org's process.

**Vision:** The org admin has recorded a set of operating notes in the platform: "We require a site visit for all first-time grantees. Site visits are scheduled by the program officer and documented in the DD checklist before advancing to recommended." The AI reads this context on every session and answers: "Your org requires a site visit for first-time grantees, documented in the DD checklist before advancing to recommended. Would you like me to check the Greenfield grant's site visit status?"

### 4. Custom report template

**Today:** A foundation produces a quarterly grants report for its board. A staff member exports grant data to Excel, reformats it, and pastes it into a PowerPoint template.

**Vision:** The org admin configured a board report template: logo, grant pipeline by stage, payments made this quarter, upcoming decisions, top three grants by disbursement. One click generates the PDF. The AI assistant can generate a narrative summary to accompany it.

### 5. Org-specific lifecycle stages

**Today:** A corporate giving program that doesn't use the term "grant" and doesn't have an "agreement" stage is forced to work around lifecycle stages that don't match their vocabulary or process.

**Vision:** The org admin renamed stages and optionally hid the ones they don't use. Their pipeline shows "Nomination → Screening → Review → Approved → Active → Closed" using their internal language, mapped to canonical underlying stages for compliance reporting.

---

## Decision Compass

When building a new feature or modifying an existing one, use this rubric to decide how configurable it should be:

**Hardcode it if:**
- It's a legal or compliance invariant (§4942 payout calculation, RLS enforcement, audit trail writes)
- It's a schema or data integrity constraint (foreign keys, non-null required columns, enum values)
- It's a security control (auth checks, service-role guards, signed URL generation)
- Variation would create irreconcilable complexity (multi-tenant RLS policies, grant status history structure)

**Make it configurable if:**
- Different orgs legitimately do it differently (checklist items, required fields per stage, report layouts)
- It's vocabulary or labeling (stage names, entity names, field labels)
- It's a threshold or rule that has no universal correct value (minimum DD items required, payout buffer percentage)
- An org admin could explain the variation to you in one sentence

**When in doubt:** Ask whether a program officer at a well-run foundation would expect to control this in their operating system settings. If yes, it should be configurable. If the question sounds like "should a car owner be able to configure the engine firing order," it should be hardcoded.

**Never make security, audit trail, or RLS configurable.** These are invariants. Configuration surfaces that touch them should be treated as attack vectors.

---

## How We Get There

The core gap layers — runtime workflow configuration, custom fields, and structured org-specific AI behavior — are closed progressively through the Builder, alongside the roadmap's later automation, view, vocabulary, and integration phases. The Builder's current role (module config + scaffold proposals requiring developer deployment) evolves into a runtime configuration surface where admins can define checklists, create custom fields, configure stage rules, and record operating context that the AI applies automatically.

The full architectural sketch — current configurability layers, the major missing runtime layers, how the Builder evolves, and what the end state looks like — is in [`CONFIGURABILITY_ARCHITECTURE.md`](CONFIGURABILITY_ARCHITECTURE.md).
