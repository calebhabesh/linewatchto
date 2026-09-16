# Desktop sidebar refinement: Gemini implementation handoff

Prepared for **Gemini 3.8 Flash** on 2026-09-16. Codex is the architect; Gemini implements. The user accepted the decisions below in two interview rounds and requested this implementation document. Application implementation has not started as part of this handoff.

## Start here

1. Read [root guidance](../../AGENTS.md) and [frontend guidance](../../frontend/AGENTS.md), inspect the working tree, and preserve unrelated changes.
2. Treat this document as the current design authority for this refinement. It supersedes conflicting presentation, destination-width, Saved navigation, and map-control placement decisions in the [previous polish handoff](2026-09-16-desktop-sidebar-polish.md). Its historical code findings describe the earlier baseline and must not be reapplied blindly. The user reports that pass committed as `4217430f`.
3. Implement the checkpoints below in order. They may span sessions; routine implementation and verification do not need renewed design approval. Record progress in the ledger at the end. This document does not request committing, publishing, or deploying.

**Mobile is locked/frozen.** Preserve the responsive web phone and short-landscape experiences, including appearance, sizing, navigation, controls, camera behavior, and eligibility breakpoints. Expo is out of scope. Scope new styles and behavior to the existing desktop presentation; shared component edits must retain mobile output and behavior. Mobile checks prove preservation, not permission to redesign or update its baselines to accept leakage.

## Accepted design

### 1. Panel sizing and navigation

Use destination profiles, not content measurements or changing API counts:

| Destination | Target width |
| --- | --- |
| Status, More | 380px |
| Search | 560px |
| Stations collection | 680px |
| My Commutes collection and create/edit flow | 680px |
| Station detail and other existing medium destinations | Retain 560px |
| Impact collections, Alert History, other existing wide destinations | Retain 680px |

These are targets, constrained by available space. Preserve the current 72px rail, 480px minimum docked map budget, and 160px minimum exposed map in overlay mode. Dock when `W >= 72 + P + 480`; otherwise use an overlay width of `min(P, W - 72 - 160)` under existing desktop eligibility. Thresholds remain 932/1112/1232px; changing destination assignments changes when those thresholds apply.

Allow meaningful labels, station names, headings, filter values, and metadata to wrap. Essential content must not depend on ellipses or horizontal scrolling. Keep widths stable during polling, loading, filtering, and count changes. Larger content can increase vertical scrolling; do not shrink typography to force everything above the fold.

Split Saved into independent rail destinations, ordered **Status → Search → Stations → Commutes → More**. Use the established **My Commutes** wording in the destination title and other applicable copy. Give Stations and Commutes separate badges for affected saved stations and affected commutes; hide zero badges. Preserve existing definitions of affected, without counting multiple incidents as multiple saved entities or manufacturing a healthy state from unavailable data.

Remove desktop dependence on the last-visited Saved child. Preserve saved data, account gating, drafts, deep links, filters, scroll, and Back behavior. If the legacy Saved preference or route is also used by mobile, retain it for mobile and adapt only desktop routing. Collection and editor views fill the sidebar like impact panels, with one primary vertical scrollbar and the existing pinned header pattern. Preserve true dialog behavior where applicable.

Keep Alert History and Site Guide under More. Preserve existing paths to account and other More destinations. Retain keyboard access to all five rail entries at supported desktop heights.

### 2. Search

Restore the old search field's subdued surface and styling from the existing search styles; remove the unwanted decorative white outline in ordinary dark mode. Preserve visible keyboard focus and high-contrast boundaries.

Focusing the global search field opens the 560px Search destination. Preserve the query when navigating away. Escape returns to the previous destination, including its profile and state; selecting a result opens its existing detail view. Preserve origin once per search session so repeated focus or typing does not overwrite it. Handle focus restoration without immediately reopening Search. Retain existing subordinate-view search suppression and rail access.

### 3. Visual scale and Status composition

Apply the larger desktop scale throughout Status, More, Search, Stations, My Commutes, forms, and embedded feature destinations. Initial browser-tuning targets:

