# Accessibility Audit — QA Findings

> Audit date: 2026-04-02
> Standard: WCAG 2.1 Level AA
> Auditor: QA (static code analysis)

---

## 🔴 Critical (WCAG failure, major barrier)

### 1. All modal dialogs lack focus trap and initial focus management

- **Files:**
  - `components/EditHoldingsModal.tsx:267-594`
  - `components/EditKpiModal.tsx:145-288`
  - `components/vis/CreateWidgetModal.tsx:213-263`
  - `components/vis/EditWidgetsModal.tsx:244-498`
- **Violation:** When these modals open, focus is not moved into the modal, and tabbing freely escapes into background content. Neither `useEffect` nor a ref is used to call `.focus()` on the first interactive element, and there is no focus cycle trap. `aria-modal="true"` is set correctly but without a matching focus trap it is insufficient — many screen readers still require an explicit focus trap to prevent virtual cursor escape.
- **Impact:** Keyboard-only and screen reader users can Tab past the modal into hidden background content, losing their place entirely. Completing a modal workflow is impossible without a pointing device. Violates SC 2.1.1 (Keyboard) and SC 2.1.2 (No Keyboard Trap — in this case the trap in the correct direction is missing).
- **Fix:** On open, move focus to the first focusable element inside the modal (or the title element). Use `focus-trap-react` or manually intercept Tab/Shift-Tab to cycle focus within the dialog bounds. On close, return focus to the trigger element.

---

### 2. AddToPortfolioModal and ContributionDetailModal missing ARIA dialog roles

- **Files:**
  - `components/charities/AddToPortfolioModal.tsx:119`
  - `components/tax/ContributionDetailModal.tsx:137,154,178`
