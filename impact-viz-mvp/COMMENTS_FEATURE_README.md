# Notes & Discussion Feature Documentation

## Overview
The Notes & Discussion feature enables collaborative conversations about recommendations. Portfolio members can share insights, ask questions, and discuss organizations through threaded comments.

## Database Changes

### New Table: `recommendation_comments`
Located in: `db/0026_recommendation_comments.sql`

**Schema:**
- `id` (uuid, primary key)
- `recommendation_id` (uuid, references portfolio_recommendations)
- `user_id` (uuid, references auth.users)
- `content` (text, 1-2000 characters)
- `parent_comment_id` (uuid, optional - for threaded replies)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- `is_edited` (boolean)
- `deleted_at` (timestamptz, soft delete)

**Features:**
- Threaded replies via parent_comment_id
- Soft delete to preserve conversation context
- Automatic tracking of edits
- Character limit validation (2000 chars)

**Indexes:**
- Fast lookup by recommendation
- Efficient parent comment queries
- User comment history

**Row Level Security:**
- Portfolio members can view comments on accessible recommendations
- Users can create comments on recommendations they have access to
- Users can edit/delete only their own comments

### Functions & Triggers

**get_recommendation_comment_count(rec_id)**
- Returns count of active comments for a recommendation
- Used for displaying comment counts

**trigger_set_comment_edited**
- Automatically marks comments as edited when content changes
- Updates updated_at timestamp

## API Endpoints

### GET `/api/recommendations/[id]/comments`
Fetch all comments for a recommendation
- **Auth:** Required
- **Returns:** Threaded comment structure
- **Features:**
  - Includes user information (email)
  - Organizes comments into threads
  - Only returns non-deleted comments
  - Returns total comment count

**Response Structure:**
```json
{
  "data": [
    {
      "id": "uuid",
      "content": "Great organization!",
      "user": { "id": "uuid", "email": "user@example.com" },
      "created_at": "2025-01-01T00:00:00Z",
      "is_edited": false,
      "replies": [
        {
          "id": "uuid",
          "content": "I agree!",
          "parent_comment_id": "parent-uuid",
          ...
        }
      ]
    }
  ],
  "total": 5
}
```

### POST `/api/recommendations/[id]/comments`
Create a new comment or reply
- **Auth:** Required
- **Body:**
  ```json
  {
    "content": "Comment text",
    "parent_comment_id": "uuid" // Optional, for replies
  }
  ```
- **Validation:**
  - Content: 1-2000 characters
  - User has portfolio access
  - Parent comment exists (if replying)

### PUT `/api/recommendations/comments/[commentId]`
Update an existing comment
- **Auth:** Required (must be comment author)
- **Body:**
  ```json
  {
    "content": "Updated text"
  }
  ```
- **Features:**
  - Automatically sets is_edited flag
  - Updates updated_at timestamp
  - Can only edit non-deleted comments

### DELETE `/api/recommendations/comments/[commentId]`
Soft delete a comment
- **Auth:** Required (must be comment author)
- **Effect:** Sets deleted_at timestamp
- **Note:** Soft delete preserves conversation threads

## UI Components

### CommentsSection
Main discussion interface component

**Location:** `/components/recommendations/CommentsSection.tsx`

**Features:**
- **New Comment Form:** Textarea with post button
- **Threaded Display:** Visual hierarchy for replies
- **Real-time Updates:** Fetches fresh data after actions
- **User Avatars:** Initials from email
- **Relative Timestamps:** "just now", "5m ago", "yesterday", etc.
- **Edit Mode:** Inline editing with save/cancel
- **Reply Mode:** Nested reply forms
- **Delete Confirmation:** Prompts before deletion
- **Empty States:** Encourages first comment
- **Loading States:** Spinner during fetch
- **Responsive Design:** Mobile-friendly layout

**Props:**
- `recommendationId`: string - ID of recommendation
- `onClose?`: () => void - Optional close callback

**User Actions:**
- **Post Comment:** Write top-level comments
- **Reply:** Respond to specific comments
- **Edit:** Modify own comments (marks as edited)
- **Delete:** Remove own comments (soft delete)

### RecommendationCard Enhancement
**New Features:**
- "Discussion" button to toggle comments
- Inline comments section when expanded
- Seamless integration with existing card layout

## User Experience

