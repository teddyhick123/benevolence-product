# TODO Implementation Plan

## High-Priority TODOs Found

### 1. ✅ COMPLETE: IRS API Integration
**File**: `app/api/external/charity-search/route.ts:26`
**Completed**: November 30, 2025
**Status**: ✅ IMPLEMENTED AND TESTED

~~**Original State**: Returns mock/placeholder charity data~~

**NEW State**: Integrated with ProPublica Nonprofit Explorer API
- ✅ Real IRS Form 990 data (1.8M+ nonprofits)
- ✅ Accurate EIN, location, sector information
- ✅ 1-hour server-side caching
- ✅ Graceful error handling
- ✅ Tested with multiple queries

**Documentation**: See `IRS_API_INTEGRATION_COMPLETE.md` for full details

---

### ~~1. ⚠️ CRITICAL: IRS API Integration~~ [COMPLETED]
**Original File**: `app/api/external/charity-search/route.ts:26`
```typescript
// TODO: Integrate with actual IRS API or downloaded EO BMF data [DONE]
```

**Original Impact**: HIGH - Charity search returns inaccurate data

**Implementation Options**:

**Option A: IRS Tax Exempt Organization Search API**
- Free, official IRS data
- Endpoint: `https://apps.irs.gov/app/eos/`
- Requires parsing HTML or using unofficial API wrappers

**Option B: ProPublica Nonprofit Explorer API**
- Free API with good documentation
- Endpoint: `https://projects.propublica.org/nonprofits/api/`
- Returns JSON, easy to integrate
- **RECOMMENDED**

**Option C: Download IRS EO BMF File**
- Monthly updated database file
- Store in Supabase, query locally
- Best for production scale
- Requires initial setup

**Recommended Implementation** (ProPublica):
```typescript
// app/api/external/charity-search/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const state = searchParams.get('state');

  try {
    const params = new URLSearchParams({
      q: query,
      ...(state && { state }),
    });

    const response = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/search.json?${params}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    const data = await response.json();

    return NextResponse.json({
      results: data.organizations.map((org: any) => ({
        ein: org.ein,
        name: org.name,
        city: org.city,
        state: org.state,
        revenue: org.revenue_amount,
        assets: org.asset_amount,
        ntee_code: org.ntee_code,
      })),
    });
  } catch (error) {
    console.error('Charity search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

**Effort**: 2-3 hours
**Priority**: HIGH
**Blockers**: None

---

### 2. ⚠️ HIGH: XIRR Calculation
**File**: `lib/schemas/investment.ts:152`
```typescript
// TODO: Implement XIRR calculation
```

**Current State**: IRR calculations are incomplete or using simple approximations

**Impact**: HIGH - Inaccurate investment performance metrics

**Implementation**:
```typescript
// lib/tax/xirr-calculator.ts
/**
 * Calculate XIRR (Extended Internal Rate of Return)
 *
 * XIRR accounts for irregular cash flows at irregular intervals
 * Uses Newton-Raphson method to find the discount rate
 */

type CashFlow = {
  date: Date;
  amount: number; // Negative for investments, positive for returns
};

