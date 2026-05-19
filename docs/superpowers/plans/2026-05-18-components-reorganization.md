# Components Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 40 loose files from the root of `components/` into logical domain and shared-utility subfolders, updating all import paths so the build is unchanged.

**Architecture:** Pure file moves — no logic changes, no index re-exports, no compatibility shims. `git mv` preserves history on each file. Each batch moves related files together, updates their import paths with `sed`, and verifies with `tsc --noEmit` before committing. Tasks are ordered so shared primitives (Task 1) move before the dashboard/domain components that import them (Tasks 2–5), avoiding import churn.

**Tech Stack:** Next.js 15 App Router, TypeScript, macOS `sed` (`-i ''` syntax)

---

## Final structure after all tasks

```
components/
├── ui/            ← NEW: 10 shared primitives
├── dashboard/     ← NEW: 16 dashboard page sections
├── holdings/      ← +7 files (was 11)
├── map/           ← +2 files (was 4)
├── profile/       ← +3 files (was 4)
├── grants/        ← +1 file  (was 15)
├── tax/           ← +1 file  (was 20)
└── (all other existing folders unchanged)
```

---

## Task 1: Create `components/ui/` and move shared primitives

These 10 components are used across many domain folders and pages — they're generic display atoms and layout utilities, not owned by any single feature.

**Files moved:**
- `components/FactRow.tsx` → `components/ui/FactRow.tsx`
- `components/InlineEdit.tsx` → `components/ui/InlineEdit.tsx`
- `components/InlineTextArea.tsx` → `components/ui/InlineTextArea.tsx`
- `components/InlineWidget.tsx` → `components/ui/InlineWidget.tsx`
- `components/LoadingScreen.tsx` → `components/ui/LoadingScreen.tsx`
- `components/MetricItem.tsx` → `components/ui/MetricItem.tsx`
- `components/Reveal.tsx` → `components/ui/Reveal.tsx`
- `components/SectionHeader.tsx` → `components/ui/SectionHeader.tsx`
- `components/SWRProvider.tsx` → `components/ui/SWRProvider.tsx`
- `components/TrefoilLoader.tsx` → `components/ui/TrefoilLoader.tsx`

**Known importers before this move:**

| Component | Imported in |
|---|---|
| `SectionHeader` | `components/HoldingsSection.tsx`, `components/KpiSection.tsx`, `components/MapSection.tsx`, `components/SummarySection.tsx`, `components/grants/GrantsList.tsx`, `components/vis/WidgetsSection.tsx`, `components/vis/HoldingWidgetsSection.tsx` |
| `MetricItem` | `components/GrantSummaryCard.tsx`, `components/InvestmentPerformanceCard.tsx`, `components/PortfolioDonationSummary.tsx`, `components/PortfolioGrantSummary.tsx`, `components/PortfolioInvestmentSummary.tsx` |
| `InlineWidget` | `app/dashboard/letter/page.tsx`, `components/reports/ReportViewer.tsx` |
| `Reveal` | `app/dashboard/page.tsx` |
| `LoadingScreen` | `app/layout.tsx` |
| `SWRProvider` | `app/layout.tsx` |
| `TrefoilLoader` | `components/constructor/ConstructorPanel.tsx` |
| `FactRow` | `app/dashboard/holdings/[holdingId]/page.tsx` |

- [ ] **Step 1: Move the files**

```bash
mkdir -p components/ui
git mv components/FactRow.tsx components/ui/FactRow.tsx
git mv components/InlineEdit.tsx components/ui/InlineEdit.tsx
git mv components/InlineTextArea.tsx components/ui/InlineTextArea.tsx
git mv components/InlineWidget.tsx components/ui/InlineWidget.tsx
git mv components/LoadingScreen.tsx components/ui/LoadingScreen.tsx
git mv components/MetricItem.tsx components/ui/MetricItem.tsx
git mv components/Reveal.tsx components/ui/Reveal.tsx
git mv components/SectionHeader.tsx components/ui/SectionHeader.tsx
git mv components/SWRProvider.tsx components/ui/SWRProvider.tsx
git mv components/TrefoilLoader.tsx components/ui/TrefoilLoader.tsx
```

- [ ] **Step 2: Update all import paths**

