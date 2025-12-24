# Widget Data Debugging Guide

## Quick Diagnostics

### Step 1: Check if metric_facts has data

Run this in Supabase SQL Editor:

```sql
-- Check if your portfolio has any metric data
SELECT
  h.portfolio_id,
  h.holding_name,
  mf.metric_code,
  COUNT(*) as data_points,
  MIN(mf.period_end) as earliest_date,
  MAX(mf.period_end) as latest_date,
  MAX(mf.value) as latest_value
FROM metric_facts mf
JOIN holdings h ON mf.holding_id = h.id
WHERE h.portfolio_id = 'YOUR_PORTFOLIO_ID_HERE'  -- Replace with your actual portfolio ID
GROUP BY h.portfolio_id, h.holding_name, mf.metric_code
ORDER BY h.holding_name, mf.metric_code;
```

**Expected Result:** You should see rows with your holdings and metric codes.

**If empty:** Your portfolio has no metric_facts data. You need to:
- Import data via the admin upload feature
- Manually create metric data
- Run demo data scripts

---

### Step 2: Check v_portfolio_kpi_series view

```sql
-- Check if the view returns data for your portfolio
SELECT *
FROM v_portfolio_kpi_series
WHERE portfolio_id = 'YOUR_PORTFOLIO_ID_HERE'  -- Replace with your actual portfolio ID
ORDER BY metric_code, period_end
LIMIT 50;
```

**Expected Result:** Rows with portfolio_id, metric_code, period_end, value, etc.

**If empty:** The view is not returning data. Check:
- Are holdings properly linked? (holding_id in metric_facts must match holdings.id)
- Does v_portfolio_kpi_series exist? Run: `\dv v_portfolio_kpi_series`

---

### Step 3: Check kpi_definitions

```sql
-- Check if you have KPI definitions
SELECT
  id,
  portfolio_id,
  display_name,
  metric_code,
  target_value
FROM kpi_definitions
WHERE portfolio_id = 'YOUR_PORTFOLIO_ID_HERE'  -- Replace with your actual portfolio ID
ORDER BY order_index;
```

**Expected Result:** At least one KPI definition row.

**If empty:** You need to create KPI definitions:
- Go to dashboard → KPIs section
- Click "Add KPI"
- Set metric_code to match your metric_facts data (e.g., "JOBS_CREATED")

---

### Step 4: Test API endpoint directly

Open your browser developer tools (F12), go to Console tab, and run:

```javascript
// Replace with your actual portfolio ID
const portfolioId = 'YOUR_PORTFOLIO_ID_HERE';

// Replace with a metric code you know exists in your data
const metricCode = 'JOBS_CREATED';

// Test the API
fetch(`/api/portfolio/${portfolioId}/kpi-series?metric=${metricCode}`)
  .then(r => r.json())
  .then(data => {
    console.log('API Response:', data);
    if (data.series && data.series.length > 0) {
      console.log('✅ SUCCESS: Found', data.series.length, 'data points');
      console.log('Latest value:', data.series[data.series.length - 1]);
    } else {
      console.log('❌ EMPTY: No series data returned');
    }
  })
  .catch(err => console.error('❌ ERROR:', err));
```

**Expected Result:**
```json
{
  "series": [
    {"date": "2024-01-01", "value": 100},
    {"date": "2024-02-01", "value": 150}
  ],
  "display_name": "Jobs Created"
}
```

**If error or empty series:** Note the error message for further debugging.

---

### Step 5: Check widget configuration

In the browser console, check what widgets are configured:

```javascript
const portfolioId = 'YOUR_PORTFOLIO_ID_HERE';

fetch(`/api/portfolio/${portfolioId}/widgets`)
  .then(r => r.json())
  .then(data => {
    console.log('Configured Widgets:', data.data);
    data.data.forEach(w => {
      console.log(`Widget: ${w.title || w.type}`);
      console.log('  Type:', w.type);
      console.log('  Config:', w.config);
      if (w.config?.metric_code) {
        console.log('  Metric:', w.config.metric_code);
      }
      if (w.config?.rings) {
        console.log('  Rings:', w.config.rings.map(r => r.metric_code));
      }
    });
  });
```

**Check:** Do the metric_codes in your widget configs match the metric_codes in your database?

---

## Common Issues & Solutions