export function calculateXIRR(
  cashFlows: CashFlow[],
  guess: number = 0.1
): number | null {
  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = sorted[0].date;

  // Convert dates to years from first date
  const flows = sorted.map(cf => ({
    years: (cf.date.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    amount: cf.amount,
  }));

  let rate = guess;
  const maxIterations = 100;
  const precision = 0.000001;

  for (let i = 0; i < maxIterations; i++) {
    // Calculate NPV and derivative
    let npv = 0;
    let dnpv = 0;

    for (const flow of flows) {
      const factor = Math.pow(1 + rate, -flow.years);
      npv += flow.amount * factor;
      dnpv += -flow.years * flow.amount * factor / (1 + rate);
    }

    // Newton-Raphson: x1 = x0 - f(x0)/f'(x0)
    const newRate = rate - npv / dnpv;

    if (Math.abs(newRate - rate) < precision) {
      return newRate; // Converged
    }

    rate = newRate;
  }

  return null; // Did not converge
}

// Usage example:
export function calculateInvestmentXIRR(transactions: any[]): number | null {
  const cashFlows: CashFlow[] = transactions.map(t => ({
    date: new Date(t.date),
    amount: t.type === 'contribution' ? -t.amount : t.amount,
  }));

  // Add current NAV as final cash flow
  const lastValuation = getCurrentNAV();
  if (lastValuation) {
    cashFlows.push({
      date: new Date(),
      amount: lastValuation,
    });
  }

  return calculateXIRR(cashFlows);
}
```

**Testing**:
```typescript
// Test case: $1000 invested on 2020-01-01, worth $1500 on 2023-01-01
const cashFlows = [
  { date: new Date('2020-01-01'), amount: -1000 },
  { date: new Date('2023-01-01'), amount: 1500 },
];

const xirr = calculateXIRR(cashFlows);
// Should return ~0.1447 (14.47% annualized return)
```

**Effort**: 3-4 hours (including testing)
**Priority**: HIGH
**Blockers**: Need transaction/valuation data structure finalized

---

### 3. ✅ COMPLETE: Tax Fields Enhancement
**File**: `app/api/portfolio/[id]/tax/export/route.ts:199-200`
**Completed**: November 30, 2025
**Status**: ✅ IMPLEMENTED AND TESTED

~~**Original State**: Missing important tax fields in contribution records~~

**NEW State**: Enhanced tax tracking with QCD support
- ✅ Added `qcd_qualified` field to database
- ✅ Updated Zod schema with QCD validation
- ✅ Added 3 QCD helper functions (limit, benefit, validation)
- ✅ Fixed export routes to use real field values
- ✅ Bonus: Fixed `requires_appraisal` hardcoding issue

**Documentation**: See `TAX_FIELDS_ENHANCEMENT_COMPLETE.md` for full details

---

### ~~3. 🔶 MEDIUM: Tax Fields Enhancement~~ [COMPLETED]
**Original File**: `app/api/portfolio/[id]/tax/export/route.ts:199-200`
```typescript
qcd_qualified: false, // TODO: Add qcd_qualified field to contribution [DONE]
requires_appraisal: false, // TODO: Add from enhanced fields [DONE]
```

**Original Impact**: MEDIUM - Affects tax form accuracy, but has defaults

**Implementation**:

**Step 1: Database Migration**
```sql
-- db/0022_tax_enhancements.sql
ALTER TABLE tax_contributions
ADD COLUMN qcd_qualified BOOLEAN DEFAULT FALSE,
ADD COLUMN requires_appraisal BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tax_contributions.qcd_qualified IS
  'Qualified Charitable Distribution (age 70½+, from IRA)';

COMMENT ON COLUMN tax_contributions.requires_appraisal IS
  'Contribution > $5,000 requires qualified appraisal';
```

**Step 2: Update Schema**
```typescript
// lib/schemas/tax.ts
export const taxContributionSchema = z.object({
  // ... existing fields
  qcd_qualified: z.boolean().optional().default(false),
  requires_appraisal: z.boolean().optional().default(false),
});
```

**Step 3: Auto-calculate requires_appraisal**
```typescript
// When creating contribution
const requiresAppraisal = (
  contribution_type === 'stock' ||
  contribution_type === 'real_estate' ||
  contribution_type === 'pe_vc'
) && fmv > 5000;
```

**Effort**: 2 hours
**Priority**: MEDIUM
**Blockers**: None

---

### 4. 🔶 MEDIUM: Email Service Integration
**File**: `app/api/portfolio/[id]/tax/cpa-share/route.ts:150`
```typescript
// TODO: Integrate with email service (SendGrid, AWS SES, etc.)
console.log('Would send email to:', recipientEmail);
```

**Current State**: Email "sending" just logs to console

**Impact**: MEDIUM - CPA sharing feature non-functional

**Implementation Options**:

**Option A: Resend (Recommended)**
```bash
npm install resend
```

```typescript
// lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendCPAEmail({
  to,
  cpaName,
  portfolioName,
  shareUrl,
  pdfBuffer,
}: {
  to: string;
  cpaName: string;
  portfolioName: string;
  shareUrl: string;
  pdfBuffer: Buffer;
}) {
  return await resend.emails.send({
    from: 'Tax Documents <tax@yourdomain.com>',
    to,
    subject: `Tax Information for ${portfolioName}`,
    html: `
      <h2>Hello ${cpaName},</h2>
      <p>You've been granted access to tax documents for ${portfolioName}.</p>
      <p><a href="${shareUrl}">View Documents</a></p>
      <p>The link expires in 30 days.</p>
    `,
    attachments: [
      {
        filename: 'tax-summary.pdf',
        content: pdfBuffer,
      },
    ],
  });
}
```

**Option B: AWS SES**
- More complex setup
- Better for high volume
- Cheaper at scale

**Effort**: 3 hours (including testing)
**Priority**: MEDIUM
**Blockers**: Need domain for sending (from address)

---

## Implementation Roadmap

### Week 1 (Immediate)
- [x] Fix all TypeScript errors ✅
- [ ] Implement XIRR calculation
- [ ] Integrate ProPublica Nonprofit API

### Week 2
- [ ] Add tax enhancement fields (qcd_qualified, requires_appraisal)
- [ ] Set up Resend for email
- [ ] Test CPA sharing flow end-to-end

### Week 3
- [ ] Clean up console.log statements (run script)
- [ ] Add ESLint rule for no-console
- [ ] Performance testing

---

## Lower Priority TODOs (Nice to Have)

### Documentation TODOs (Keep as-is)
- EIN format comments (XX-XXXXXXX) - These are helpful
- SSN masking comments - Documentation

### Future Enhancements
- Structured logging library
- Email templates with React Email
- Automated tax form PDF generation
- Multi-year tax optimization engine

---

## Resources

### API Documentation
- ProPublica Nonprofits API: https://projects.propublica.org/nonprofits/api/
- Resend Docs: https://resend.com/docs
- AWS SES: https://docs.aws.amazon.com/ses/

### XIRR References
- Excel XIRR Formula: https://support.microsoft.com/en-us/office/xirr-function
- Newton-Raphson Method: https://en.wikipedia.org/wiki/Newton%27s_method

### Tax References
- IRS Form 8283: https://www.irs.gov/forms-pubs/about-form-8283
- QCD Rules: https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras-distributions-withdrawals