```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.claude/worktrees/*" \
  | xargs sed -i '' \
    -e "s|from '@/components/FactRow'|from '@/components/ui/FactRow'|g" \
    -e "s|from \"@/components/FactRow\"|from \"@/components/ui/FactRow\"|g" \
    -e "s|from '@/components/InlineEdit'|from '@/components/ui/InlineEdit'|g" \
    -e "s|from \"@/components/InlineEdit\"|from \"@/components/ui/InlineEdit\"|g" \
    -e "s|from '@/components/InlineTextArea'|from '@/components/ui/InlineTextArea'|g" \
    -e "s|from \"@/components/InlineTextArea\"|from \"@/components/ui/InlineTextArea\"|g" \
    -e "s|from '@/components/InlineWidget'|from '@/components/ui/InlineWidget'|g" \
    -e "s|from \"@/components/InlineWidget\"|from \"@/components/ui/InlineWidget\"|g" \
    -e "s|from '@/components/LoadingScreen'|from '@/components/ui/LoadingScreen'|g" \
    -e "s|from \"@/components/LoadingScreen\"|from \"@/components/ui/LoadingScreen\"|g" \
    -e "s|from '@/components/MetricItem'|from '@/components/ui/MetricItem'|g" \
    -e "s|from \"@/components/MetricItem\"|from \"@/components/ui/MetricItem\"|g" \
    -e "s|from '@/components/Reveal'|from '@/components/ui/Reveal'|g" \
    -e "s|from \"@/components/Reveal\"|from \"@/components/ui/Reveal\"|g" \
    -e "s|from '@/components/SectionHeader'|from '@/components/ui/SectionHeader'|g" \
    -e "s|from \"@/components/SectionHeader\"|from \"@/components/ui/SectionHeader\"|g" \
    -e "s|from '@/components/SWRProvider'|from '@/components/ui/SWRProvider'|g" \
    -e "s|from \"@/components/SWRProvider\"|from \"@/components/ui/SWRProvider\"|g" \
    -e "s|from '@/components/TrefoilLoader'|from '@/components/ui/TrefoilLoader'|g" \
    -e "s|from \"@/components/TrefoilLoader\"|from \"@/components/ui/TrefoilLoader\"|g"
```

- [ ] **Step 3: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS|Cannot find module" | head -20
```

Expected: no output (zero TypeScript errors). If any `Cannot find module '@/components/SectionHeader'` (or similar) appears, find the file and fix the import manually.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(components): move shared UI primitives to components/ui/"
```

---

## Task 2: Create `components/dashboard/` and move dashboard sections

These 16 components compose the main `/dashboard` page and its summary panels. They're not reused across other feature domains — they own the portfolio overview layout.

**Files moved:**
- `components/AIAssistantButton.tsx` → `components/dashboard/AIAssistantButton.tsx`
- `components/AIAssistantPanel.tsx` → `components/dashboard/AIAssistantPanel.tsx`
- `components/AISummaryCard.tsx` → `components/dashboard/AISummaryCard.tsx`
- `components/AllAssetsOverview.tsx` → `components/dashboard/AllAssetsOverview.tsx`
- `components/ConditionalHeader.tsx` → `components/dashboard/ConditionalHeader.tsx`
- `components/DashboardKpiWithFilter.tsx` → `components/dashboard/DashboardKpiWithFilter.tsx`
- `components/EditKpiModal.tsx` → `components/dashboard/EditKpiModal.tsx`
- `components/Header.tsx` → `components/dashboard/Header.tsx`
- `components/KpiCard.tsx` → `components/dashboard/KpiCard.tsx`
- `components/KpiSection.tsx` → `components/dashboard/KpiSection.tsx`
- `components/NewsSection.tsx` → `components/dashboard/NewsSection.tsx`
- `components/PortfolioDonationSummary.tsx` → `components/dashboard/PortfolioDonationSummary.tsx`
- `components/PortfolioGrantSummary.tsx` → `components/dashboard/PortfolioGrantSummary.tsx`
- `components/PortfolioInvestmentSummary.tsx` → `components/dashboard/PortfolioInvestmentSummary.tsx`
- `components/PortfolioSummarySection.tsx` → `components/dashboard/PortfolioSummarySection.tsx`
- `components/SummarySection.tsx` → `components/dashboard/SummarySection.tsx`

**Note on relative imports:** `AIAssistantButton.tsx` imports `AIAssistantPanel` with `'./AIAssistantPanel'`. Since both files move to the same new folder, that relative import stays valid — no update needed for it. The sed pass below updates all absolute `@/components/...` references.

**Known importers before this move:**

