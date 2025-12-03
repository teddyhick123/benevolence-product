# Direct Action Flows Feature

**Status:** ✅ Complete
**Feature #7** in Recommendations Enhancement Roadmap
**Completed:** 2025-01-29

## Overview

The Direct Action Flows feature enables portfolio members to take immediate action on recommended organizations directly from the recommendations interface. Instead of just viewing recommendations, users can now instantly create donations, request meetings, or set up formal grants—transforming recommendations into real-world impact.

## What We Built

### 1. Direct Action Buttons Component
**File:** `components/recommendations/DirectActionButtons.tsx`

A collection of three action buttons that appear on each recommendation card:

**Make a Donation**
- Creates a donation holding/transaction
- Opens modal for donation details
- Integrates with existing holdings system

**Request Meeting**
- Pre-fills email template for outreach
- Opens user's email client with mailto: link
- Uses recommendation's contact information
- Fallback to website if no email available

**Create Grant**
- Opens grant creation workflow
- Creates holding + grant details
- Sets up reporting and deliverables

### 2. Make a Donation Modal
**File:** `components/recommendations/MakeDonationModal.tsx`

Full-featured donation creation modal:

**Features:**
- Pre-filled organization details (name, EIN, sector)
- Suggested donation range (from recommendation)
- Donation amount input with currency formatting
- Donation date picker
- Donation type selection (Cash, Stock, Other)
- Custodian/source field (e.g., "Fidelity DAF")
- Optional notes field
- Creates holding record with metadata
- Links back to source recommendation

**Data Created:**
- Holding with `asset_type: 'donation'`
- Metadata includes `from_recommendation_id`
- Stores donation type, EIN, and notes

### 3. Create Grant Modal
**File:** `components/recommendations/CreateGrantModal.tsx`

Comprehensive grant setup modal:

**Features:**
- Grant source selection (Foundation vs DAF)
- Grant amount input
- Grant type selection (6 types):
  - General Operating
  - Project Grant
  - Capacity Building
  - Multi-Year
  - Seed Funding
  - Planning Grant
- Grant period (start/end dates)
- Reporting frequency dropdown
- Deliverables & expectations textarea
- Renewal eligibility checkbox
- Renewal date picker

**Data Created:**
- Holding with `asset_type: 'foundation_grant'` or `'daf_grant'`
- Grant details record linked to holding
- Metadata linking back to recommendation

### 4. Request Meeting Email Template
**Built into:** `DirectActionButtons.tsx`

Smart email generation:

**Template Includes:**
- Organization name in subject
- Contact name (if available)
- Professional greeting
- Meeting request purpose
- Areas of interest (bullet points)
- Snippet from recommendation description
- Professional closing

**Behavior:**
- Opens `mailto:` link with pre-filled email
- Falls back to organization website if no email
- Alert message if no contact info available

### 5. Integration into Recommendation Card
**Updated:** `components/recommendations/RecommendationCard.tsx`

**UI Integration:**
- New "Take Action" section with border separator
- Only visible to portfolio members (not managers)
- Appears after main action buttons
- Success callbacks for donation/grant creation
- Console logging for tracking

## User Experience

### For Portfolio Members

**Viewing a Recommendation:**
1. Scroll down to "Take Action" section
2. See three prominent action buttons

**Making a Donation:**
1. Click "Make a Donation" button
2. Review pre-filled organization details
3. Enter donation amount (suggested range shown)
4. Select date and donation type
5. Optionally add custodian and notes
6. Click "Create Donation"
7. Donation record created in holdings
8. Can now track donation with other portfolio assets

**Requesting a Meeting:**
1. Click "Request Meeting" button
2. Email client opens with pre-written template
3. Edit template as needed
4. Send email directly from email client

**Creating a Grant:**
1. Click "Create Grant" button
2. Choose grant source (Foundation or DAF)
3. Enter grant amount
4. Select grant type and dates
5. Set reporting requirements
6. Add deliverables
7. Enable renewal if applicable
8. Click "Create Grant"
9. Grant created with full tracking
10. Can add milestones and reports later

### For Portfolio Managers

- Direct action buttons **not shown** to managers
- Managers focus on curation, not execution
- Members take action on manager's recommendations
- Clear separation of roles

## Technical Architecture

### Component Hierarchy

```
RecommendationCard
  └─ DirectActionButtons
       ├─ MakeDonationModal
       └─ CreateGrantModal
```

### Data Flow

