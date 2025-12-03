# IRS API Integration Blueprint

**Date**: November 30, 2025
**Priority**: CRITICAL (HIGH)
**Estimated Effort**: 2-3 hours
**Status**: 🔄 In Progress

---

## Problem Statement

**Current State**: `app/api/external/charity-search/route.ts` returns mock/placeholder data
**Impact**: HIGH - Charity search returns inaccurate data, preventing users from finding real nonprofits
**User Experience**: Users see fictional organizations like "Acme Foundation" instead of real 501(c)(3) nonprofits

---

## Solution Overview

**Selected API**: ProPublica Nonprofit Explorer API
**Why ProPublica?**
- ✅ Free, no API key required
- ✅ Based on IRS Form 990 data (official source)
- ✅ Returns JSON (easy integration)
- ✅ Good documentation
- ✅ Includes financial data (revenue, assets)
- ✅ Regularly updated

**Alternatives Considered**:
1. **IRS Tax Exempt Organization Search** - Complex HTML parsing, no official API
2. **IRS EO BMF File Download** - Requires database setup, better for scale but overkill for MVP
3. **ProPublica API** ✅ SELECTED - Best balance of ease and accuracy

---

## API Specification

### ProPublica Nonprofit Explorer API v2

**Base URL**: `https://projects.propublica.org/nonprofits/api/v2`
**Documentation**: https://projects.propublica.org/nonprofits/api

### Endpoint: Organization Search

```
GET /search.json?q={query}&state={state_code}
```

**Parameters**:
- `q` (required): Search query (organization name)
- `state` (optional): Two-letter state code (e.g., "CA", "NY")

**Response Format**:
```json
{
  "total_results": 3,
  "organizations": [
    {
      "ein": "942862452",
      "strein": "94-2862452",
      "name": "MOZILLA FOUNDATION",
      "sub_name": null,
      "city": "SAN FRANCISCO",
      "state": "CA",
      "ntee_code": "B70",
      "raw_ntee_code": "B70",
      "subseccd": "3",
      "has_subseccd": true,
      "have_filings": true,
      "have_pdfs": true,
      "have_extracts": true,
      "classification_codes": "1000000000",
      "latest_object_id": "202121279349300318",
      "ruling_date": "1998-08-01",
      "revenue_amount": 12345678,
      "asset_amount": 23456789,
      "income_amount": 11111111,
      "filing_frequency": "ANNUAL",
      "pf_filing_frequency": null,
      "tax_period": "201912",
      "asset_cd": 5,
      "income_cd": 5,
      "revenue_cd": 5,
      "ntee_desc": "Education N.E.C.",
      "affiliation": 3,
      "classification": {
        "subsection": "Charitable Organization",
        "foundation": "Organization which receives a substantial part of its support from a governmental unit or the general public",
        "ntee": {
          "major_group": "Education",
          "code": "B70"
        },
        "deductibility": "Contributions are deductible.",
        "asset_code": "Over $50 million",
        "income_code": "Over $50 million",
        "revenue_code": "Over $50 million"
      }
    }
  ],
  "num_pages": 1,
  "cur_page": 0,
  "page_offset": 0
}
```

---

## Data Mapping

### ProPublica → Our SearchResult Type

| Our Field | ProPublica Field | Transformation |
|-----------|-----------------|----------------|
| `name` | `name` | Direct |
| `ein` | `strein` | Format as XX-XXXXXXX |
| `location` | `city`, `state` | `"${city}, ${state}"` |
| `website` | N/A | Not provided by API (leave null) |
| `sector` | `ntee_desc` | Use NTEE description |
| `mission` | N/A | Not provided (leave null) |

**Additional Data Available** (for future use):
- `revenue_amount`: Annual revenue
- `asset_amount`: Total assets
- `ntee_code`: NTEE classification code
- `ruling_date`: IRS determination date
- `classification`: Detailed tax-exempt classification

---

## Implementation Plan

### Step 1: Update Route Handler
**File**: `app/api/external/charity-search/route.ts`

**Changes**:
1. Remove mock data
2. Add ProPublica API call
3. Map response to our SearchResult format
4. Add error handling for API failures
5. Add caching (1 hour revalidation)
6. Support optional state filter

### Step 2: Response Transformation
```typescript
// Transform ProPublica org to our format
function transformOrganization(org: any): SearchResult {
  return {
    name: org.name,
    ein: org.strein || org.ein, // Use formatted or raw EIN
    location: [org.city, org.state].filter(Boolean).join(', '),
    sector: org.ntee_desc || undefined,
    mission: undefined, // Not provided by ProPublica
    website: undefined, // Not provided by ProPublica
  };
}
```

### Step 3: Error Handling
- Network errors → Return 500 with friendly message
- Empty results → Return empty array (not an error)
- Invalid query → Return 400
- API rate limiting → Log and return cached/empty results