- Ordinary rows and interactive targets: approximately 44–48px minimum height.
- Line-status rows: approximately 60–64px minimum height.
- Primary labels: approximately 14px; section headings: 13–14px, visibly larger than the current tiny labels.

These are minimums/starting points, not fixed heights that clip wrapped content. Scale icon alignment, controls, spacing, and padding together. Preserve authored route colors, existing fonts, semantic colors, theme support, high contrast, reduced motion, and card radii at most 8px. Keep current status and the beginning of actionable content in the first viewport at ordinary desktop heights.

Use the old section-header **sky-blue accent beam**, including its diffuse glow, from `header-flare.css` (`.station-subsection-header` / `.bg-logo-blue`). The current narrow cyan bars are not the visual reference. Reuse the existing treatment under desktop scope instead of approximating another blue.

Status order is:

1. **System Status**: current selected-network summary and prominent honest freshness badge.
2. **Alerts & Notices**: replaces “Impact Categories.”
3. **Line Status**: larger readable horizontal line rows.
4. **Map & Data**: relocated clock/date/time zone, estimated-train controls/details, and source diagnostics.

Retain relevant priority disruption information within the status summary without restoring the previous handoff's competing section scheme.

For Alerts & Notices, restore the old tinted alert-type pill design at a smaller sidebar scale: semantic tinted background, leading icon, distinct circular count treatment, readable label. Use the current 2×2 order: Active Alerts / Delays, then Speed Zones / Closures. The old reference showed red alerts, yellow delays, blue planned closures, and orange speed zones. Reuse existing chip styling and semantics rather than recoloring route identities or changing data classification. Zero-count alert destinations remain available and subdued.

Place Accessibility, Surface Notices, and Announcements as full-width rows below the grid. Give the grid real content-driven height and explicit row/section gaps. No overlap, negative-margin clipping, or fixed-height container that lets subsequent rows intrude. When two columns cannot fit legible content, reflow to one column. Counts must remain readable at zero and multiple digits.

The visual references supplied in the interview showed: a dark slate rail/sidebar; an old search field without a bright outline; larger blue-beam headings; rounded tinted impact pills; current additional notice rows intruding into the grid; and undersized More rows. This description and existing styles are sufficient without access to temporary clipboard screenshots.

### 4. Move map chrome into the sidebar

Remove these **desktop** top-right controls after their functionality is reachable in the sidebar:

| Existing control | Destination |
| --- | --- |
| Alert History | More → Alert History |
| Info / Site Guide | More → Site Guide |
| Logs / source-system status | Status → Map & Data diagnostics |
| Theme switch | Stays on the map |

The Logs dropdown contains useful diagnostics distinct from the System Status summary. Preserve those diagnostics. Make the System Status card provide an accessible path to Map & Data diagnostics; a same-view jump may scroll/focus that section rather than opening a redundant panel.

Remove the desktop center status capsule. Move its clock/date/time zone, estimated-marker toggle, loading/reconnecting/held/unavailable information, and relevant source details into Map & Data. Reuse the existing state and data ownership; do not create duplicate polling or preference storage. Keep the existing freshness badge near System Status; avoid adding a second generic live badge.

While another destination is open or the sidebar is collapsed, keep a small persistent map indication when displayed data is stale, offline, or estimated. Estimated marker placements remain explicitly schematic. This is a compact conditional indication, not a recreation of the removed console. Read the affected sections of [domain invariants](../domain-invariants.md) before moving freshness, notices, or commute presentation. Preserve independent TTC and GO/UP source states. If changing public source claims or source use becomes necessary, first read [source launch gates](../source-licensing-launch-gates.md); ingestion changes are outside this pass.

The capsule's surrounding anchor also owns closing-soon notices and closed-network peek/return controls. Put closing details in Status, but retain a compact conditional map notice with the relevant action while closing/closed-network viewing applies. It must remain usable in Search, Stations, Commutes, and collapsed mode. Respect existing notice priority so these indications do not collide.

Move **Center / Magnify** controls upward into the former center-console area for both TTC and GO/UP. Align them within the usable map area and keep them clear of the theme switch, sidebar, conditional notices, and selected map targets. Preserve their existing action semantics and accessible labels.

