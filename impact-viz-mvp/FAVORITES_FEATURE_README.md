# Favorites/Shortlist Feature Documentation

## Overview
The Favorites/Shortlist feature allows portfolio members to bookmark recommendations they're interested in, creating a personal curated list for easy reference.

## Database Changes

### New Table: `recommendation_favorites`
Located in: `db/0025_recommendation_favorites.sql`

**Schema:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `recommendation_id` (uuid, references portfolio_recommendations)
- `created_at` (timestamptz)
- Unique constraint on (user_id, recommendation_id)

**Row Level Security:**
- Users can view their own favorites
- Users can add/remove their own favorites

### New View: `recommendations_with_stats`
Enriches recommendations with:
- `favorite_count`: Total number of users who favorited
- `is_favorited`: Whether current user has favorited

## API Endpoints

### POST `/api/recommendations/[id]/favorite`
Add a recommendation to the current user's favorites
- **Auth:** Required
- **Returns:** Favorite record
- **Idempotent:** Returns 200 if already favorited

### DELETE `/api/recommendations/[id]/favorite`
Remove a recommendation from favorites
- **Auth:** Required
- **Returns:** Success message

### GET `/api/portfolio/[id]/recommendations?favorites=true`
Fetch recommendations with optional favorites-only filter
- **Query Params:**
  - `favorites=true`: Return only favorited recommendations
- **Response:** Includes `is_favorited` and `favorite_count` for each recommendation

## UI Components

### RecommendationCard
**New Features:**
- Heart icon button (visible to non-manager users)
- Visual feedback for favorited state (filled red heart vs outline)
- Optimistic updates for instant UI feedback
- Loading state during API calls
- Automatic revert on error

**Props Added:**
- `is_favorited?: boolean`
- `favorite_count?: number`
- `onFavoriteToggle?: (id: string, currentState: boolean) => void`

### RecommendationsView
**New Features:**
- "View My Shortlist" toggle button (shown when user has favorites)
- Badge showing count of favorited recommendations
- Favorites-only filter mode
- Empty state for "no favorites yet"
- Combined filters (favorites + sector + sort)

**State Added:**
- `showFavoritesOnly`: boolean

### RecommendationsManager
**New Features:**
- "Total Favorites" stat card showing aggregate favorites across all members
- Visual heart icon indicator in stats

## User Experience

### For Portfolio Members:
1. **Adding to Shortlist:**
   - Click heart icon on any recommendation card
   - Icon fills with red color immediately (optimistic update)
   - Reverts if API call fails

2. **Viewing Shortlist:**
   - Click "View My Shortlist" button when favorites exist
   - Button shows count badge
   - Can still use sector filter and sorting on shortlist

3. **Removing from Shortlist:**
   - Click filled heart icon to remove
   - Icon outline appears immediately

### For Portfolio Managers:
- See total favorite counts in stats dashboard
- Understand which organizations are most popular with members
- Heart button not shown on cards (managers use edit/archive buttons)

## Migration Instructions

To apply the database migration:

```bash
# Using Supabase CLI
supabase db push

# Or using psql directly
psql $DATABASE_URL < db/0025_recommendation_favorites.sql

# Or via Supabase Dashboard
# Copy contents of db/0025_recommendation_favorites.sql
# Paste into SQL Editor and execute
```

## Technical Details

### Optimistic Updates
The favorite button uses optimistic UI updates:
1. Immediately updates local state
2. Makes API call in background
3. Reverts state if API call fails
4. Provides smooth, instant user experience

### Performance
- Database indexes on user_id and recommendation_id for fast lookups
- Single query with LEFT JOIN fetches favorites with recommendations
- Minimal overhead on recommendations list view

### Security
- RLS policies ensure users can only manage their own favorites
- Validation that user has portfolio access before allowing favorite
- Protection against duplicate favorites (database unique constraint)

## Future Enhancements

Potential additions to the favorites system:
1. **Email Notifications:** Alert when favorited org has updates
2. **Favorite Notes:** Let users add private notes to favorites
3. **Collaborative Lists:** Share favorites with other portfolio members
4. **Export Favorites:** Download shortlist as PDF/CSV
5. **Favorite Analytics:** Track when/why users favorite organizations
6. **Smart Suggestions:** Recommend orgs based on favorite patterns

## Testing

To test the feature:
1. Navigate to recommendations page as a portfolio member
2. Click heart icon on several recommendations
3. Click "View My Shortlist" to see filtered list
4. Combine with sector filter to test multiple filters
5. Remove favorites by clicking filled hearts
6. Verify empty state appears when no favorites match filters
7. As manager, verify favorite count appears in stats

## Related Files

- `/db/0025_recommendation_favorites.sql` - Database migration
- `/app/api/recommendations/[id]/favorite/route.ts` - Favorite API endpoints
- `/app/api/portfolio/[id]/recommendations/route.ts` - Enhanced recommendations endpoint
- `/components/recommendations/RecommendationCard.tsx` - Heart button UI
- `/components/recommendations/RecommendationsView.tsx` - Shortlist filter
- `/components/recommendations/RecommendationsManager.tsx` - Manager stats