| Component | Imported in |
|---|---|
| `AIAssistantButton` | `app/dashboard/page.tsx` |
| `AISummaryCard` | `components/SummarySection.tsx`, `components/AllAssetsOverview.tsx` (both moving here) |
| `DashboardKpiWithFilter` | `app/dashboard/page.tsx` |
| `ConditionalHeader` | `app/layout.tsx` |
| `Header` | `components/ConditionalHeader.tsx` (moving here) |
| `KpiCard` | `components/KpiSection.tsx` (moving here) |
| `KpiSection` | `components/DashboardKpiWithFilter.tsx` (moving here) |
| `EditKpiModal` | `components/KpiSection.tsx` (moving here) |
| `PortfolioSummarySection` | `app/dashboard/page.tsx` |
| `HoldingsSection` | `app/dashboard/page.tsx` *(moves in Task 3)* |
| `MapSection` | `app/dashboard/page.tsx` *(moves in Task 4)* |
| `NewsSection` | `app/dashboard/holdings/[holdingId]/page.tsx` |

- [ ] **Step 1: Move the files**

```bash
mkdir -p components/dashboard
git mv components/AIAssistantButton.tsx components/dashboard/AIAssistantButton.tsx
git mv components/AIAssistantPanel.tsx components/dashboard/AIAssistantPanel.tsx
git mv components/AISummaryCard.tsx components/dashboard/AISummaryCard.tsx
git mv components/AllAssetsOverview.tsx components/dashboard/AllAssetsOverview.tsx
git mv components/ConditionalHeader.tsx components/dashboard/ConditionalHeader.tsx
git mv components/DashboardKpiWithFilter.tsx components/dashboard/DashboardKpiWithFilter.tsx
git mv components/EditKpiModal.tsx components/dashboard/EditKpiModal.tsx
git mv components/Header.tsx components/dashboard/Header.tsx
git mv components/KpiCard.tsx components/dashboard/KpiCard.tsx
git mv components/KpiSection.tsx components/dashboard/KpiSection.tsx
git mv components/NewsSection.tsx components/dashboard/NewsSection.tsx
git mv components/PortfolioDonationSummary.tsx components/dashboard/PortfolioDonationSummary.tsx
git mv components/PortfolioGrantSummary.tsx components/dashboard/PortfolioGrantSummary.tsx
git mv components/PortfolioInvestmentSummary.tsx components/dashboard/PortfolioInvestmentSummary.tsx
git mv components/PortfolioSummarySection.tsx components/dashboard/PortfolioSummarySection.tsx
git mv components/SummarySection.tsx components/dashboard/SummarySection.tsx
```

- [ ] **Step 2: Update all import paths**