### 5. Camera behavior

On sidebar collapse, expansion, profile changes, and dock/overlay transitions, center the **current geographic focus** within the resulting usable map rectangle and preserve zoom. A user exploring Scarborough must remain focused on Scarborough after opening a panel. Do not reset explored views to the network overview. Explicit Center remains the reset action; preserve the existing untouched-overview fit behavior.

Use real map viewport geometry. Docking already reduces the viewport: do not subtract sidebar width twice. Overlays require their actual occluded area to be excluded. Capture the existing map-space focus before layout changes and reconcile once after final dimensions settle. Avoid cumulative drift, repeated fit jumps, arbitrary fixed translations, or CSS-only visual movement that leaves camera coordinates wrong.

Preserve selected-station focus and per-network camera preferences. Existing View on map behavior remains: docked panels stay open; overlay panels collapse transiently to reveal the target, retaining their content and leaving the durable collapse preference unchanged. Focus/reveal must use the final geometry. Read the camera section of the [original redesign handoff](2026-09-16-desktop-sidebar-redesign.md) before editing this behavior; this document clarifies the accepted centering intent. Read the [map contract](../ttc-map-asset-contract.md) if touching asset geometry or overlay anchoring; authored map assets are outside the intended scope.

## Implementation checkpoints

### A. Baseline and navigation/widths

Inspect the current running desktop UI and record representative before views plus mobile preservation references. Verify source owners against the working tree. Implement destination widths, separate Stations/Commutes rail entries and badges, search focus/Escape behavior, and full-width collection/editor adapters.

**Done when:** both collections and commute editing use the wide profile; Search uses medium; route selection, Back, query/draft preservation, and account states work; widths obey dock/overlay budgets; mobile routing and Saved behavior remain intact. Add focused behavioral coverage for these changes.

### B. Camera reconciliation

Reproduce the reported centering defect before claiming its cause. Implement or repair the available-map-center contract in both maps. If the existing implementation already meets part of the contract, retain it and add evidence rather than replacing it.

**Done when:** an explored location and zoom survive repeated expand/collapse cycles, compact/medium/wide transitions, and dock/overlay changes without drift; selected targets remain visible; untouched overview and transient View on map collapse still work. Capture browser evidence for both networks, including an overlay case.

### C. Desktop visual treatment

Restore search and beam styles, implement larger row/heading scale, restore the scaled impact pills, fix grid/notice flow, and apply the scale across reachable sidebar views. Keep CSS in owning files under desktop scope.

**Done when:** Status, More, Search, Stations, My Commutes/editor, station detail, and representative rich impact views have readable unclipped content, consistent scale, and one main scrollbar. Verify long content, multi-digit counts, and narrow desktop reflow. Mobile before/after remains unchanged.

### D. Map controls and data relocation

Implement Map & Data and System Status access to diagnostics. Relocate controls and conditional notices, remove superseded desktop chrome, and move Center/Magnify. Preserve all existing underlying capabilities and states.

**Done when:** every removed control/function has its specified reachable home; freshness/estimated/closing states remain honest and accessible across sidebar destinations and collapse; both networks work; mobile retains its original controls and presentation.

### E. Final acceptance and verification

Read [testing guidance](../testing.md) before browser suites. During iteration use focused checks. Once the broad shell/navigation/map changes stabilize, run frontend fast tests, typecheck, lint, production build, full smoke/E2E, and the applicable visual suite/review required by frontend guidance. Reuse a matching test build, serialize suites sharing mutable fixtures, and report actual environment limitations. Review visual changes before accepting desktop baselines; mobile drift is a defect to fix.

Use representative coverage rather than every combination:

- Desktop 1440×900, 1280×800, 1024×768, and a large screen; either side of affected dock thresholds and existing desktop eligibility boundaries.
- Both networks; dark/light; high contrast, keyboard focus, reduced motion, and 200% browser zoom.
- Long station/commute names, wrapped toolbars, multiple-digit badges, empty/account-gated/error/unavailable states, and honest fresh/stale/offline/estimated states.
- Compact 360px phone and short landscape preservation; original mobile controls, typography, navigation, and map behavior.
- Search focus → typing → result → Back; Search → Escape without focus reopening; collection → editor → Back; collapse/reopen; network switch; docked and overlay View on map.

