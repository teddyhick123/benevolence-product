# Recommendation Status Tracking Feature Documentation

## Overview
The Status Tracking feature enables portfolio members to track the progression of recommendations through various engagement stages, from initial discovery to final donation. It provides a complete audit trail of status changes with optional notes.

## Status Workflow

### Status States
1. **New** ✨ - Initial state when recommendation is added
2. **Reviewing** 👀 - Organization is under review
3. **Interested** ⭐ - Portfolio member expresses interest
4. **Contacted** 📧 - Initial contact made with organization
5. **Meeting Scheduled** 📅 - Meeting or call scheduled
6. **In Discussion** 💬 - Active discussions ongoing
7. **Approved** ✅ - Approved for donation/grant
8. **Declined** ❌ - Decided not to pursue
9. **Donated** 🎁 - Donation has been made

### Status Flow
```
new → reviewing → interested → contacted → meeting_scheduled → in_discussion → approved/declined → donated
```

Note: Users can move between statuses flexibly; this is not a strict linear flow.

## Database Changes

### Table Modifications: `portfolio_recommendations`
Located in: `db/0027_recommendation_status_tracking.sql`

**New Columns:**
- `interaction_status` (text, default 'new') - Current status
- `status_updated_at` (timestamptz) - Timestamp of last status change
- `status_updated_by` (uuid) - User who last updated status

**New Index:**
- `idx_portfolio_recommendations_interaction_status` - Fast status filtering

### New Table: `recommendation_status_history`
Complete audit trail of all status changes

**Schema:**
- `id` (uuid, primary key)
- `recommendation_id` (uuid, references portfolio_recommendations)
- `user_id` (uuid, references auth.users)
- `old_status` (text, nullable)
- `new_status` (text)
- `notes` (text, optional context)
- `created_at` (timestamptz)

**Features:**
- Immutable audit log
- Optional notes for context
- Tracks who made each change
- Chronological ordering

**Indexes:**
- Fast lookup by recommendation
- User activity tracking

### Functions & Triggers

**record_recommendation_status_change()**
- Automatically logs all status changes
- Triggered on INSERT and UPDATE
- Captures old and new status
- Records user and timestamp

**Trigger: trigger_record_status_change**
- Executes after INSERT/UPDATE on portfolio_recommendations
- Maintains complete history

### View: `recommendations_with_status`
Enriched view combining recommendations with status metadata:
- Current status information
- Status updater's email
- Count of status changes
- Recent status history (last 5 changes)

## API Endpoints

### GET `/api/recommendations/[id]/status`
Fetch complete status history for a recommendation
- **Auth:** Required (portfolio member)
- **Returns:** Array of status changes, ordered by date (newest first)
- **Includes:** User information for each change

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "old_status": "reviewing",
      "new_status": "interested",
      "notes": "Great mission alignment",
      "created_at": "2025-01-15T10:30:00Z",
      "user": {
        "id": "uuid",
        "email": "jane@example.com"
      }
    }
  ]
}
```

### PUT `/api/recommendations/[id]/status`
Update recommendation status
- **Auth:** Required (portfolio member)
- **Body:**
  ```json
  {
    "status": "contacted",
    "notes": "Initial email sent to ED" // Optional
  }
  ```
- **Validation:**
  - Status must be valid enum value
  - Notes max 500 characters
  - User must have portfolio access

**Side Effects:**
- Updates `interaction_status`, `status_updated_at`, `status_updated_by`
- Triggers automatic history recording
- Adds notes to history entry if provided

## UI Components

### StatusBadge
Interactive status indicator with update modal

**Location:** `/components/recommendations/StatusBadge.tsx`

**Features:**
- **Visual Status Display:**
  - Color-coded badges with icons
  - Hover effects
  - Dropdown indicator

- **Status Update Modal:**
  - Grid of all available statuses
  - Visual selection with checkmarks
  - Optional notes field (500 char limit)
  - Character counter
  - Optimistic UI updates

- **Status Colors:**
  - New: Blue
  - Reviewing: Purple
  - Interested: Yellow
  - Contacted: Orange
  - Meeting Scheduled: Cyan
  - In Discussion: Indigo
  - Approved: Emerald green
  - Declined: Red
  - Donated: Green

**Props:**
- `recommendationId`: string
- `currentStatus`: StatusType
- `onStatusChange?`: (newStatus) => void
- `readonly?`: boolean (for managers)

**Modes:**
- **Interactive:** Shows dropdown, opens modal on click
- **Readonly:** Static display only (for managers)

### StatusHistory
Timeline display of status changes

**Location:** `/components/recommendations/StatusHistory.tsx`

**Features:**
- **Timeline Visualization:**
  - Vertical timeline with dots and connecting lines
  - Status transitions shown with arrows
  - Relative or absolute timestamps
  - User attribution

- **Expandable:**
  - Shows first 3 entries by default
  - "Show more" button if > 3 entries
  - Collapsible to reduce visual clutter

- **Information Display:**
  - Old status → New status
  - Quoted notes (if provided)
  - Username and timestamp
  - Formatted dates

**Props:**
- `recommendationId`: string

### RecommendationCard Integration
**New Features:**
- Status badge prominently displayed with tags
- "History" button to view status timeline
- Inline status history expansion
- Status updates reflected immediately

## User Experience

### Viewing Status
- Status badge visible on every recommendation card
- Color and icon indicate current state
- Managers see readonly badges

### Updating Status
1. Click status badge
2. Modal appears with all statuses
3. Select new status (current highlighted)
4. Optionally add notes explaining change
5. Click "Update Status"
6. Badge updates immediately
7. History recorded automatically

### Viewing History
1. Click "History" button on card
2. Timeline expands showing all changes
3. See who changed status and when
4. Read notes providing context
5. Expand to see full history if truncated

## Access Control

### Permissions
- **Portfolio Members:**
  - Can update status on accessible recommendations
  - Can view status history
  - Can add notes to changes

- **Managers:**
  - See readonly status badges
  - Cannot update status (feature for members)
  - Can view complete history

### RLS Policies
- View history: Must be portfolio member
- Create history: Automatic via trigger
- Update status: Must be portfolio member with access

## Migration Instructions

```bash
# Using Supabase CLI
supabase db push

