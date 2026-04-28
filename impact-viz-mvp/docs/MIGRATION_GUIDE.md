# Migration Guide: Switching to Benevolence

## Overview

Moving from Blackbaud to Benevolence is straightforward with our AI-powered Migration Copilot.
This guide walks you through the complete process — from exporting your legacy data to going live
in Benevolence with a clean, validated dataset.

**Typical migration time:** 2–4 hours for most organizations.

---

## Before You Start

- [ ] Export your data from Blackbaud (instructions below)
- [ ] Gather a list of staff who need access to Benevolence
- [ ] Note your current annual spend on legacy software (you'll want it for the ROI report)
- [ ] Confirm which portfolios/funds are in scope for this migration

---

## Step 1: Export from Blackbaud RE NXT

### Constituents (for Users / Donors)

1. Navigate to **Constituents** → **Query** → **New Query**
2. Select output fields: First Name, Last Name, Email Address, Constituent ID
3. Export format: **CSV**
4. Save file as `Constituents.csv`

### Funds (for Investees / Organizations)

1. Navigate to **Funds** → **Fund List**
2. Select all active funds
3. Include: Fund Name, Fund EIN/Tax ID, Fund Type, Fund Description
4. Export as `Funds.csv`

### Gifts (for Contributions)

1. Navigate to **Gifts** → **Gift Query**
2. Date range: Select full history or specify range
3. Include: Constituent ID, Gift Date, Gift Amount, Gift Type, Fund Name, Fund EIN
4. Export as `Gifts.csv`

### Custom Fields

1. Navigate to **Administration** → **Custom Fields**
2. Export any custom field definitions as `CustomFields.csv`

> **Tip:** For large organizations (100k+ gifts), export in annual batches to stay under the 50MB file limit.

---

## Step 2: Upload to Benevolence

1. Go to **Admin** → **Data Imports** → **New Import**
2. Select your source system: **Blackbaud RE NXT**
3. Upload each CSV file using the file uploader
4. Click **Start Import** to begin extraction

The system will parse your files and load all rows into a staging area for review.

---

## Step 3: Review AI Mapping Suggestions

After extraction, the AI will automatically suggest field mappings:

1. Open the **Field Mapping** tab on your import job
2. Review each suggested mapping — green badges indicate high confidence
3. For low-confidence mappings (yellow/red badge), select the correct target field from the dropdown
4. Add any additional mapping rules using the **Add Rule** button
5. Click **Save Mapping** when complete

**Common mappings the AI handles automatically:**
- `GiftDate` → `contribution_date`
- `GiftAmount` → `amount_usd` (strips currency symbols)
- `FundEIN` → `recipient_ein` (normalizes to XX-XXXXXXX format)
- `GiftType` → `gift_type` (maps PayPal, Venmo, DAF to standard values)

---

## Step 4: Validate Your Data

1. Click **Run Validation** on the import detail page
2. Wait for the validation phase to complete (progress shown in real time)
3. Review the validation summary:
   - **Valid rows**: Ready to load
   - **Warning rows**: Minor issues, can proceed
   - **Error rows**: Must be fixed before loading

---

## Step 5: Review Errors and Apply AI Fixes

For rows with errors:

1. Open the **Validation Errors** tab
2. Filter by entity type (Contributions, Investees, etc.) and severity
3. Use the **Migration Copilot** (AI chat panel, bottom-right) to ask questions like:
   - "Why did these rows fail?"
   - "How do I fix EIN formatting errors?"
4. Click **Apply N auto-fixable fixes** to let the AI bulk-fix common patterns:
   - Malformed EINs → normalized to `XX-XXXXXXX`
   - Non-standard date formats → ISO `YYYY-MM-DD`
   - Currency-formatted amounts → numeric values
   - Non-standard gift types (PayPal, DAF, Venmo) → standard values
5. For remaining errors, fix in your source CSV and re-upload, or manually correct in the error browser

---

## Step 6: Load Your Data

1. Click **Load to Benevolence** on the import detail page
2. The system loads data in dependency order:
   - Organizations (Investees) → Funds (Holdings) → Staff (Users) → Gifts (Contributions) → Metrics
3. Monitor progress in the real-time progress panel
4. Dry-run mode available: toggle **Dry Run** to preview without writing to production

---

## Step 7: Review Reconciliation Report

After loading, a reconciliation report is automatically generated:

1. Open the **Reconciliation** section
2. Review key metrics:
   - **Record match rate**: % of source records loaded
   - **Financial variance**: Difference between source total and loaded total (target: <1%)
   - **Missing records**: Any rows that couldn't be matched
3. If variance is >1%, click **AI Analyze** for an explanation
4. If issues are found, use **Rollback** to undo and re-import after fixing

---

## Step 8: Generate Migration Report

1. Open the **Migration Report** tab
2. Click **Generate Migration Report**
3. The AI will write a professional summary report (takes ~15 seconds)
4. Options:
   - **Download .md**: Save as Markdown for editing
   - **Print**: Print-optimized layout for board presentations

---

## Step 9: Go Live

- [ ] Review reconciliation report — variance <1%
- [ ] Click **Commit Import** to finalize all records
- [ ] Invite staff users to Benevolence
- [ ] Archive legacy system credentials
- [ ] Schedule a training session for your team

---

## Common Issues and Solutions

### EIN Formatting Problems

**Symptom:** `recipient_ein: EIN format invalid (must be XX-XXXXXXX)` errors

**Fix:** Use the **Apply auto-fixable fixes** button, or ask the Copilot "How do I fix EIN errors?"
The system will strip non-numeric characters and reformat to `XX-XXXXXXX`.

### Date Format Mismatches

**Symptom:** `contribution_date: Invalid date format` errors

**Fix:** The system recognizes MM/DD/YYYY, MM-DD-YYYY, YYYYMMDD, Unix timestamps, and Month Name formats.
Use the bulk-fix (`parse_date`) to normalize all dates automatically.

### Missing Required Fields

**Symptom:** `recipient_name: Recipient name is required` errors

**Fix:** Check your export query included all required fields. Missing columns will show as blank.
You can add a default value mapping in the Field Mapping configuration.

### Duplicate Detection

The system automatically detects duplicates during the load phase:
- Investees: matched by EIN + country, or display name
- Holdings: matched by portfolio + name
- Users: matched by email address

Duplicates are **updated**, not inserted twice — no data loss.

### File Too Large

**Symptom:** "File too large: X.XMB exceeds the 50MB limit"

**Fix:** Split your CSV into smaller files (e.g., by year). Run multiple imports and they will all
write to the same production records.

---

## Support

Contact your Benevolence implementation specialist:

- **Email:** migration@benevolence.app
- **Slack:** #migration-support in your organization's Slack
- **Documentation:** This guide + in-app Migration Copilot AI chat

For technical issues, use the **Migration Copilot** in the bottom-right of any import job page.
It has full context about your specific import and can answer questions in real time.
