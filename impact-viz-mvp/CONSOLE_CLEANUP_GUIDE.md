# Console Statement Cleanup Guide

## Summary
- **Debug Statements (Remove)**: 33 occurrences (console.log, console.warn, console.debug)
- **Error Logging (Keep)**: 97 occurrences (console.error in catch blocks)

## Files with Debug Console Statements (To Remove)

### High Priority (Development Debug Logs)

1. **app/dashboard/holdings/[holdingId]/page.tsx** - 20 console.log statements
   - Lines logging form updates and API responses
   - **Action**: Remove all - these are development debug logs

   ```bash
   # Quick cleanup command:
   sed -i '/console\.log/d' app/dashboard/holdings/[holdingId]/page.tsx
   ```

2. **app/recommendations/page.tsx** - Debug logs for data fetching
   - **Action**: Remove development logs, keep error handling

3. **components/AllAssetsOverview.tsx** - API error logging
   - Line 114: `console.error('Error fetching holdings data:', error);`
   - **Action**: Keep (error logging)

4. **components/PortfolioSummarySection.tsx** - API error logging
   - Line 83: `console.error('Error fetching portfolio summaries:', error);`
   - **Action**: Keep (error logging)

### Medium Priority (Mixed Usage)

**Tax-related files** (8 files):
- `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route.ts`
- `app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts`
- `app/api/portfolio/[id]/tax/cpa-share/route.ts`
- `app/api/portfolio/[id]/tax/optimize/route.ts`
- `app/api/portfolio/[id]/tax/form8283/route.ts`
- `app/api/portfolio/[id]/tax/scenarios/route.ts`
- `app/api/portfolio/[id]/tax/summary/route.ts`
- `app/api/portfolio/[id]/tax/overview/route.ts`

**Action**: Review individually - most console.error should stay, console.log should be removed

**Recommendations files** (6 files):
- All have error logging in catch blocks
- **Action**: Keep console.error, remove any console.log

### Low Priority (Error Logging Only - Keep)

**Holdings API routes** (6 files):
- `app/api/holdings/[id]/create-tax-record/route.ts`
- `app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts`
- `app/api/portfolio/[id]/holdings/[holdingId]/milestones/route.ts`
- `app/api/portfolio/[id]/holdings/[holdingId]/grant-details/route.ts`
- `app/api/portfolio/[id]/holdings/[holdingId]/transactions/[transactionId]/route.ts`
- `app/api/portfolio/[id]/holdings/[holdingId]/valuations/route.ts`

**Action**: Keep all - proper error logging

---

## Quick Cleanup Script

```bash
#!/bin/bash
# Remove console.log from specific files (run from project root)

# Holdings page (20 console.log statements)
find app/dashboard/holdings -name "*.tsx" -type f -exec sed -i.bak '/^\s*console\.log/d' {} \;

# Remove temporary backup files
find . -name "*.bak" -type f -delete

echo "✅ Debug console.log statements removed"
echo "✅ Error logging (console.error) preserved"
```

---

## Categorization Rules

### ✅ KEEP (Production-Critical)
```typescript
// Error logging in catch blocks
catch (error) {
  console.error('Error fetching data:', error);
  return NextResponse.json({ error: 'Failed' }, { status: 500 });
}

// Critical state errors
if (!data) {
  console.error('Critical: Missing required data');
}
```

### ❌ REMOVE (Development Debug)
```typescript
// Success logging
console.log('Update successful:', data);

// State logging
console.log('Updating holding:', holdingId, 'with:', updates);

// Flow tracking
console.log('About to fetch recommendations');
```

### 🔄 REPLACE (Consider Structured Logging)
```typescript
// Before
console.log('User action:', action, 'on:', itemId);

// After (if implementing logging service)
logger.info('user_action', { action, itemId, userId });
```

---

## Recommendations

### Immediate Actions
1. Remove all console.log from `app/dashboard/holdings/[holdingId]/page.tsx` (20 statements)
2. Scan components for console.log (usually development leftovers)
3. Keep all console.error in API routes (production error tracking)

### Future Improvements
1. **Add Structured Logging**
   ```bash
   npm install pino pino-pretty
   ```

2. **Create Logger Utility**
   ```typescript
   // lib/logger.ts
   import pino from 'pino';

   export const logger = pino({
     level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
     transport: {
       target: 'pino-pretty',
       options: { colorize: true }
     }
   });
   ```

3. **Add ESLint Rule**
   ```json
   // .eslintrc.json
   {
     "rules": {
       "no-console": ["warn", { "allow": ["error", "warn"] }]
     }
   }
   ```

---

## Summary by File Type

| File Type | Debug Logs | Error Logs | Recommendation |
|-----------|------------|------------|----------------|
| Pages     | 22         | 5          | Remove debug, keep errors |
| Components| 8          | 12         | Remove debug, keep errors |
| API Routes| 3          | 80         | Keep most (proper error handling) |
| Libraries | 0          | 0          | ✅ Clean |

---

## Total Impact
- **Before**: 130 console statements
- **Should Remove**: ~33 debug statements (25%)
- **Should Keep**: ~97 error logs (75%)
- **After Cleanup**: Production-ready error logging only