**Make a Donation:**
```
User clicks button
  → Modal opens with pre-filled data
  → User enters donation details
  → POST /api/portfolio/{id}/holdings
  → Creates holding with asset_type='donation'
  → Metadata links to recommendation
  → Success callback with holding ID
  → Modal closes
```

**Request Meeting:**
```
User clicks button
  → Generates email template
  → Constructs mailto: URL
  → Opens user's email client
  → User sends email externally
```

**Create Grant:**
```
User clicks button
  → Modal opens with pre-filled data
  → User enters grant details
  → POST /api/portfolio/{id}/holdings
    (creates holding)
  → POST /api/portfolio/{id}/holdings/{holdingId}/grant-details
    (creates grant details)
  → Success callback with holding ID
  → Modal closes
```

### Integration Points

**With Existing Systems:**
- Holdings API (`/api/portfolio/[id]/holdings`)
- Grant Details API (`/api/portfolio/[id]/holdings/[holdingId]/grant-details`)
- Recommendation status tracking
- Portfolio member permissions

**Data Linkage:**
- Holding `metadata.from_recommendation_id` traces back to source
- Enables reporting on recommendation → action conversion
- Tracks which recommendations lead to actual giving

## API Requirements

### Endpoints Used

**POST `/api/portfolio/[id]/holdings`**
- Creates donation or grant holding
- Requires portfolio edit permissions
- Returns holding ID

**POST `/api/portfolio/[id]/holdings/[holdingId]/grant-details`**
- Adds grant-specific details
- Must be called after holding creation
- Optional (gracefully handles failures)

### Permissions

- Only portfolio members (editors/owners) can create holdings
- RLS policies enforce portfolio access
- `can_edit_portfolio` RPC used for authorization

## Configuration

### Email Template Customization

Modify template in `DirectActionButtons.tsx`:

```typescript
const subject = `Meeting Request: ${recommendation.organization_name}`;
const body = `Dear ${contactName || 'Team'},
[Your custom template...]
`;
```

### Asset Types

**Donations:** `asset_type: 'donation'`
**Grants:** `asset_type: 'foundation_grant'` or `'daf_grant'`

### Grant Types

Defined in `lib/schemas/grant.ts`:
- `general_operating`
- `project`
- `capacity_building`
- `multi_year`
- `seed`
- `planning`

## Usage Examples

### Basic Usage (Already Integrated)

No additional code needed! The DirectActionButtons component is already integrated into RecommendationCard for all non-manager views.

### Custom Success Handling

```typescript
<DirectActionButtons
  recommendation={recommendation}
  onDonationCreated={(holdingId) => {
    // Custom logic after donation created
    updateRecommendationStatus(recommendation.id, 'donated');
    showSuccessToast('Donation recorded!');
    refreshHoldings();
  }}
  onGrantCreated={(holdingId) => {
    // Custom logic after grant created
    updateRecommendationStatus(recommendation.id, 'granted');
    navigateToGrant(holdingId);
  }}
/>
```

### Standalone Usage

```typescript
import DirectActionButtons from '@/components/recommendations/DirectActionButtons';

<DirectActionButtons
  recommendation={{
    id: 'rec-123',
    organization_name: 'Save the Whales',
    portfolio_id: 'port-456',
    sector: 'Environment',
    country: 'USA',
    ein: '12-3456789',
    contact_info: {
      email: 'contact@savethewhales.org',
      contact_name: 'Jane Doe'
    },
    min_investment: 5000,
    max_investment: 25000,
    // ... other fields
  }}
  onDonationCreated={(id) => console.log('Donation:', id)}
  onGrantCreated={(id) => console.log('Grant:', id)}
/>
```

## Testing

### Manual Testing Checklist

**Make a Donation:**
- [ ] Click "Make a Donation" button
- [ ] Verify organization details display correctly
- [ ] Verify suggested range shows (if available)
- [ ] Enter amount and select date
- [ ] Choose donation type (cash/stock/other)
- [ ] Add optional custodian and notes
- [ ] Submit form
- [ ] Verify donation created in holdings
- [ ] Check metadata contains `from_recommendation_id`
- [ ] Verify EIN and sector copied correctly

**Request Meeting:**
- [ ] Click "Request Meeting" button
- [ ] Verify email client opens
- [ ] Check subject line has organization name
- [ ] Check contact name in greeting (if available)
- [ ] Verify description snippet included
- [ ] Test fallback when no email (should open website)
- [ ] Test fallback when no email or website (should show alert)

