# Widget System Review & Fixes

## Review Date
2025-11-29

## Issues Identified

### 1. ✅ FIXED: PeopleGridConfig Missing Metric Dropdown
**Problem**: Unlike KpiTrendConfig and RadialProgressConfig, the PeopleGridConfig component didn't fetch available metrics from the portfolio, forcing users to manually type metric codes.

**Fix Applied**:
- Added `portfolioId` prop to PeopleGridConfig
- Added `availableMetrics` state and useEffect to fetch from `/api/portfolio/[id]/kpis`
- Updated form to show dropdown when metrics are available, fallback to text input when fetch fails

**Files Changed**:
- `components/vis/widget-configs/PeopleGridConfig.tsx`

### 2. ✅ VERIFIED: Widget Registry Complete
**Status**: All widget types defined in CreateWidgetModal are properly registered in VisualCarousel REGISTRY.

**Widget Types (12 total)**:
1. `kpi_trend` - KPI Trend Line
2. `radial_progress` - Radial Progress (1-3 KPI rings)
3. `people_grid_auto` - People Helped visualization
4. `small_multiples` - Small Multiples sparklines
5. `performance_heat_map` - Performance Heat Map
6. `holdings_comparison_table` - Comparison Table
7. `impact_timeline` - Impact Timeline
8. `waterfall_chart` - Waterfall Chart
9. `impact_bubble_chart` - Bubble Chart
10. `holdings_pie_auto` - Holdings Breakdown (auto-fetch)
11. `emissions_bar` - Emissions Comparison
12. `d3_json` - Custom Visualization

### 3. ✅ VERIFIED: All Widget Components Exist
All widget implementations are present in `components/vis/`:
- KpiTrend.tsx
- RadialProgress.tsx
- PeopleGridWidget.tsx
- SmallMultiples.tsx
- PerformanceHeatMap.tsx
- HoldingsComparisonTable.tsx
- ImpactTimeline.tsx
- WaterfallChart.tsx
- ImpactBubbleChart.tsx
- HoldingsPieWidget.tsx
- SectorEmissionsBar.tsx
- D3JsonWidget.tsx

### 4. ✅ VERIFIED: Widget Config Components
All necessary config components exist in `components/vis/widget-configs/`:
- KpiTrendConfig.tsx (fetches metrics ✓)
- RadialProgressConfig.tsx (fetches metrics ✓)
- PeopleGridConfig.tsx (now fetches metrics ✓)
- HoldingsPieConfig.tsx
- SmallMultiplesConfig.tsx
- PerformanceHeatMapConfig.tsx
- HoldingsComparisonTableConfig.tsx
- ImpactTimelineConfig.tsx
- WaterfallChartConfig.tsx
- ImpactBubbleChartConfig.tsx

### 5. ✅ VERIFIED: KPI API Endpoints Working
**Endpoint**: `/api/portfolio/[id]/kpis`
**Returns**:
```json
{
  "data": [
    {
      "id": "string",
      "portfolio_id": "string",
      "display_name": "string",
      "metric_code": "string",
      "target_value": number,
      "target_date": "string",
      "calculation": "string",
      "order_index": number,
      "latest": {
        "value": number,
        "unit": "string",
        "period_start": "string",
        "period_end": "string"
      }
    }
  ],
  "count": number,
  "nextOffset": number | null
}
```

**Endpoint**: `/api/portfolio/[id]/kpi-series`
**Query Params**: `metric` (required), `kpiId` (alternative), `window` (optional)
**Returns**:
```json
{
  "series": [
    { "date": "string", "value": number }
  ],
  "display_name": "string"
}
```

Both endpoints working correctly and returning expected data structures.

## System Architecture

### Widget Configuration Flow
1. User clicks "Edit widgets" → Opens EditWidgetsModal
2. User clicks "Add Widget" → Opens CreateWidgetModal
3. User selects widget type → Shows WidgetConfigForm with appropriate config component
4. Config component:
   - Fetches available metrics from `/api/portfolio/[id]/kpis`
   - Displays form with dropdowns (if metrics loaded) or text inputs (fallback)
   - On save, POSTs to `/api/portfolio/[id]/widgets` with type, title, config
5. Widget appears in VisualCarousel

### Widget Rendering Flow
1. WidgetsSection fetches widgets from `/api/portfolio/[id]/widgets`
2. Passes items to VisualCarousel
3. VisualCarousel looks up widget type in REGISTRY
4. Renders component with portfolioId, title, config props
5. Widget component:
   - If needs data: fetches from `/api/portfolio/[id]/kpi-series?metric=...`
   - Renders D3/React visualization
   - Handles loading/error states

## Potential Issues Users Might See

### Issue: "Widget shows outdated KPIs"
**Cause**: Browser cache or stale data
**Solution**: All widget configs now use `cache: 'no-store'` to prevent stale data
**User Action**: Refresh page or re-edit widget to see latest KPIs

### Issue: "Some widgets don't show up"
**Possible Causes**:
1. Widget type not in REGISTRY → All types verified ✓
2. Widget component throwing error → Check browser console
3. Missing props → All components properly typed
4. API endpoint failing → Check network tab

**Debug Steps**:
1. Open browser DevTools Console
2. Look for errors related to widget name
3. Check Network tab for failed API calls
4. Verify widget config has correct structure

### Issue: "Can't configure widget - no metrics shown"
**Cause**: User hasn't created any KPI definitions yet
**Solution**:
1. Go to KPIs section
2. Add KPI definitions with metric codes
3. Then widgets will have metrics available in dropdown

## Testing Checklist

- [x] PeopleGridConfig shows metric dropdown when KPIs exist
- [x] All 12 widget types are in REGISTRY
- [x] All widget components exist and are imported
- [x] All config components exist
- [x] KPI APIs return correct data structure
- [ ] Test creating each widget type
- [ ] Test editing existing widgets
- [ ] Test widgets render without errors
- [ ] Test widgets handle missing data gracefully
- [ ] Test widgets handle API failures

## Recommendations

1. **Error Handling**: Add better error messages in widget configs when API fails
2. **Loading States**: Ensure all widgets show loading spinners during data fetch
3. **Empty States**: Ensure all widgets show helpful messages when no data
4. **Validation**: Add validation in config forms for required fields
5. **Documentation**: Add tooltips/help text for each widget type

## Next Steps

1. User should test widget creation/editing
2. Check browser console for any errors
3. Verify all widgets render correctly
4. Report specific widget types that aren't working
5. Provide screenshots of any error messages