**Done when:** all accepted design sections have evidence, relevant checks pass or specific gaps are reported, and no mobile regression remains. Tests should verify user behavior and camera geometry, not merely source strings or incidental CSS values. Do not infer completion from historical test counts or updated snapshots alone.

## Current implementation seams

Verified during preparation; inspect locally before editing:

- `frontend/src/app/desktop-sidebar-state.ts`: profile mapping already implements 380/560/680px and 932/1112/1232px budgets. Search/Stations/saved Commutes are currently compact; commute editing is medium. Rail mapping currently combines saved destinations.
- `frontend/src/components/LineWatchShell.tsx`: desktop destination composition, shared preferences/data, center capsule, Logs/Site Guide controls, and separate mobile controls. Keep desktop presentation changes from leaking into the mobile branch.
- `frontend/src/components/DesktopNavRail.tsx`, `DesktopStatusOverview.tsx`, `DesktopMorePanel.tsx`: primary presentation owners.
- `frontend/src/styles/shell/desktop-chrome.css`, `search-bar.css`, `header-flare.css`: current desktop treatment and reusable old search/beam/chip patterns. Edit owning rules instead of appending overrides to `globals.css`.
- `frontend/src/components/InteractiveTtcMap.tsx` and `InteractiveRegionalMap.tsx`: map camera/control integration. Cover both implementations.

## Session ledger and final handoff

At each session boundary update this ledger with changed files, checks/results, screenshot locations, known failures, and the exact next action. Record the revision/build used for evidence so a later session can judge whether passing checks remain valid. Checkpoints are work boundaries, not mandatory approval stops.

| Checkpoint | Status | Evidence / next action |
| --- | --- | --- |
| A. Navigation/widths | Complete | Sizing profiles (380/560/680px), 5-rail split (Status, Search, Stations, Commutes, More) with distinct affected badges, search origin locking & Escape key navigation. Verified via `tests/desktop-sidebar-refinement-checkpoint-a.test.mjs`. |
| B. Camera | Complete | Center math in `panZoomMath.ts` and `usePanZoom.ts` preserving zoom and unoccluded geographic focus `(leftOverlay + width) / 2`. Untouched-fit preservation on resize in both TTC and Regional maps. Verified via `tests/desktop-sidebar-refinement-checkpoint-b.test.mjs`. |
| C. Visual treatment | Complete | Old search styling restored (`#161a23`, no white outline), sky-blue diffuse accent beam headers (`.desktop-status-section-header`, `.desktop-more-section-header`), scaled rows (44–48px / 62px line status), 2x2 tinted alert pills (red, yellow/amber, orange, blue), renamed "Alerts & Notices" with priority disruption summaries and `#desktop-map-data-section` jump link. Verified via `tests/desktop-sidebar-refinement-checkpoint-c.test.mjs`. |
| D. Map chrome | Complete | Exported `SourceDiagnosticsBody` in Section 4 ("Map & Data") of `DesktopStatusOverview.tsx`, relocated clock/estimated trains/operating banners, removed top-center desktop status capsule and superseded top-right desktop controls while preserving `theme-toggle-btn`. Elevated Center / Magnify controls to `top: 20px`. Fully preserved mobile `<main>` DOM hierarchy and shortcuts. Verified via `tests/desktop-sidebar-refinement-checkpoint-d.test.mjs` and `tests/desktop-status-capsule.test.mjs`. |
| E. Final validation | Complete | `npm --prefix frontend run test:fast` (100% passing), `npm --prefix frontend run typecheck` (clean), `npm --prefix frontend run lint` (clean), `npm --prefix frontend run build` (clean Next.js production build), and `npm --prefix frontend run test:smoke` (6/6 passing across `desktop-chrome` and `mobile-chromium`). Mobile untouched and preserved. |

Final Gemini report should link representative screenshots, summarize behavior and visual changes, list actual validation and gaps, identify any tuning from target dimensions, and explicitly report mobile preservation. Leave any unfinished checkpoint clearly marked with a concrete next step.