```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.claude/worktrees/*" \
  | xargs sed -i '' \
    -e "s|from '@/components/AIAssistantButton'|from '@/components/dashboard/AIAssistantButton'|g" \
    -e "s|from \"@/components/AIAssistantButton\"|from \"@/components/dashboard/AIAssistantButton\"|g" \
    -e "s|from '@/components/AIAssistantPanel'|from '@/components/dashboard/AIAssistantPanel'|g" \
    -e "s|from \"@/components/AIAssistantPanel\"|from \"@/components/dashboard/AIAssistantPanel\"|g" \
    -e "s|from '@/components/AISummaryCard'|from '@/components/dashboard/AISummaryCard'|g" \
    -e "s|from \"@/components/AISummaryCard\"|from \"@/components/dashboard/AISummaryCard\"|g" \
    -e "s|from '@/components/AllAssetsOverview'|from '@/components/dashboard/AllAssetsOverview'|g" \
    -e "s|from \"@/components/AllAssetsOverview\"|from \"@/components/dashboard/AllAssetsOverview\"|g" \
    -e "s|from '@/components/ConditionalHeader'|from '@/components/dashboard/ConditionalHeader'|g" \
    -e "s|from \"@/components/ConditionalHeader\"|from \"@/components/dashboard/ConditionalHeader\"|g" \
    -e "s|from '@/components/DashboardKpiWithFilter'|from '@/components/dashboard/DashboardKpiWithFilter'|g" \
    -e "s|from \"@/components/DashboardKpiWithFilter\"|from \"@/components/dashboard/DashboardKpiWithFilter\"|g" \
    -e "s|from '@/components/EditKpiModal'|from '@/components/dashboard/EditKpiModal'|g" \
    -e "s|from \"@/components/EditKpiModal\"|from \"@/components/dashboard/EditKpiModal\"|g" \
    -e "s|from '@/components/Header'|from '@/components/dashboard/Header'|g" \
    -e "s|from \"@/components/Header\"|from \"@/components/dashboard/Header\"|g" \
    -e "s|from '@/components/KpiCard'|from '@/components/dashboard/KpiCard'|g" \
    -e "s|from \"@/components/KpiCard\"|from \"@/components/dashboard/KpiCard\"|g" \
    -e "s|from '@/components/KpiSection'|from '@/components/dashboard/KpiSection'|g" \
    -e "s|from \"@/components/KpiSection\"|from \"@/components/dashboard/KpiSection\"|g" \
    -e "s|from '@/components/NewsSection'|from '@/components/dashboard/NewsSection'|g" \
    -e "s|from \"@/components/NewsSection\"|from \"@/components/dashboard/NewsSection\"|g" \
    -e "s|from '@/components/PortfolioDonationSummary'|from '@/components/dashboard/PortfolioDonationSummary'|g" \
    -e "s|from \"@/components/PortfolioDonationSummary\"|from \"@/components/dashboard/PortfolioDonationSummary\"|g" \
    -e "s|from '@/components/PortfolioGrantSummary'|from '@/components/dashboard/PortfolioGrantSummary'|g" \
    -e "s|from \"@/components/PortfolioGrantSummary\"|from \"@/components/dashboard/PortfolioGrantSummary\"|g" \
    -e "s|from '@/components/PortfolioInvestmentSummary'|from '@/components/dashboard/PortfolioInvestmentSummary'|g" \
    -e "s|from \"@/components/PortfolioInvestmentSummary\"|from \"@/components/dashboard/PortfolioInvestmentSummary\"|g" \
    -e "s|from '@/components/PortfolioSummarySection'|from '@/components/dashboard/PortfolioSummarySection'|g" \
    -e "s|from \"@/components/PortfolioSummarySection\"|from \"@/components/dashboard/PortfolioSummarySection\"|g" \
    -e "s|from '@/components/SummarySection'|from '@/components/dashboard/SummarySection'|g" \
    -e "s|from \"@/components/SummarySection\"|from \"@/components/dashboard/SummarySection\"|g"
```