**Create Grant:**
- [ ] Click "Create Grant" button
- [ ] Select grant source (Foundation/DAF)
- [ ] Enter grant amount
- [ ] Select grant type from dropdown
- [ ] Set grant period dates
- [ ] Choose reporting frequency
- [ ] Add deliverables text
- [ ] Toggle renewal eligible
- [ ] Set renewal date (if eligible)
- [ ] Submit form
- [ ] Verify holding created
- [ ] Verify grant details created
- [ ] Check all data saved correctly

**Edge Cases:**
- [ ] Test with recommendation without EIN
- [ ] Test with recommendation without contact info
- [ ] Test with recommendation without website
- [ ] Test with very long organization names
- [ ] Test with special characters in notes
- [ ] Test canceling each modal
- [ ] Test validation errors (negative amounts, etc.)

### Error Scenarios

**API Failures:**
- Network error during creation
- Permission denied (not portfolio member)
- Invalid data format
- Missing required fields

**User Input Errors:**
- Negative or zero amounts
- Invalid date formats
- Missing required fields

All errors display in red alert box within modal.

## Known Limitations

1. **Email Client Dependency**
   - Request Meeting requires user's email client configured
   - May not work in some browser/OS combinations
   - Fallback to website if email unavailable

2. **No Draft Saving**
   - Modals don't save progress
   - User must complete form in one session
   - Closing modal loses entered data

3. **Single-Step Process**
   - Can't create donation and grant simultaneously
   - Each action is independent
   - No bulk action creation

4. **No File Uploads**
   - Grant modal doesn't support document attachments
   - Must add documents to grant later
   - No logo or image uploads

5. **Limited Validation**
   - Basic field validation only
   - No duplicate donation detection
   - No spending limit checks

## Future Enhancements

### Potential Improvements

1. **Smart Defaults**
   - Remember user's preferred custodian
   - Auto-fill common grant deliverables
   - Suggest donation amounts based on history

2. **Batch Operations**
   - Create multiple donations from multiple recommendations
   - Bulk grant creation
   - Multi-organization meeting requests

3. **Integration Enhancements**
   - Auto-update recommendation status after action
   - Create calendar event for meeting requests
   - Link to grant tracking immediately after creation

4. **Rich Features**
   - Recurring donation setup
   - Multi-year grant planning wizard
   - Impact projection calculator

5. **Communication Tools**
   - In-app messaging instead of email
   - Meeting scheduler integration (Calendly, etc.)
   - Video call link generation

6. **Workflow Automation**
   - Auto-create grant milestones from template
   - Auto-generate reporting schedule
   - Approval workflow for large donations

## Performance Considerations

**Modal Loading:**
- Components lazy-loaded when needed
- No performance impact when not in use
- Modals unmount on close (clean memory)

**API Calls:**
- Single API call per action
- Grant creation = 2 API calls (holding + details)
- Graceful degradation if grant details fail

**Form Validation:**
- Client-side validation prevents bad API calls
- Server-side validation as backup
- Clear error messages

## Accessibility

**Keyboard Navigation:**
- All buttons keyboard accessible
- Tab order logical
- Enter/Space activate buttons
- Escape closes modals

**Screen Readers:**
- Semantic HTML throughout
- ARIA labels on buttons
- Form labels properly associated
- Error messages announced

**Visual Design:**
- High contrast button colors
- Clear focus indicators
- Large touch targets (44px min)
- Readable font sizes

## Related Features

**Builds On:**
- Holdings system (existing)
- Grant management (existing)
- Recommendations base (features #1-4)

**Works With:**
- Status tracking (recommendation → donated/granted)
- Tax tracking (donations can be added to tax tracker)
- Impact reporting (track outcomes from grants)

**Enables:**
- Conversion tracking (recommendations → actions)
- ROI analysis (which recommendations lead to giving)
- Pipeline management (status progression)

## Support & Troubleshooting

### Common Issues

**Problem:** "Failed to create donation record"
- **Solution:** Check portfolio edit permissions, verify API endpoint accessible

**Problem:** Email client doesn't open on "Request Meeting"
- **Solution:** Check browser settings, try different browser, use fallback website link

**Problem:** Grant details not saving
- **Solution:** Holding created successfully, grant details API may have failed. Add details manually via grant management page.

**Problem:** Modal won't close after success
- **Solution:** Clear browser cache, check console for errors

### Debug Mode

Enable console logging:
```typescript
onDonationCreated={(holdingId) => {
  console.log('Donation created:', holdingId);
  // Add more logging as needed
}}
```

---

**Feature Status:** Production Ready ✅
**Last Updated:** 2025-01-29
**Maintained By:** Development Team
**Questions?** See main project documentation or open an issue.