- **Violation:** These modals use plain `<div>` wrappers with no `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`. Screen readers cannot identify them as dialogs. Additionally, both modals lack focus trap (same as issue #1). The loading skeleton state (line 137) has no `role="status"` or `aria-live`.
  ```tsx
  // AddToPortfolioModal.tsx:119 — missing role/aria attributes entirely
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  ```
- **Impact:** Screen readers do not announce modal context on open, disorienting assistive technology users. Virtual cursor can roam freely over background content.
- **Fix:** Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the heading `id` on all modal overlays. Add focus trap and focus management (see issue #1).

---

### 3. Login form fields have no label elements — placeholder only

- **File:** `app/login/page.tsx:146-153, 169-179`
- **Violation:** Both the sign-in and sign-up forms use `placeholder` text as the sole field identification. No `<label>` element is associated with any input via `htmlFor`/`id`.
  ```tsx
  // login/page.tsx:146 — no <label> element; placeholder disappears on type
  <input
    type="email" placeholder="you@company.com" className="..."
    value={email} onChange={e=>setEmail(e.target.value)} required
  />
  ```
- **Impact:** When users type, the placeholder disappears and field context is lost. Some screen readers do not announce placeholder text at all. Violates SC 1.3.1 (Info and Relationships) and SC 3.3.2 (Labels or Instructions).
- **Fix:** Add a visible or `sr-only` `<label>` element with matching `htmlFor`/`id` on every input.

---

### 4. All D3 chart components have no accessible text alternatives

- **Files:**
  - `components/vis/ImpactBubbleChart.tsx:416-424`
  - `components/vis/PerformanceHeatMap.tsx:470-479`
  - `components/vis/WaterfallChart.tsx` (entire SVG render)
  - `components/vis/KpiTrend.tsx`, `SmallMultiples.tsx`, `RadialProgress.tsx`, `SectorEmissionsBar.tsx`, `ImpactTimeline.tsx`
- **Violation:** All D3 visualizations render raw `<svg>` elements with no `role`, no `aria-label`, no `<title>`, no `<desc>`, and no accessible data table alternative. Interaction is entirely mouse/hover-based (tooltip on `mouseover`). Keyboard focus cannot reach individual data points.
  ```tsx
  // PerformanceHeatMap.tsx:471-472 — raw SVG with no accessible metadata
  <div ref={containerRef} className="w-full h-full overflow-auto relative">
    <svg ref={svgRef} className="min-w-full min-h-full" />
  ```
  **Exception:** `HoldingsPieWidget.tsx:127-130` correctly sets `role="img"`, `aria-label`, and `<title>` on slices — this pattern should be replicated across all charts.
- **Impact:** All portfolio data visualizations are completely invisible to screen reader users. This is the single largest accessibility gap in the app, blocking core analysis features. Violates SC 1.1.1 (Non-text Content).
- **Fix:** At minimum, add `role="img"` and a descriptive `aria-label` to each SVG (e.g., "Bubble chart comparing renewable energy output vs emissions across 8 holdings"). Better: provide a toggle to a visible data summary table. For interactive charts, implement keyboard navigation to data points with `tabIndex` and ARIA attributes.

---

### 5. InlineEdit component not keyboard accessible (double-click only)

- **File:** `components/InlineEdit.tsx:70–78`
- **Violation:** The editable display element is rendered as a `<span>`, `<h1>`, `<h2>`, or `<p>` with only an `onDoubleClick` handler. There is no `tabIndex`, no `role="button"`, and no `onKeyDown` handler. `title="Double-click to edit"` is tooltip-only. Keyboard users have no way to activate edit mode.
- **Impact:** Keyboard-only users cannot edit any inline field in the app (holding names, section headers, KPI titles). Violates SC 2.1.1 (Keyboard).
- **Fix:** Either render as a `<button>` with single-click, or add `tabIndex={0}`, `role="button"`, `aria-label="Edit [value]"`, and an `onKeyDown` handler that enters edit mode on `Enter` or `Space`.

---

### 6. D3 bubble chart circles are not keyboard accessible

- **File:** `components/vis/ImpactBubbleChart.tsx:311–367`
- **Violation:** Each holding is an SVG `<circle>` with a D3 `on('click', ...)` handler and `cursor: pointer`, but no `tabIndex`, no `role="button"`, and no `keydown` handler. Navigation to holding detail pages is mouse-only.
- **Impact:** Keyboard users cannot navigate to any holding detail page from the bubble chart. Violates SC 2.1.1 (Keyboard).
- **Fix:** Select each bubble `<g>` element, set `.attr('tabindex', 0).attr('role', 'button').attr('aria-label', d => d.holdingName + ' — open details')`, and add a `keydown` handler for Enter/Space to call `onBubbleClick`.

---

### 7. No skip navigation link

- **File:** `app/layout.tsx:23-34`
- **Violation:** There is no "Skip to main content" link at the top of every page. Keyboard users must Tab through the sticky header (5 nav links + logo) before reaching any page content on every navigation.
- **Impact:** High-friction navigation for keyboard users; violates SC 2.4.1 (Bypass Blocks).
- **Fix:**
  ```tsx
  // Add as first child of <body>
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200000] ...">
    Skip to main content
  </a>
  <main id="main-content" ...>
  ```

---

## 🟡 High (significant barrier, requires improvement)

### 8. PerformanceHeatMap encodes all data via color only by default (WCAG 1.4.1)

- **File:** `components/vis/PerformanceHeatMap.tsx:180`
- **Violation:** `showValues` defaults to `false`, so heatmap cells contain zero text — all data is encoded solely by cell background color gradient. Users with color vision deficiency see an unparseable grid.
- **Impact:** The entire heatmap widget is inaccessible to colorblind users by default. Violates SC 1.4.1 (Use of Color).
- **Fix:** Default `showValues` to `true`. Additionally add a `<title>` element inside each SVG `<rect>` containing `"${holding}: ${col} = ${value}"`.

---

### 9. CharityFilterSidebar: range sliders unassociated with labels; collapse/close buttons unnamed; mobile overlay lacks dialog semantics

- **File:** `components/charities/CharityFilterSidebar.tsx:116–130, 181–205, 309–321`
- **Violation (a — labels):** Rating and revenue range inputs are siblings of their `<label>` elements with no `htmlFor`/`id` pairing. Screen readers announce "slider" with no name.
- **Violation (b — icon buttons):** The desktop collapse button (line 116) and mobile close button (line 123) contain only Lucide icon components with no `aria-label`.
- **Violation (c — dialog):** The mobile overlay (line 309) is a plain `<div>` with no `role="dialog"`, `aria-modal`, focus management, or Escape key handler.
- **Impact:** Filter sidebar is essentially unusable via keyboard or AT: unlabeled controls, unnamed buttons, and a modal-like panel with no modal semantics. Violates SC 1.3.1, 4.1.2.
- **Fix:** (a) Add `id` to each range input and `htmlFor` to each label; add `aria-valuetext` for human-readable value. (b) Add `aria-label={isCollapsed ? 'Expand filters' : 'Collapse filters'}` and `aria-label="Close filters"`. (c) Add `role="dialog"`, `aria-modal="true"`, `aria-label="Filter options"`, focus trap, and Escape handler.

---

### 10. TimelineScrubber range input lacks accessible name; play button uses `title` not `aria-label`

- **File:** `components/map/TimelineScrubber.tsx:118–130, 135–149`
- **Violation (a):** The `<input type="range">` has no `aria-label`, no `aria-labelledby`, and no paired `<label>`. Screen readers announce "slider" with no context.
- **Violation (b):** The play/pause button uses `title={isPlaying ? 'Pause' : 'Play backwards'}` (line 147). `title` is not reliably surfaced as an accessible name by screen readers.
- **Impact:** Screen reader users cannot identify the timeline scrubber or the play button. Violates SC 4.1.2.
- **Fix:** Add `aria-label="Timeline position"` and `aria-valuetext={formatDate(currentDate)}` to the range input. Replace `title` with `aria-label={isPlaying ? 'Pause animation' : 'Play animation'}` on the button.

---

### 11. Mobile hamburger menu missing `aria-controls`

- **File:** `components/Header.tsx:120–137, 143–178`
- **Violation:** The toggle button has `aria-expanded={mobileMenuOpen}` (correct) but no `aria-controls`. The menu drawer div (line 143) has no `id`.
- **Impact:** Screen reader users cannot programmatically navigate from the toggle to the menu it controls. Violates SC 4.1.2.
- **Fix:** Add `id="mobile-nav"` to the menu drawer and `aria-controls="mobile-nav"` to the toggle button.

---

### 12. Carousel autoplay lacks a persistent pause/stop control (WCAG 2.2.2)

- **File:** `components/vis/VisualCarousel.tsx:287–291`
- **Violation:** The carousel auto-advances every 8 seconds. Pausing requires hovering or keeping keyboard focus on the carousel. There is no always-visible stop/pause button. WCAG 2.2.2 requires a persistent user-operable mechanism to pause/stop auto-advancing content.
- **Impact:** Users reading slowly, using screen magnifiers, or focused elsewhere cannot stop carousel advancement.
- **Fix:** Add a visible pause/play toggle button in the carousel header; the existing `isPaused` state makes this a small change.

---

### 13. Azure (#5186a6) fails WCAG contrast for normal-sized body text

- **File:** `app/globals.css:8`, used throughout
- **Violation:** The brand color `azure: #5186a6` has a contrast ratio of approximately **3.6:1** against white (`#ffffff`) and the near-white creme background (`#fffff9`). WCAG AA requires **4.5:1** for text under 18pt (or 14pt bold). This color is used as text and link color in navigation links (`Header.tsx:87-116`), button backgrounds with white text, the "Select" label in search results (`EditHoldingsModal.tsx:538`), focus ring color, and general accent text across the app.
- **Impact:** Users with low vision or color perception differences cannot reliably read azure-colored text elements.
- **Fix:** Darken the azure token to approximately `#3a6a8a` (≈4.7:1 on white) for all normal text uses. Large text (≥18pt / 14pt bold) at 3.6:1 technically passes the 3:1 large-text threshold.

---

### 7. Form error and success messages are not announced to screen readers

- **Files:**
  - `app/login/page.tsx:154-155`
  - `components/EditHoldingsModal.tsx:301-305`
  - `components/EditKpiModal.tsx:169-171`
  - `components/tax/DonorProfileForm.tsx:94-103`
  - `components/charities/AddToPortfolioModal.tsx:143-151`
- **Violation:** Error and success messages are injected as static `<p>` or `<div>` elements without `role="alert"` or `aria-live`. Screen readers do not announce them when they appear in the DOM.
  ```tsx
  // login/page.tsx:154 — no role="alert", silently injected
  {error && <p className="text-red-600 text-sm">{error}</p>}
  ```
- **Impact:** Form errors are silent to screen reader users. Users submit and receive no feedback indicating why the action failed. Violates SC 4.1.3 (Status Messages).
- **Fix:** Add `role="alert"` (or `aria-live="assertive"`) to error containers; use `role="status"` / `aria-live="polite"` for success messages.

---

### 8. Header navigation links missing aria-current

- **File:** `components/Header.tsx:86-116`
- **Violation:** Although `usePathname()` is imported and available (line 17), nav links for Dashboard, Charities, Tax, and Profile do not set `aria-current="page"` on the active route. All links look identical to screen readers.
- **Impact:** Screen reader users cannot determine which page they are currently on from the navigation. Violates SC 2.4.4 (Link Purpose) and best practice for SC 1.3.1.
- **Fix:** Compare `pathname` to each link href and add `aria-current="page"` when matched.

---

### 9. Icon-only buttons lack accessible names

- **Files:**
  - `components/AIAssistantPanel.tsx:272-278` — Close button (XMarkIcon, no `aria-label`)
  - `components/tax/ContributionDetailModal.tsx:203-207` — SVG close button, no `aria-label`
  - `components/vis/EditWidgetsModal.tsx:427-436, 438-446` — Move up/down buttons use only `title` attribute
  - `components/tax/ContributionDetailModal.tsx:477-485` — "Close uploader" SVG button
- **Violation:** Buttons containing only icon SVGs without `aria-label` are announced as empty or meaningless strings. The `title` attribute is not consistently surfaced as an accessible name by all screen readers.
  ```tsx
  // AIAssistantPanel.tsx:272-278 — no aria-label on close button
  <button onClick={onClose} className="p-1 hover:bg-white/20 ...">
    <XMarkIcon className="h-5 w-5" />
  </button>
  ```
- **Impact:** Screen reader users cannot identify these controls. Violates SC 4.1.2 (Name, Role, Value).
- **Fix:** Add `aria-label` (not `title`) to all icon-only buttons with descriptive names like `aria-label="Close assistant"`, `aria-label="Move widget up"`.

---

### 10. DonorProfileForm inputs not programmatically associated with labels

- **File:** `components/tax/DonorProfileForm.tsx:108-162`
- **Violation:** Labels are standalone `<label>` elements adjacent to inputs (not wrapping them), with no `htmlFor`/`id` pairing. Inputs lack `id` attributes entirely.
  ```tsx
  // DonorProfileForm.tsx:109-113 — <label> without htmlFor, <input> without id
  <label className="block text-sm font-medium text-neutral-700 mb-2">
    Date of Birth ...
  </label>
  <input type="date" value={dateOfBirth} ... />
  ```
- **Impact:** Screen readers will not associate the label with the input field. Users focusing the input will not hear the field name announced. Violates SC 1.3.1.
- **Fix:** Add `id` attributes to each input/select and matching `htmlFor` attributes to the labels.

---

### 11. LoadingScreen transitions not announced to screen readers

- **File:** `components/LoadingScreen.tsx:58-74`
- **Violation:** The full-screen loading overlay appears/disappears via CSS opacity transitions. There is no `role="status"`, `aria-live`, or `aria-busy` attribute to communicate loading state to screen readers.
- **Impact:** Screen reader users receive no feedback during 800ms route transitions. They may attempt to interact with content that isn't yet loaded. Violates SC 4.1.3 (Status Messages).
- **Fix:** Add `role="status"` and `aria-live="polite"` to the loading container. Optionally set `aria-busy="true"` on `<main>` during transitions.

---

### 12. Charity search combobox in EditHoldingsModal lacks ARIA combobox pattern

- **File:** `components/EditHoldingsModal.tsx:490-548`
- **Violation:** The charity search field with a dynamic dropdown is a plain `<input type="text">` with no `role="combobox"`, no `aria-autocomplete`, no `aria-expanded`, no `aria-controls`, and result items have no `role="option"`. Arrow-key navigation between results is not implemented.
  ```tsx
  // EditHoldingsModal.tsx:495-501 — no combobox ARIA attributes
  <input
    type="text" value={charityQuery}
    onChange={(e) => setCharityQuery(e.target.value)}
    placeholder="Search by nonprofit name or EIN..."
    className="w-full pl-10 ..."
  />
  ```
- **Impact:** Screen reader users do not know a dropdown is available, cannot navigate results with arrow keys, and do not hear result count announcements. Violates SC 4.1.2.
- **Fix:** Implement the ARIA combobox pattern: `role="combobox"` + `aria-expanded` + `aria-controls` on the input, `role="listbox"` on the results container, `role="option"` on each result.

---

### 13. Mobile HoldingsTable cards lack keyboard event handlers

- **File:** `components/HoldingsTable.tsx:231-289`
- **Violation:** Mobile card view `<div>` elements have `role="button"` and `tabIndex={0}` but no `onKeyDown` handler. The desktop `<tr>` equivalent (line 386-392) correctly handles Enter/Space, but the mobile card view does not.
- **Impact:** Keyboard users on small-screen viewports cannot navigate to holding detail pages. Violates SC 2.1.1 (Keyboard).
- **Fix:** Add an `onKeyDown` handler identical to the desktop table row (lines 386-392) to each mobile card `<div>`.

---

## 🟢 Low (minor polish)

### 22. Emojis used as sole status indicators without accessible fallback

- **Files:**
  - `components/tax/DonorProfileForm.tsx:102` — `✅ Donor profile saved successfully`
  - `components/tax/ContributionDetailModal.tsx:429, 445` — `✓ Appraisal uploaded`, `⚠️ Action Required`
- **Violation:** Emoji characters serve as the only visual status icons. Screen readers announce them by unicode name ("white heavy check mark", "warning sign"), interrupting the message.
- **Fix:** Wrap each emoji in `<span aria-hidden="true">` and add `<span className="sr-only">Success:</span>` or similar, or replace with aria-hidden SVG icons.

---

### 23. `animate-slide-up` does not respect `prefers-reduced-motion`

- **File:** `app/globals.css:43–56`
- **Violation:** The `@keyframes slide-up` animation and `.animate-slide-up` class are not guarded by `@media (prefers-reduced-motion: reduce)`. The existing reduced-motion utilities do not cover this animation. Violates SC 2.3.3.
- **Fix:** Inside the existing reduced-motion block, add: `.animate-slide-up { animation: none !important; }`.

---

### 24. Brand logo "B." has no accessible text in the header

- **File:** `components/Header.tsx:71-73`
- **Violation:** The header home link contains `<span>B.</span>` with no `aria-label` or `sr-only` text. Screen readers will announce this as "B. period" or just "B."
- **Fix:** Add `aria-label="Benevolence home"` to the `<Link>` or add `<span className="sr-only">Benevolence</span>` inside it.

---

### 15. Focus ring contrast is likely insufficient

- **Files:** Multiple — `focus:ring-azure/30` used on inputs throughout
- **Violation:** Many inputs use `focus:ring-2 focus:ring-azure/30`, producing a ~30%-opacity ring that has very low contrast against the background. WCAG 2.2 SC 2.4.11 (Focus Appearance) requires focus indicators to have at least a 3:1 contrast ratio.
  - Examples: `app/login/page.tsx:147`, `components/EditHoldingsModal.tsx:500`
- **Fix:** Use `focus:ring-azure` (full opacity) or a higher-contrast focus ring style.

---

### 16. Suspense fallback loading text lacks live region

- **File:** `app/login/page.tsx:199`
- **Violation:** `<div>Loading...</div>` Suspense fallback has no `role="status"` or `aria-live`. Screen readers announce "Loading..." on render but receive no notification when replaced by actual content.
- **Fix:** Add `role="status"` and `aria-live="polite"` to the fallback container.

---

### 17. `confirm()` used for destructive delete confirmations

- **Files:**
  - `components/EditHoldingsModal.tsx:250`
  - `components/EditKpiModal.tsx:128`
  - `components/vis/EditWidgetsModal.tsx:83`
- **Violation:** Native `window.confirm()` is used for delete confirmations. While technically operable by screen readers, it interrupts the focus flow managed by the app's own modals and is not styled consistently with the design system.
- **Fix:** Replace with an inline confirmation step or a purpose-built `role="alertdialog"` confirmation modal.

---

### 18. Form helper text not linked via aria-describedby

- **File:** `components/EditHoldingsModal.tsx:363`, multiple form components
- **Violation:** Helper text (e.g., `<div className="text-xs text-neutral-500">Base currency of the portfolio.</div>`) is adjacent to inputs but not linked via `aria-describedby`.
- **Fix:** Add `id` to helper text elements and `aria-describedby` on the corresponding inputs.

---

### 19. HoldingsPieWidget relies on color alone for slice distinction

- **File:** `components/vis/HoldingsPieWidget.tsx:131-152`
- **Violation:** Chart slices are differentiated by color only. While the legend provides text labels, the chart itself encodes meaning through color without any pattern or texture alternative.
- **Fix:** Consider adding patterns or textures to chart segments as a secondary differentiator, or always display the legend (it defaults to `showLegend=true` which is good).

---

### 20. HoldingsTable sort indicators use Unicode characters only

- **File:** `components/HoldingsTable.tsx:183-186`
- **Violation:** Sort direction is indicated by `▲` / `▼` characters appended to column header text with no `aria-sort` on sortable `<th>` elements... actually `aria-sort` is present (lines 329, 336, 346, etc.) — this is correct. However, the visual sort indicator characters are inserted via text content with no `aria-hidden`, causing screen readers to announce "Holding ascending triangle" instead of "Holding, ascending".
- **Fix:** Add `aria-hidden="true"` to the sort indicator span so screen readers rely solely on `aria-sort`.

---

## Summary

- **7 critical, 13 high, 11 low issues found**
- **Overall accessibility assessment:** The application has severe structural barriers — no focus management in any of its six modal dialogs, login form inputs with no labels, all D3 data visualizations inaccessible to screen readers, and core inline-edit controls that are keyboard-inaccessible. These issues block core workflows (signing in, editing holdings, viewing portfolio analytics) for keyboard-only and screen reader users. Some groundwork is present (correct `role="dialog"` + `aria-modal` on four of six modals, `aria-sort` on table headers, `aria-label` on icon buttons in some components, `role="img"` on the pie chart), but a focused remediation sprint addressing the Critical and High items is required before the application can claim WCAG 2.1 AA conformance.
