# Phase 2: Charity Discovery Data Enrichment

## Overview

Phase 2 enriches your charity database with real ratings and data from external APIs.

## What's Been Built

### ✅ Complete

1. **Rating Cache System** (`db/0034_charity_rating_cache.sql`)
   - 30-day TTL for cached ratings
   - Automatic cleanup function
   - Supports multiple providers

2. **ProPublica Integration** (Free, No API Key)
   - Import charities from IRS Form 990 data
   - 1.5M+ nonprofits available
   - Already working! 9 charities imported

3. **Charity Navigator Service** (`lib/services/charity-navigator.ts`)
   - Fetches official ratings (0-100 score, letter grade)
   - Financial health and accountability scores
   - ⚠️ Requires API key

4. **Candid (GuideStar) Service** (`lib/services/candid.ts`)
   - Fetches transparency seals (Platinum/Gold/Silver/Bronze)
   - Profile level data
   - ⚠️ Requires API key

5. **Enrichment API** (`/api/charities/enrich`)
   - Batch enrichment endpoint
   - Automatic caching
   - Rate limiting built-in

## API Keys Needed

### 1. Charity Navigator API

**Apply at**: https://www.charitynavigator.org/index.cfm?bay=content.view&cpid=1397

**Steps**:
1. Fill out API application form
2. Explain use case: "Nonprofit impact visualization platform for portfolio advisors"
3. Wait for approval (usually 1-2 business days)
4. Add to `.env.local`:
   ```
   CHARITY_NAVIGATOR_API_KEY=your_key_here
   ```

**Rate Limit**: 10,000 requests/month (plenty for your use case)

**Cost**: Free for basic tier

### 2. Candid (GuideStar) API

**Apply at**: https://www.guidestar.org/products-services/developer-tools

**Steps**:
1. Create Candid account
2. Apply for developer API access
3. Choose plan (Basic is usually free)
4. Add to `.env.local`:
   ```
   CANDID_API_KEY=your_key_here
   ```

**Rate Limit**: 1,000 requests/day (Basic tier)

**Cost**: Free tier available, paid tiers for higher limits

## How to Use

### Import Charities from ProPublica

```bash
# Import well-known charities
npx ts-node scripts/import-charities-propublica.ts

# Or use the API directly
curl -X POST http://localhost:3000/api/charities/import/propublica \
  -H "Content-Type: application/json" \
  -d '{"mode": "ein", "ein": "53-0196605"}'  # American Red Cross

# Batch import
curl -X POST http://localhost:3000/api/charities/import/propublica \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "batch",
    "eins": ["53-0196605", "13-1760110", "94-1467465"]
  }'
```

### Enrich Charities with Ratings

⚠️ **Requires API keys to be set**

```bash
# Enrich all charities without ratings (up to 10)
curl -X POST http://localhost:3000/api/charities/enrich \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'

# Enrich specific charity by EIN
curl -X POST http://localhost:3000/api/charities/enrich \
  -H "Content-Type: application/json" \
  -d '{"ein": "53-0196605"}'

# Enrich with specific providers only
curl -X POST http://localhost:3000/api/charities/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "providers": ["charity_navigator"]
  }'
```

## Database Migrations to Run

1. **First**: Run migration `0034_charity_rating_cache.sql`
   ```sql
   -- In Supabase SQL editor or your migration tool
   ```

2. **Then**: Import charities from ProPublica
   ```bash
   npx ts-node scripts/import-charities-propublica.ts
   ```

3. **Finally** (once you have API keys): Enrich with ratings
   ```bash
   curl -X POST http://localhost:3000/api/charities/enrich -d '{"limit": 100}'
   ```

## Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| ProPublica Import | ✅ Working | 9 charities imported |
| Rating Cache | ✅ Ready | Migration created |
| Charity Navigator | ⏸️ Awaiting API Key | Code complete |
| Candid/GuideStar | ⏸️ Awaiting API Key | Code complete |
| Enrichment API | ✅ Ready | Will work once keys added |

## Testing the Charities Page

Visit: http://localhost:3000/charities

You should now see:
- ✅ 9 real charities in "All Charities" view
- ✅ Search and filtering working
- ⏸️ Ratings will appear once API keys are added and enrichment runs

## Next Steps

1. **Apply for API keys** (Charity Navigator + Candid)
2. **Add keys to `.env.local`**
3. **Run enrichment** to add ratings to imported charities
4. **Optionally**: Import more charities from ProPublica
5. **Move to Phase 3**: Comparison tools, saved searches, etc.

## Caching Strategy

- **TTL**: 30 days for all rating data
- **Automatic**: Ratings cached on first fetch
- **Cleanup**: Run `SELECT cleanup_expired_rating_cache();` periodically
- **Cost Optimization**: Prevents redundant API calls

## Rate Limiting

Built-in delays to respect API limits:
- ProPublica: 100ms between requests
- Charity Navigator: 200ms between requests
- Candid: 200ms between requests

## Troubleshooting

**Q: "No charities showing up"**
- Run the import script first
- Check browser console for errors
- Verify database has charities: `SELECT COUNT(*) FROM charities;`

**Q: "Ratings not appearing"**
- Verify API keys are in `.env.local`
- Restart dev server after adding keys
- Check API logs for errors
- Run enrichment endpoint manually

**Q: "API key errors"**
- Double-check key format in `.env.local`
- Ensure keys are approved/active
- Check rate limits haven't been exceeded