### Posting Comments
1. Click "Discussion" button on recommendation card
2. Type comment in textarea (max 2000 chars)
3. Click "Post Comment"
4. Comment appears immediately with user avatar

### Replying to Comments
1. Click "Reply" on any comment
2. Reply form appears inline
3. Type and submit reply
4. Reply appears nested under parent

### Editing Comments
1. Click "Edit" on own comment
2. Textarea appears with current content
3. Modify text and click "Save"
4. Comment updates with "(edited)" label

### Deleting Comments
1. Click "Delete" on own comment
2. Confirm deletion prompt
3. Comment is soft-deleted
4. Preserves thread structure

### Comment Threading
- Top-level comments: No parent
- Replies: Indented with left margin
- Multi-level: Supports unlimited nesting
- Visual hierarchy: Avatars and indentation

## Security

### Access Control
- Only portfolio members can view/comment
- Users cannot modify others' comments
- RLS policies enforce ownership
- Soft delete prevents data loss

### Validation
- Content length: 1-2000 characters
- HTML/XSS: Text-only content
- Parent validation: Must exist and be active
- Portfolio access: Verified before creation

## Migration Instructions

```bash
# Using Supabase CLI
supabase db push

# Or using psql directly
psql $DATABASE_URL < db/0026_recommendation_comments.sql

# Or via Supabase Dashboard
# Copy contents of db/0026_recommendation_comments.sql
# Paste into SQL Editor and execute
```

## Performance Considerations

### Optimizations
- Indexed queries for fast comment lookups
- Single query with LEFT JOIN for threaded data
- Client-side threading algorithm (O(n) complexity)
- Soft delete maintains referential integrity

### Scalability
- Pagination not implemented in MVP (add if >100 comments)
- Consider caching comment counts
- Real-time subscriptions possible via Supabase

## Future Enhancements

1. **Reactions/Likes:** Emoji reactions on comments
2. **Mentions:** @username notifications
3. **Rich Text:** Markdown or formatting support
4. **Attachments:** Upload images/documents
5. **Notifications:** Email when mentioned or replied to
6. **Comment Moderation:** Manager tools for hiding comments
7. **Search:** Find comments across recommendations
8. **Activity Feed:** Recent discussion activity
9. **Pinned Comments:** Highlight important discussions
10. **Real-time Updates:** Live comment feed via WebSockets

## Testing

### Manual Test Cases
1. **Create Comment:**
   - Open recommendation discussion
   - Post comment
   - Verify appears immediately
   - Verify user avatar/email shown

2. **Reply Threading:**
   - Click "Reply" on comment
   - Post reply
   - Verify indentation
   - Reply to a reply (test multi-level)

3. **Edit Comment:**
   - Click "Edit" on own comment
   - Modify text
   - Save changes
   - Verify "(edited)" label appears

4. **Delete Comment:**
   - Click "Delete" on own comment
   - Confirm dialog
   - Verify comment disappears
   - Check replies remain visible

5. **Access Control:**
   - Try editing others' comments (should fail)
   - Try deleting others' comments (should fail)
   - Access from non-member (should fail)

6. **Empty States:**
   - View discussion with no comments
   - Verify "No comments yet" message
   - Verify encouragement text

## Related Files

### Database
- `/db/0026_recommendation_comments.sql` - Migration

### API Routes
- `/app/api/recommendations/[id]/comments/route.ts` - List & create
- `/app/api/recommendations/comments/[commentId]/route.ts` - Update & delete

### UI Components
- `/components/recommendations/CommentsSection.tsx` - Main UI
- `/components/recommendations/RecommendationCard.tsx` - Integration

## Technical Notes

### Soft Delete Strategy
Comments use soft delete (deleted_at timestamp) rather than hard delete to:
- Preserve conversation context
- Maintain referential integrity for replies
- Allow potential undelete feature
- Provide audit trail

### Threading Algorithm
Client-side threading in 2 passes:
1. Build map of all comments by ID
2. Organize into tree structure

This avoids recursive database queries and provides flexibility for UI rendering.

### Timestamp Formatting
Relative timestamps provide better UX:
- < 1 minute: "just now"
- < 1 hour: "Xm ago"
- < 24 hours: "Xh ago"
- 1 day: "yesterday"
- < 7 days: "Xd ago"
- Older: Full date

### User Display
Shows email prefix as username (e.g., "jane.doe" from "jane.doe@example.com") until full user profiles are implemented.
