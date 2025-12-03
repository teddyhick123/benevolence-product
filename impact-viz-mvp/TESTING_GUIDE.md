# Testing Guide - New Features

## How to Access

Navigate to: **`/recommendations`**

The page will automatically detect your role:
- **Portfolio Members** → See RecommendationsView with all new features
- **Portfolio Owners/Admins** → See RecommendationsManager (curator view)

---

## Feature #7: Direct Action Flows

### Location
On each recommendation card, look for the **"Take Action"** section (non-managers only)

### What to Test

**1. Make a Donation**
- Click "Make a Donation" button
- Modal opens with pre-filled organization details
- Enter donation amount
- Select donation date
- Choose type (Cash/Stock/Other)
- Optionally add custodian (e.g., "Fidelity DAF")
- Click "Create Donation"
- ✅ Creates holding record in portfolio
- ✅ Links back to recommendation via metadata

**2. Request Meeting**
- Click "Request Meeting" button
- Email client opens with pre-written template
- Template includes:
  - Organization name in subject
  - Professional greeting with contact name
  - Meeting request with areas of interest
  - Snippet from recommendation description
- Edit and send email directly

**3. Create Grant**
- Click "Create Grant" button
- Modal opens with grant setup
- Choose grant source (Foundation Grant or DAF Grant)
- Enter grant amount
- Select grant type (General Operating, Project, etc.)
- Set grant period start/end dates
- Choose reporting frequency
- Add deliverables/expectations
- Toggle renewal eligibility
- Click "Create Grant"
- ✅ Creates holding + grant details records
- ✅ Ready for milestone tracking

---

## Feature #13: Comparison View

### How to Access
Click **"Compare Organizations"** button in page header (appears when 2+ recommendations exist)

### What to Test

**1. Enter Comparison Mode**
- Button changes to "Exit Comparison Mode"
- Checkboxes appear on all recommendation cards
- Page stays in normal view with selection enabled

**2. Select Organizations**
- Click checkbox on any recommendation
- Card highlights with blue border and background
- Floating toolbar appears at bottom of screen
- Counter shows: "X organizations selected"
- Select 2-4 organizations (maximum 4)
- Further checkboxes disable when max reached
- Click "Clear Selection" to reset

**3. View Comparison**
- After selecting 2+ orgs, click "Compare Organizations" on toolbar
- Full-screen comparison opens
- Scroll horizontally to see all organizations
- Scroll vertically to see all criteria sections:
  - Basic Information
  - Charity Ratings & Financial Health
  - Suggested Investment
  - Impact Focus Areas (checkmark matrix)
  - Mission & Description
  - Contact Information
  - Recommendation Status
- First column stays fixed when scrolling horizontally
- Header stays fixed when scrolling vertically
- Click links (website, email) to test

**4. Export Comparison**
- **CSV Export:**
  - Select "Export as CSV" from dropdown
  - Click "Export" button
  - File downloads: `recommendations-comparison-YYYY-MM-DD.csv`
  - Open in Excel/Google Sheets
  - Verify all data is present

- **PDF Export:**
  - Select "Export as PDF" from dropdown
  - Click "Export" button
  - Browser print dialog opens
  - Choose "Save as PDF" as destination
  - Verify export buttons are hidden in preview
  - Save PDF

**5. Exit Comparison**
- Click "X" button in comparison view header
- Returns to recommendations page
- Comparison mode exits automatically
- All selections cleared

---

## Feature #4: Charity Ratings (Also new!)

### Location
On each recommendation card with an EIN

### What to Test

**1. View Ratings**
- Look for recommendation with EIN
- Click "Charity Ratings" button (green with shield icon)
- Expandable section shows:
  - Overall health score (0-100)
  - Financial health grade (A-F)
  - Program expense ratio %
  - GuideStar seal badge
- Click "View detailed ratings" for full breakdown

**2. Detailed Ratings**
- Charity Navigator section:
  - Overall, Financial, Accountability scores
  - Encompass rating badge
  - Link to full profile
- GuideStar/Candid section:
  - Transparency seal (Platinum/Gold/Silver/Bronze)
  - Expense ratio breakdown
  - Annual revenue
  - IRS compliance status
- Data freshness indicator
- "Refresh data" button