### Issue 1: No metric_facts data

**Symptom:** Step 1 returns empty results

**Solution:**
1. Import data via Admin > Upload
2. Or create demo data:
   ```sql
   -- Create sample metric data
   INSERT INTO metric_facts (holding_id, metric_code, period_end, value, unit)
   SELECT
     h.id,
     'JOBS_CREATED',
     CURRENT_DATE,
     100,
     'jobs'
   FROM holdings h
   WHERE h.portfolio_id = 'YOUR_PORTFOLIO_ID_HERE'
   LIMIT 1;
   ```

---

### Issue 2: metric_facts exists but view returns nothing

**Symptom:** Step 1 has data, but Step 2 is empty

**Possible causes:**
- Holdings not properly linked
- View definition issue

**Solution:**
```sql
-- Check if holdings are linked correctly
SELECT
  mf.id,
  mf.holding_id,
  h.id as holding_table_id,
  h.portfolio_id
FROM metric_facts mf
LEFT JOIN holdings h ON mf.holding_id = h.id
WHERE mf.holding_id IS NOT NULL
LIMIT 10;
```

If holding_table_id is NULL, your holding_id foreign keys are broken. Fix:
```sql
-- Find orphaned metric_facts
SELECT holding_id, COUNT(*)
FROM metric_facts
WHERE holding_id NOT IN (SELECT id FROM holdings)
GROUP BY holding_id;

-- Delete orphaned records (or fix holding_id)
DELETE FROM metric_facts
WHERE holding_id NOT IN (SELECT id FROM holdings);
```

---

### Issue 3: No KPI definitions

**Symptom:** Step 3 returns empty, but Steps 1-2 have data

**Impact:**
- Widget dropdowns might be empty (with `has_data=true` filter)
- Widgets may still work if you manually enter metric_code

**Solution:**
```sql
-- Create KPI definitions for your existing metrics
INSERT INTO kpi_definitions (portfolio_id, display_name, metric_code, order_index)
VALUES
  ('YOUR_PORTFOLIO_ID_HERE', 'Jobs Created', 'JOBS_CREATED', 1),
  ('YOUR_PORTFOLIO_ID_HERE', 'CO2 Avoided', 'CO2_AVOIDED_TONS', 2),
  ('YOUR_PORTFOLIO_ID_HERE', 'People Helped', 'BENEFICIARIES_REACHED', 3);
```

---

### Issue 4: Case mismatch despite migration

**Symptom:** API returns empty even though data exists

**Check:**
```sql
-- Compare case in metric_facts vs what widget is querying
SELECT DISTINCT
  metric_code,
  UPPER(metric_code) as upper_version,
  CASE WHEN metric_code = UPPER(metric_code) THEN '✓' ELSE '✗' END as is_uppercase
FROM metric_facts
ORDER BY metric_code;
```

**If not all uppercase:** Re-run the migration:
```sql
UPDATE metric_facts SET metric_code = UPPER(metric_code);
UPDATE kpi_definitions SET metric_code = UPPER(metric_code);
UPDATE metrics SET code = UPPER(code);
```

---

### Issue 5: Widget config has wrong metric_code

**Symptom:** Step 5 shows different metric_codes than Step 1

**Solution:**
1. Delete and recreate the widget with correct metric_code
2. Or manually update widget config:
   ```sql
   -- Find the widget
   SELECT id, type, title, config
   FROM widgets
   WHERE portfolio_id = 'YOUR_PORTFOLIO_ID_HERE';

   -- Update config (careful with JSON structure!)
   UPDATE widgets
   SET config = jsonb_set(config, '{metric_code}', '"JOBS_CREATED"')
   WHERE id = 'WIDGET_ID_HERE';
   ```

---

## Still Not Working?

If you've checked all steps above and widgets still don't show data:

1. **Check browser console for errors:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for red errors related to widgets or API calls
   - Share the error messages

2. **Check Network tab:**
   - Open DevTools (F12)
   - Go to Network tab
   - Refresh the page
   - Look for `/api/portfolio/.../kpi-series` requests
   - Click on them to see:
     - Status code (should be 200)
     - Response body (should have series array)
   - Share screenshots if needed

3. **Enable verbose logging:**
   I can add console.log statements to the widget components to see exactly what's being fetched.

Let me know what you find from these diagnostic steps!