- [ ] **Step 3: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS|Cannot find module" | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(components): move dashboard sections to components/dashboard/"
```

---

## Task 3: Consolidate holdings components into `components/holdings/`

These 7 components belong to the holdings domain — `components/holdings/` already exists with 11 files.

**Files moved:**
- `components/AssetTypeFilter.tsx` → `components/holdings/AssetTypeFilter.tsx`
- `components/AssetTypeTabs.tsx` → `components/holdings/AssetTypeTabs.tsx`
- `components/EditHoldingsModal.tsx` → `components/holdings/EditHoldingsModal.tsx`
- `components/HoldingHeader.tsx` → `components/holdings/HoldingHeader.tsx`
- `components/HoldingsSection.tsx` → `components/holdings/HoldingsSection.tsx`
- `components/HoldingsTable.tsx` → `components/holdings/HoldingsTable.tsx`
- `components/InvestmentPerformanceCard.tsx` → `components/holdings/InvestmentPerformanceCard.tsx`

**Known importers:**

| Component | Imported in |
|---|---|
| `HoldingsTable` | `app/dashboard/holdings/page.tsx`, `components/HoldingsSection.tsx` (moving here) |
| `EditHoldingsModal` | `app/dashboard/holdings/page.tsx`, `components/HoldingsSection.tsx` (moving here) |
| `HoldingHeader` | `app/dashboard/holdings/[holdingId]/page.tsx` |
| `AssetTypeFilter` | `components/HoldingsTable.tsx` (moving here) |
| `HoldingsSection` | `app/dashboard/page.tsx` |

- [ ] **Step 1: Move the files**

```bash
git mv components/AssetTypeFilter.tsx components/holdings/AssetTypeFilter.tsx
git mv components/AssetTypeTabs.tsx components/holdings/AssetTypeTabs.tsx
git mv components/EditHoldingsModal.tsx components/holdings/EditHoldingsModal.tsx
git mv components/HoldingHeader.tsx components/holdings/HoldingHeader.tsx
git mv components/HoldingsSection.tsx components/holdings/HoldingsSection.tsx
git mv components/HoldingsTable.tsx components/holdings/HoldingsTable.tsx
git mv components/InvestmentPerformanceCard.tsx components/holdings/InvestmentPerformanceCard.tsx
```

- [ ] **Step 2: Update all import paths**

```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.claude/worktrees/*" \
  | xargs sed -i '' \
    -e "s|from '@/components/AssetTypeFilter'|from '@/components/holdings/AssetTypeFilter'|g" \
    -e "s|from \"@/components/AssetTypeFilter\"|from \"@/components/holdings/AssetTypeFilter\"|g" \
    -e "s|from '@/components/AssetTypeTabs'|from '@/components/holdings/AssetTypeTabs'|g" \
    -e "s|from \"@/components/AssetTypeTabs\"|from \"@/components/holdings/AssetTypeTabs\"|g" \
    -e "s|from '@/components/EditHoldingsModal'|from '@/components/holdings/EditHoldingsModal'|g" \
    -e "s|from \"@/components/EditHoldingsModal\"|from \"@/components/holdings/EditHoldingsModal\"|g" \
    -e "s|from '@/components/HoldingHeader'|from '@/components/holdings/HoldingHeader'|g" \
    -e "s|from \"@/components/HoldingHeader\"|from \"@/components/holdings/HoldingHeader\"|g" \
    -e "s|from '@/components/HoldingsSection'|from '@/components/holdings/HoldingsSection'|g" \
    -e "s|from \"@/components/HoldingsSection\"|from \"@/components/holdings/HoldingsSection\"|g" \
    -e "s|from '@/components/HoldingsTable'|from '@/components/holdings/HoldingsTable'|g" \
    -e "s|from \"@/components/HoldingsTable\"|from \"@/components/holdings/HoldingsTable\"|g" \
    -e "s|from '@/components/InvestmentPerformanceCard'|from '@/components/holdings/InvestmentPerformanceCard'|g" \
    -e "s|from \"@/components/InvestmentPerformanceCard\"|from \"@/components/holdings/InvestmentPerformanceCard\"|g"
```

- [ ] **Step 3: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS|Cannot find module" | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(components): consolidate holdings components into components/holdings/"
```

---

## Task 4: Consolidate map components into `components/map/`

`ImpactMap` is already referenced by `components/map/MapPopover.tsx` as a type import — it always belonged here.

**Files moved:**
- `components/ImpactMap.tsx` → `components/map/ImpactMap.tsx`
- `components/MapSection.tsx` → `components/map/MapSection.tsx`

**Known importers:**

| Component | Imported in |
|---|---|
| `ImpactMap` | `components/MapSection.tsx` (moving here), `components/map/MapPopover.tsx` (type import) |
| `MapSection` | `app/dashboard/page.tsx` |

- [ ] **Step 1: Move the files**

```bash
git mv components/ImpactMap.tsx components/map/ImpactMap.tsx
git mv components/MapSection.tsx components/map/MapSection.tsx
```

- [ ] **Step 2: Update all import paths**

```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.claude/worktrees/*" \
  | xargs sed -i '' \
    -e "s|from '@/components/ImpactMap'|from '@/components/map/ImpactMap'|g" \
    -e "s|from \"@/components/ImpactMap\"|from \"@/components/map/ImpactMap\"|g" \
    -e "s|from '@/components/MapSection'|from '@/components/map/MapSection'|g" \
    -e "s|from \"@/components/MapSection\"|from \"@/components/map/MapSection\"|g"
```

- [ ] **Step 3: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS|Cannot find module" | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(components): consolidate map components into components/map/"
```

---

## Task 5: Consolidate remaining domain components

Five remaining loose files each belong to an existing domain folder.

**Files moved:**
- `components/ContactPhotoUpload.tsx` → `components/profile/ContactPhotoUpload.tsx`
- `components/EditableContactNotes.tsx` → `components/profile/EditableContactNotes.tsx`
- `components/EditableDescription.tsx` → `components/profile/EditableDescription.tsx`
- `components/GrantSummaryCard.tsx` → `components/grants/GrantSummaryCard.tsx`
- `components/AddToTaxTrackerButton.tsx` → `components/tax/AddToTaxTrackerButton.tsx`

**Known importers:**

| Component | Imported in |
|---|---|
| `ContactPhotoUpload` | `app/dashboard/holdings/[holdingId]/page.tsx` |
| `EditableContactNotes` | `app/dashboard/holdings/[holdingId]/page.tsx` |
| `EditableDescription` | `app/dashboard/holdings/[holdingId]/page.tsx` |
| `GrantSummaryCard` | `components/grants/GrantsList.tsx` |
| `AddToTaxTrackerButton` | *(scan during step — may have been added since last search)* |

- [ ] **Step 1: Verify importers (run this grep before moving)**

```bash
grep -rn "from '@/components/AddToTaxTrackerButton'\|from \"@/components/AddToTaxTrackerButton\"" \
  app components --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v worktrees
```

Note any additional importers found, add them to the sed command in Step 3.

- [ ] **Step 2: Move the files**

```bash
git mv components/ContactPhotoUpload.tsx components/profile/ContactPhotoUpload.tsx
git mv components/EditableContactNotes.tsx components/profile/EditableContactNotes.tsx
git mv components/EditableDescription.tsx components/profile/EditableDescription.tsx
git mv components/GrantSummaryCard.tsx components/grants/GrantSummaryCard.tsx
git mv components/AddToTaxTrackerButton.tsx components/tax/AddToTaxTrackerButton.tsx
```

- [ ] **Step 3: Update all import paths**

```bash
find . -type f \( -name "*.tsx" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.claude/worktrees/*" \
  | xargs sed -i '' \
    -e "s|from '@/components/ContactPhotoUpload'|from '@/components/profile/ContactPhotoUpload'|g" \
    -e "s|from \"@/components/ContactPhotoUpload\"|from \"@/components/profile/ContactPhotoUpload\"|g" \
    -e "s|from '@/components/EditableContactNotes'|from '@/components/profile/EditableContactNotes'|g" \
    -e "s|from \"@/components/EditableContactNotes\"|from \"@/components/profile/EditableContactNotes\"|g" \
    -e "s|from '@/components/EditableDescription'|from '@/components/profile/EditableDescription'|g" \
    -e "s|from \"@/components/EditableDescription\"|from \"@/components/profile/EditableDescription\"|g" \
    -e "s|from '@/components/GrantSummaryCard'|from '@/components/grants/GrantSummaryCard'|g" \
    -e "s|from \"@/components/GrantSummaryCard\"|from \"@/components/grants/GrantSummaryCard\"|g" \
    -e "s|from '@/components/AddToTaxTrackerButton'|from '@/components/tax/AddToTaxTrackerButton'|g" \
    -e "s|from \"@/components/AddToTaxTrackerButton\"|from \"@/components/tax/AddToTaxTrackerButton\"|g"
```

- [ ] **Step 4: Verify no broken imports**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS|Cannot find module" | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(components): consolidate remaining domain components into profile/, grants/, tax/"
```

---

## Task 6: Delete empty artifact directories

Three empty `graphify-out/` directories were left by a code analysis tool. They have no source files.

- [ ] **Step 1: Verify they are empty**

```bash
find components/graphify-out app/graphify-out lib/graphify-out -type f 2>/dev/null
```

Expected: no output. If files appear, stop and investigate before deleting.

- [ ] **Step 2: Remove the directories**

```bash
git rm -r --ignore-unmatch components/graphify-out
git rm -r --ignore-unmatch app/graphify-out
git rm -r --ignore-unmatch lib/graphify-out
# For any that weren't tracked by git:
rm -rf components/graphify-out app/graphify-out lib/graphify-out
```

- [ ] **Step 3: Final verification — confirm root of components/ is now empty**

```bash
ls components/*.tsx 2>/dev/null && echo "FAIL: loose files remain" || echo "OK: components root is clean"
```

Expected: `OK: components root is clean`

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: all tests pass (test files use source-scan patterns, not runtime imports, so moves don't break them).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove empty graphify-out artifact directories"
```

---

## Self-review

**Spec coverage:**
- ✅ All 40 loose files assigned to a destination folder
- ✅ All known import paths updated via sed in each task
- ✅ Both quote styles handled (`'` and `"`)
- ✅ `git mv` used (not `cp` + `rm`) — preserves file history
- ✅ TypeScript verification after every batch — catches any missed imports
- ✅ `AIAssistantPanel` relative import handled — both files move together so `'./AIAssistantPanel'` stays valid
- ✅ No index.ts re-export shims — direct import path updates only
- ✅ Tasks ordered: shared primitives (Task 1) before dashboard components that import them (Task 2)

**Potential misses to double-check before each task:**
- Any import of a component using a non-`@/components/` path (e.g., `../components/Foo` from a file outside `app/`). The sed commands target `@/components/` — run a quick grep for relative imports if unsure.