### Step 4: Caching Strategy
- Cache successful responses for 1 hour (IRS data doesn't change frequently)
- No cache on errors
- Use Next.js `fetch` with `revalidate` option

---

## Testing Plan

### Manual Testing Scenarios

1. **Basic Search**
   - Query: "mozilla"
   - Expected: Returns Mozilla Foundation with EIN 94-2862452

2. **Common Name Search**
   - Query: "red cross"
   - Expected: Returns multiple Red Cross chapters

3. **Location-Specific**
   - Query: "habitat for humanity"
   - Expected: Returns multiple affiliates across states

4. **No Results**
   - Query: "xyzfakecharity12345"
   - Expected: Empty results array, no error

5. **Short Query**
   - Query: "ab" (< 3 chars)
   - Expected: 400 error with validation message

6. **Special Characters**
   - Query: "st. mary's"
   - Expected: Handles apostrophes and periods correctly

### Validation Checks
- [ ] EIN format is correct (XX-XXXXXXX)
- [ ] Location combines city and state properly
- [ ] Empty/null fields are handled gracefully
- [ ] Response time < 2 seconds
- [ ] Error states show user-friendly messages

---

## Code Implementation

### Before (Mock Data)
```typescript
const mockResults = [
  {
    name: `${query} Foundation`,
    ein: '12-3456789',
    location: 'San Francisco, CA',
    mission: 'Dedicated to advancing social justice...',
  },
];

return NextResponse.json({
  results: mockResults,
  source: 'mock',
});
```

### After (ProPublica API)
```typescript
// Fetch from ProPublica API
const params = new URLSearchParams({ q: query });
if (state) params.set('state', state);

const response = await fetch(
  `https://projects.propublica.org/nonprofits/api/v2/search.json?${params}`,
  { next: { revalidate: 3600 } } // Cache for 1 hour
);

if (!response.ok) {
  throw new Error(`ProPublica API error: ${response.status}`);
}

const data = await response.json();

// Transform results
const results = (data.organizations || []).map((org: any) => ({
  name: org.name,
  ein: org.strein || formatEIN(org.ein),
  location: [org.city, org.state].filter(Boolean).join(', '),
  sector: org.ntee_desc || undefined,
  mission: undefined,
  website: undefined,
}));

return NextResponse.json({
  results,
  source: 'propublica',
  total: data.total_results,
});
```

---

## Rollout Strategy

### Phase 1: Implementation (This Session)
1. ✅ Read current implementation
2. ✅ Create blueprint
3. ⏳ Implement ProPublica integration
4. ⏳ Test with real searches
5. ⏳ Update documentation

### Phase 2: Monitoring (Next Session)
1. Monitor API response times
2. Track search success rates
3. Identify common queries
4. Consider adding analytics

### Phase 3: Enhancements (Future)
1. Add state filter to UI
2. Display revenue/assets in results
3. Add "View on ProPublica" link
4. Cache popular searches client-side
5. Add search history/suggestions

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API rate limiting | Low | Medium | Cache aggressively, add fallback |
| API downtime | Low | High | Graceful degradation, show cached results |
| Data quality issues | Medium | Low | Validate and sanitize all fields |
| Breaking API changes | Low | High | Version API endpoint, monitor errors |

---

## Success Metrics

**Before**:
- ❌ Returns mock data
- ❌ No real nonprofit information
- ❌ Users cannot find actual organizations

**After**:
- ✅ Returns real IRS nonprofit data
- ✅ Accurate EIN, location, sector
- ✅ Users can search 1.8M+ registered nonprofits
- ✅ Data refreshes from IRS Form 990s

---

## Dependencies

- None! ProPublica API is free and requires no authentication
- Uses standard `fetch` API (built into Next.js)
- No new packages needed

---

## Rollback Plan

If issues arise:
1. Revert to mock data temporarily
2. Add feature flag to toggle between mock/real data
3. Keep mock data as fallback for API failures

---

## Documentation Updates

Files to update after implementation:
- [x] `IRS_API_INTEGRATION_BLUEPRINT.md` (this file)
- [ ] `TODO_IMPLEMENTATION_PLAN.md` - Mark as completed
- [ ] `CLEANUP_COMPLETE_SUMMARY.md` - Add to completed features
- [ ] Add inline comments explaining ProPublica API usage

---

## Next Steps

1. **Implement the integration** (30-45 min)
2. **Test with real searches** (15-20 min)
3. **Verify error handling** (10-15 min)
4. **Update documentation** (10 min)
5. **Deploy and monitor** (ongoing)

---

## Questions & Answers

**Q: Why not use the official IRS API?**
A: The IRS doesn't provide a modern REST API. They offer bulk file downloads and a web search tool, but ProPublica has already parsed and indexed this data into an easy-to-use API.

**Q: Is ProPublica data up to date?**
A: Yes, they update their database regularly from IRS Form 990 filings. It's the same source data, just more accessible.

**Q: What if ProPublica shuts down their API?**
A: We can switch to the IRS EO BMF bulk file download and host the data ourselves. The ProPublica API is just a convenience layer.

**Q: Can we cache searches?**
A: Yes, we're using 1-hour cache via Next.js `revalidate`. Nonprofit data doesn't change frequently.

**Q: What about international nonprofits?**
A: ProPublica only covers U.S. IRS-registered 501(c)(3) organizations. For international, we'd need different sources (future enhancement).

---

## Ready to Implement?

✅ Blueprint complete
✅ API selected and documented
✅ Data mapping defined
✅ Error handling planned
✅ Testing scenarios outlined

**Status**: Ready for implementation! 🚀
