# User Guide

This guide covers the core workflows in the platform. Every feature described here reflects the current product state — not a roadmap item.

---

## Getting In

### Logging In

Navigate to your organization's URL and sign in with your email and password. If you forget your password, use the "Forgot password?" link on the login page.

### Onboarding

New users land on a guided onboarding flow:

1. **Quick intake** — organization type, name, team size, and focus areas (30 seconds)
2. **AI conversation** — the assistant asks about your current workflows, pain points, and goals (3–5 minutes)
3. **Module recommendations** — based on the conversation, the platform recommends which feature modules to enable
4. **Review and confirm** — adjust recommendations before provisioning
5. **Dashboard** — your organization and portfolio are created and you land in the product

If you leave and return, your in-progress session is restored.

---

## Dashboard

The dashboard gives you a portfolio-level overview:

- **KPI cards** — key metrics from your holdings and impact tracking
- **Holdings map** — geographic distribution of assets and grantees
- **Recent activity** — latest grants, contributions, and tasks
- **Widget carousel** — configurable charts (bubble, heatmap, timeline, trend line, and more)
- **AI Assistant** — available from any screen; see [AI Assistant](#ai-assistant) below

---

## Holdings

Holdings are the universal asset record — a holding can represent an equity position, a grant, a donation, a PRI/MRI, real estate, crypto, or other assets.

**What you can do:**
- View all holdings with type, value, and status
- Click any holding for full detail: history, linked metrics, documents, related grants or contributions
- Add new holdings manually or via the importer
- Link holdings to grantee organizations for charity data enrichment
- Edit holding details (admin/owner roles)

---

## Grants (Grant Management module)

The grant management module supports the full grant lifecycle from prospect to closeout.

### Lifecycle Stages

Every grant moves through a 14-stage lifecycle: `draft → prospect → invited → application_received → due_diligence → recommended → approved → agreement → active → renewal_review → closeout → closed` (or `declined` / `cancelled`). Invalid stage jumps are blocked.

### Views

- **Pipeline** — Kanban-style board organized by lifecycle stage
- **Table** — sortable list of all grants with inline status
- **Calendar** — grants plotted by key dates and deadlines
- **Attention Queue** — grants that require action: overdue decisions, upcoming deadlines, stalled stages

### Creating a Grant

Use the "New Grant" button or ask the AI assistant to create one. Required: holding (the grantee), portfolio, and initial stage. The wizard creates the grant record, the holding if needed, and the initial status history entry.

### Lifecycle Transitions

Move a grant forward using the transition controls on the grant detail. Decision-required stages (recommended, approved, declined) require a recorded decision before the transition completes. Every accepted transition appends an audit entry to `grant_status_history`.

**Bulk transitions** — select multiple grants in Table view and transition them together. The bulk queue validates each transition independently.

### Supporting Records

On each grant detail you can manage:
- **Milestones** — deliverables with due dates and completion status
- **Payments** — scheduled and actual disbursements with payment method
- **Reports** — required grantee reporting with due dates
- **Communications** — logged contacts with grantee staff
- **Documents** — attached files (proposals, agreements, evaluation reports)

---

## Donors (Donor Management module)

### Donor CRM

The donors section tracks people and organizations that give to your foundation:

- Donor list with lifetime giving, last gift date, and recency status
- Donor detail: contact info, giving history, communication log
- Search across donors by name, email, or EIN

### Contributions

Log contributions received with: date, amount, type (cash, check, wire, stock, crypto, real estate, other property), and donor.

### Receipts and Acknowledgments

Generate IRS-compliant tax receipts and acknowledgment letters from contribution records. Letters are generated as PDFs and stored with signed download URLs (never public). Batch acknowledgment runs are available from the donors list.

### Pledges (Pledge Tracking module)

Track multi-year donor commitments with installment schedules. Pledge records link to their installment sequence; cancellation voids all pending installments atomically.

---

## Tax Center (Tax Optimization module)

The tax center is built for foundations and family offices managing charitable deductions.

### Contributions

The contributions view shows all charitable contributions with:
- Deductible amount (calculated by contribution type and AGI limits)
- Substantiation status (what documentation is required and whether it's on file)
- Carryforward eligibility

### AGI and Deduction Limits

The tax center computes your applicable deduction limit buckets (30%, 50%, 60%) against your AGI. AGI is sourced from `tax_years.adjusted_gross_income` if set, then from `tax_profiles.estimated_agi`. The platform never silently defaults to zero.

### Carryforward Schedule

Contributions that exceed your deduction limit in one year generate carryforwards that can be applied over the next five years. The carryforward schedule shows originating year, remaining balance, and expiration.

### CPA Sharing

Generate a share link for your CPA or tax preparer. Share links:
- Are time-limited and token-based (stored as SHA-256 hashes, never in plaintext)
- Have configurable permissions (view-only vs. download)
- Log every access with timestamp and IP
- Can be revoked at any time

### Document Storage

Upload substantiation documents (receipts, appraisals, acknowledgment letters) for any contribution. Documents are stored in a private bucket and served via signed URLs with a 1-hour TTL.

### Export Options

Export your tax data as Excel, PDF summary, or TurboTax TXF format.

---

## Compliance (Compliance & Regulatory module)

### Filing Calendar

Track all required filings (990-PF, 990, state registrations, etc.) with due dates, responsible staff, and completion status. Attach supporting documents to each filing entry.

### Payout Requirement

The compliance module calculates your foundation's minimum distribution requirement under §4942, using qualifying distributions and grant payments as the distribution base against your average monthly asset FMV.

### Disqualified Persons

Register disqualified persons for self-dealing screening. The system tracks relationships and flags potential conflicts.

### State Registrations

Manage state charitable solicitation registrations with renewal dates and status.

---

## Tasks and Workflow

The task system is the operational layer that ties modules together.

- **Task inbox** — your assigned tasks across all modules (grant approvals, filing deadlines, pledge follow-ups)
- **Task detail** — comments, linked entities (grant, contribution, filing), status history
- **Automation** — certain module events (grant stage change, pledge installment due) automatically create tasks for relevant team members
- **Reminders** — time-based reminders on grants and filings

---

## AI Assistant

The AI assistant can answer questions about your data and take actions on your behalf.

### What It Can Do

The assistant has direct tools for:

- **Holdings**: create, update, search, get details, remove
- **Grants**: create, transition lifecycle, record decisions, log communications, track milestones, schedule reminders, record payments, assess grant health
- **Tax**: run scenarios, calculate deductions, retrieve carryforward schedules
- **Donors**: log contributions, get donor summaries, generate acknowledgments
- **Compliance**: get compliance status, calculate payout requirement, track filing deadlines
- **Analytics**: project metric trends, benchmark holdings, analyze portfolio risk, generate insights
- **Impact**: add metric facts, create visualizations

Every mutation is tracked in an action history that supports undo operations.

The assistant only has access to tools for modules your organization has enabled. If a module is disabled, its tools do not appear.

### What It Cannot Do

The assistant cannot access external websites, send emails, or execute financial transactions outside the platform.

### How to Use It

Type naturally. "What grants are due for a decision this month?" and "Log a $50,000 payment on the Greenfield grant" are both valid. The assistant will confirm before taking irreversible actions.

---

## Builder (Org Admins Only)

The Builder is an AI-powered configuration tool for organization admins. It understands your organization's current state — enabled modules, existing KPI definitions, module settings — and can propose configuration changes from natural language requests.

**What it can do:**
- Enable or disable modules
- Create and configure KPI definitions and metric structures
- Generate scaffolding proposals for new data structures (requires developer review and deployment)
- Explain what each module does and what enabling it will change

**What it cannot do:** The Builder cannot modify production data or deploy schema changes without developer review.

Access the Builder from your organization settings under the Builder tab.

---

## QuickBooks Integration

Connect to QuickBooks Online from Settings → Integrations.

Once connected:
- **Account sync** — import your chart of accounts for mapping contributions and grants
- **Contribution export** — export charitable contributions as journal entries
- **Grant export** — export grant disbursements as journal entries

QuickBooks connections are org-scoped. Each organization maintains its own connection.

---

## Data Import (Migration Copilot)

For organizations migrating from Blackbaud or other systems, the admin import tool provides AI-assisted field mapping and validation:

1. Upload your export file (CSV or common export formats)
2. The AI suggests column-to-field mappings based on your data
3. Review and adjust the mapping
4. Run validation to surface errors and warnings
5. Commit the import and download a reconciliation report

See `MIGRATION_GUIDE.md` for step-by-step instructions.

---

## Settings

### Organization Settings

- **Profile** — organization name, EIN, type, and branding
- **Members** — invite and manage team members; set roles (owner, admin, member, viewer)
- **Modules** — enable or disable feature modules; changes take effect immediately
- **Integrations** — QuickBooks and other third-party connections
- **Builder** — AI-powered org configuration (admins only)

### Your Profile

Update your display name, notification preferences, and contact information.

---

## Roles and Permissions

| Role | What They Can Do |
|------|-----------------|
| Owner | Everything, including transferring ownership |
| Admin | All org data, member management, module configuration, Builder |
| Member | Read and write data within enabled modules |
| Viewer | Read-only access across all enabled modules |

Role changes take effect on the next request. A user cannot lower their own role.