# Or using psql directly
psql $DATABASE_URL < db/0027_recommendation_status_tracking.sql

# Or via Supabase Dashboard
# Copy contents and execute in SQL Editor
```

## Analytics Opportunities

### Metrics to Track
1. **Average time in each status**
   - Identify bottlenecks
   - Optimize engagement process

2. **Conversion rates by status**
   - % that reach "donated" from each stage
   - Drop-off points

3. **Most common status paths**
   - Typical progression patterns
   - Unusual paths worth investigating

4. **User engagement**
   - Who updates statuses most frequently
   - Active vs passive members

5. **Status distribution**
   - How many recommendations in each state
   - Pipeline health

## Future Enhancements

1. **Automated Status Triggers:**
   - Auto-update to "contacted" when email sent
   - Move to "donated" when transaction created
   - Calendar integration for "meeting_scheduled"

2. **Status-Based Notifications:**
   - Alert manager when moved to "approved"
   - Remind to follow up if "contacted" for 30 days
   - Celebrate when reaching "donated"

3. **Custom Statuses:**
   - Allow portfolios to define custom statuses
   - Industry-specific workflows

4. **Status Templates:**
   - Pre-fill notes with templates
   - Common reasons for status changes

5. **Bulk Status Updates:**
   - Update multiple recommendations at once
   - Useful for portfolio-wide decisions

6. **Status Reports:**
   - Export status history
   - Generate pipeline reports
   - Forecast donations based on pipeline

7. **Integration with Calendar:**
   - Add calendar events from "meeting_scheduled"
   - Sync status changes with meetings

8. **Slack/Email Notifications:**
   - Notify team of important status changes
   - Daily digest of status updates

## Testing

### Manual Test Cases

1. **Initial Status:**
   - Create new recommendation
   - Verify default status is "new"
   - Check history shows creation

2. **Status Update:**
   - Click status badge
   - Select different status
   - Add optional notes
   - Verify immediate update
   - Check history recorded

3. **Status History:**
   - Make multiple status changes
   - Click "History" button
   - Verify chronological order
   - Check notes appear
   - Test expand/collapse

4. **Access Control:**
   - Try updating as non-member (should fail)
   - Verify manager sees readonly badge
   - Check RLS policies work

5. **Notes:**
   - Add notes with status change
   - Verify saved to history
   - Test character limit (500)
   - Check notes display properly

6. **Edge Cases:**
   - Update to same status (should work but redundant)
   - Very long notes (test truncation/display)
   - Rapid status changes (test order)

## Related Files

### Database
- `/db/0027_recommendation_status_tracking.sql` - Migration

### API Routes
- `/app/api/recommendations/[id]/status/route.ts` - Status API

### UI Components
- `/components/recommendations/StatusBadge.tsx` - Status badge & modal
- `/components/recommendations/StatusHistory.tsx` - Timeline view
- `/components/recommendations/RecommendationCard.tsx` - Integration

## Technical Notes

### Status Enum
Stored as text with CHECK constraint for data integrity. Using text instead of enum type allows easier addition of new statuses without schema migrations.

### Audit Trail Design
- Immutable history preserves complete record
- Trigger-based recording ensures accuracy
- Separate notes field provides context
- User tracking enables accountability

### Performance
- Indexed status queries for fast filtering
- Limit 5 recent changes in view to reduce payload
- Lazy-loaded full history on demand

### Timestamp Strategy
- `status_updated_at` on main table for quick access
- `created_at` in history for precise timing
- Both timestamps enable time-based queries

## Best Practices

### For Users
- Add notes when making significant status changes
- Update status promptly as engagement progresses
- Review history before making decisions
- Use consistent terminology in notes

### For Developers
- Always update status via API (triggers handle history)
- Never manually insert into status_history table
- Use view for enriched status queries
- Consider pagination for long histories