**3. Mock Data Mode**
- If API keys not configured, shows mock data
- Warning message: "Using mock data - configure API keys..."
- Data is realistic and deterministic (same EIN = same ratings)

---

## Expected Behaviors

### Direct Actions
✅ Donation modal pre-fills org details
✅ Grant modal includes renewal tracking
✅ Meeting email opens in default client
✅ All actions link back to recommendation
✅ Only visible to non-managers

### Comparison View
✅ Maximum 4 organizations can be selected
✅ "Compare" button disabled until 2+ selected
✅ Selected cards have blue highlight
✅ Toolbar shows live selection count
✅ CSV download works in all browsers
✅ PDF uses browser's print dialog
✅ Table scrolls horizontally on narrow screens

### Charity Ratings
✅ Only shows for recommendations with EIN
✅ Data caches for 30 days
✅ Auto-refresh when data is stale
✅ Color-coded scores (green=good, red=bad)
✅ Links to full charity profiles
✅ Graceful fallback when data unavailable

---

## Test Data Setup

### If You Need Sample Recommendations

1. **As Portfolio Owner/Admin:**
   - Visit `/recommendations`
   - Click "Add Recommendation"
   - Fill in organization details:
     - Name: Any nonprofit name
     - EIN: Format `XX-XXXXXXX` (e.g., `12-3456789`)
     - Sector: Choose any
     - Location: Any city/state
     - Add impact focus areas
     - Set investment range
     - Add contact info (email/phone)
   - Save recommendation

2. **Add Multiple Recommendations** (for comparison testing):
   - Repeat above for 3-4 different organizations
   - Vary sectors and impact areas
   - Use different EINs

3. **As Portfolio Member:**
   - Log out and log in as regular member
   - Visit `/recommendations`
   - See all new features enabled

---

## Troubleshooting

**Problem:** "Compare Organizations" button not showing
- **Solution:** Need at least 2 recommendations. Add more via manager view.

**Problem:** Direct Action buttons not showing
- **Solution:** You're logged in as manager/owner. Log in as regular member.

**Problem:** Charity ratings showing "No EIN provided"
- **Solution:** Edit recommendation to add EIN in format `XX-XXXXXXX`

**Problem:** Donation/Grant creation fails
- **Solution:** Check console for errors. Verify portfolio permissions.

**Problem:** Email client doesn't open on "Request Meeting"
- **Solution:** Browser may block mailto links. Check browser settings.

**Problem:** CSV export not downloading
- **Solution:** Check browser download settings. Try different browser.

---

## Browser Compatibility

**Tested & Supported:**
- Chrome/Edge (Chromium) ✅
- Firefox ✅
- Safari ✅

**Features:**
- CSV download works in all modern browsers
- PDF export uses native browser print
- Mailto links require configured email client
- Comparison table requires horizontal scroll on mobile

---

## Quick Test Checklist

**As Portfolio Member:**
- [ ] View recommendations list
- [ ] Click "Charity Ratings" on a recommendation with EIN
- [ ] Verify ratings display correctly
- [ ] Click "Make a Donation" and fill out form
- [ ] Click "Request Meeting" and verify email opens
- [ ] Click "Create Grant" and fill out form
- [ ] Click "Compare Organizations" to enter comparison mode
- [ ] Select 2-3 organizations with checkboxes
- [ ] Click "Compare Organizations" on toolbar
- [ ] View full comparison table
- [ ] Export comparison as CSV
- [ ] Export comparison as PDF
- [ ] Close comparison and exit mode

**As Portfolio Owner:**
- [ ] View manager dashboard
- [ ] Add new recommendation with EIN
- [ ] Edit existing recommendation
- [ ] Archive a recommendation
- [ ] View stats (total, favorites)

---

## Feature Availability

| Feature | Portfolio Members | Portfolio Owners |
|---------|------------------|------------------|
| View Recommendations | ✅ | ✅ |
| Charity Ratings | ✅ | ✅ |
| Comparison View | ✅ | ✅ |
| Direct Actions | ✅ | ❌ |
| Add/Edit Recommendations | ❌ | ✅ |
| Favorites/Comments/Status | ✅ | View Only |

---

**Happy Testing! 🎉**

If you encounter any issues, check the browser console for error messages and refer to the individual feature README files for detailed troubleshooting.
