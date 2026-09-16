# Desktop sidebar redesign: Gemini implementation handoff

Prepared 2026-09-16 for Gemini 3.8 Flash. All fifteen design recommendations were accepted by the user across three interview rounds. This document specifies implementation; no application changes were made during planning.

## Objective and scope

Replace the floating desktop dashboard chrome and bottom service sheet with a persistent navigation rail, an expandable content sidebar, and an interactive map workspace. Open the sidebar to Status by default. Follow the responsive web mobile redesign's visual language and the supplied Google Maps/TTC LiveMap screenshots' desktop organization. The map and usable service information remain the product's first viewport.

Implement the entire desktop shell and every panel reached within the map workspace. Make secondary account/settings entry points consistent; preserve deeper account forms and their behavior. Preserve the responsive mobile experience, both networks, existing capabilities, source labels, and saved preferences unless explicitly superseded below. Do not introduce new data providers, map assets, routing capabilities, dependencies without justification, or backend changes.

The screenshots supplied in the planning conversation illustrate a persistent narrow rail, an optional adjacent content panel, and a map occupying the remaining workspace. They are structural references, not pixel specifications or permission to copy branding. The requirements below stand alone if those attachments are unavailable.

Read [root guidance](../../AGENTS.md) and [frontend guidance](../../frontend/AGENTS.md) before editing. Inspect the working tree and preserve unrelated changes. At planning time, existing edits included ImpactCardFields.tsx, OverlappingCountBadge.tsx, ReducedSpeedZonesPanel.tsx, panels/alerts.css, alert-list-view.test.mjs, and overlapping-count-badges.spec.ts. Recheck rather than assuming that inventory is still current. Do not reset or overwrite user work. No commit or deployment is requested.

## Agreed design

| Decision | Contract |
| --- | --- |
| Persistent navigation | Always-mounted desktop rail with icons and short labels: Status, Search, Saved, More. Explicit expand/collapse action at its top. |
| Default | Expanded Status overview on an ordinary first visit. Honor an explicitly saved desktop collapse preference on subsequent ordinary visits. |
| Collapse | Hide content only; retain rail and interactive map. Preserve current panel, filters, scroll, and unsaved form state. Reopen to that same state within the session. |
| Navigation | One content panel. Station/impact details replace panel contents. Back restores the originating view and its state. No second detail column. |
| Search | Persistent search field above expanded sidebar content. Results occupy the same panel; dismissal restores the previous view. Rail Search opens and focuses it. |
| Saved | My Stations and My Commutes grouped under Saved, retaining existing account and network rules. |
| Map | Interactive beside every sidebar section. No separate desktop Map destination is needed. |
| Visual language | Existing mobile typography, theme tokens, shared headers, route badges, icons, and restrained surface hierarchy. Deliberate light, dark, and high-contrast states. |
| Width | Responsive fixed width, initially about 380px content plus 64–72px rail, content narrowing toward 320px at smaller desktop sizes. No drag resizing. |
| Narrow desktop | Dock only when at least 480px map width remains. Otherwise content overlays the map beside the rail, without dimming or blocking the exposed map. |
| Mobile | Retain current mobile/short-landscape eligibility and presentation. This is a responsive web task, not the Expo app. |
| Camera | Automatic overview refits to available space. User-adjusted center and zoom survive sidebar resizing. Selection reveals its target. Explicit recenter restores network overview. |
| Network changes | Preserve equivalent top-level section. Clear network-specific search/filter context; station/impact detail returns to destination network Status. Restore each network's camera preference. |
| History | Collapse is layout, not navigation. Back traverses content. Explicit detail links reveal their destination despite a collapsed preference. |
| Delivery | Three checkpoints: shell/camera; content/navigation migration; responsive/accessibility polish and final verification. |

## Layout contract

Expanded, docked desktop:

```text
+--------+---------------------------+-----------------------------------+
| Toggle | TTC / GO & UP              | Map display controls + freshness  |
|        | Search stations…           |                                   |
| Status |---------------------------|                                   |
| Search | Panel header / Back        |                                   |
| Saved  | Metadata / filters         |        Interactive map            |
| More   |                           |                                   |
|        | Scrolling panel content    |                                   |
|        |                           |                   Legend / camera |
+--------+---------------------------+-----------------------------------+
```

Collapsed: rail remains; the map takes all remaining width. Narrow expanded desktop: map remains sized to the viewport minus rail; the content panel overlays its left portion. Measure that occlusion for fit and selection focus. Do not subtract the overlay width twice.

Use a real grid/flex allocation for docked rail, panel, and map. Give shrinkable containers `min-width: 0` and appropriate height/overflow ownership. Do not simulate the dock by translating a viewport-sized map or layering new offsets over old offsets. Map panning is intentional; page-level horizontal overflow is not.

The threshold is a layout budget, not a new mobile detection rule: rail + chosen content width + 480px must fit to dock. Start with a 72px rail and 380px content, reduce content toward 320px as needed, and overlay below the budget. Verify both sides of the resulting boundary. Dimensions are engineering starting values to tune in-browser while retaining the agreed minimum map budget and readable content.

Sidebar header remains visible while content scrolls. Each panel has a deliberate main scroll region; preserve filters/sticky toolbars where useful and avoid competing nested scrollbars. Long forms must remain usable within sidebar width. Expandable sections and wrapping are preferable to clipped labels or tiny text. Existing authentication/confirmation dialogs may remain modal; ordinary navigation, search, and map details belong in the sidebar.

## Navigation and state rules

Separate layout state from content navigation and map activity. A desktop panel being open must not make the map inactive. Keep shared data, account, selection, and navigation ownership rather than constructing a second desktop application with independent fetches.

| Action | Required result |
| --- | --- |
| Ordinary fresh entry | Resolve existing network preference, show Status, apply saved desktop expansion preference; expanded if none. Do not restore an old detail screen. |
| Direct destination link | Resolve existing link/network semantics, display its destination, expand when needed to reveal it. Preserve direct links to existing supported panels. |
| Collapse / expand | No browser-history entry; preserve current content and drafts. Return focus to the toggle when hiding the focused content. |
| Select rail destination | Open panel if collapsed; navigate to that section. Selecting the active section does not act as an implicit collapse. |
| Select station or impact on map | Open relevant detail in the same panel, retain a meaningful origin for Back, reveal map target. |
| Back from detail | Restore origin, filters, scroll, and existing selection-clear behavior without an unnecessary camera reset. |
| Search activation | Open results in panel; retain origin. Avoid one history entry per keystroke. |
| Search dismissal | Restore origin and preserve camera; prevent an outside map click from accidentally clearing an intended map selection. |
| Network switch | Preserve top-level Status/Search/Saved/More context; clear network-specific query/filter/selection state. Detail falls back to new network Status. |
| Browser Back / Forward | Reconcile content and map selection using existing history semantics. Do not replay collapse toggles. |
| Breakpoint transition | Preserve logical destination and drafts; only active presentation is focusable. A mobile drag/sheet action must not overwrite desktop collapse preference. |

For subordinate views on a network change, use their corresponding root: status categories → Status, saved detail → Saved, secondary settings → More. Keep supported network-neutral settings state; never carry a TTC-only selection into GO/UP. Preserve account-wide saved collection behavior and existing cross-network saved-item activation rules.

Persist explicit desktop expansion choices independently of transient reveals: opening a linked station or clicking Search should not silently rewrite a user's durable collapsed preference. Ignore the old floating-menu pin preference for the new default unless there is a demonstrated compatible migration; `linewatch-menu-pinned` represented a different UI. Storage failures must fall back to usable expanded Status. Do not persist sensitive forms or search text as part of this layout preference.

“Always mounted” means the rail/sidebar container remains stable. Preserve active content state across collapse through retained content or lifted state; do not eagerly mount every feature panel or create duplicate subscriptions. Hidden content must be inert/nonfocusable and absent from the accessible reading order. Ensure only one active desktop/mobile presentation owns live controls.

## Content and control migration inventory

| Existing UI | Destination / treatment |
| --- | --- |
| Floating desktop menu and pin control | Retire desktop presentation; rail plus More supply destinations, explicit toggle controls sidebar. |
| Desktop Current Service bottom sheet | Remove desktop sheet/drag presentation; service overview becomes Status content. Preserve mobile sheet. |
| Bottom-left alert-category chips | Integrate counts and category navigation into Status; remove duplicate desktop chips. Preserve count semantics. |
| Global search and floating results | Search field in sidebar header, results in panel. Rail Search remains visible collapsed. |
| Status / line summaries | Shared content for desktop Status; no dependency on mobile sheet layout. |
| Alerts, delays, Reduced Speed Zones, closures | Sidebar category lists and detail navigation, preserving filters and source context. |
| Accessibility outages, surface notices, service notices | Status-related destinations with existing network capabilities; do not promote these into service-impact counts. |
| TTC and regional station detail panels | Sidebar detail presentation, including all current station actions, arrivals, source states, and notices. |
| Selected-impact inspector / cards | Sidebar details for desktop; keep map anchoring/highlight and mobile inspector behavior. |
| My Stations / My Commutes | Saved section selector with existing icon/action distinctions and add/edit flows. |
| Notifications, account/preferences, feedback, privacy, release notes | More and its subviews; retain necessary modal authentication/confirmation flows. |
| Reliability / analytics and alert history | More destinations, retaining network-specific scope and honest coverage. |
| TTC / GO & UP switch | Sidebar header. Collapsed rail can be expanded to access it; no duplicate network switch. |
| Source/freshness capsule | Compact map-visible status indicator plus detailed context in Status/feature panels. Do not hide degraded state behind expansion. |
| Estimated train / applicable display controls | Small map toolbar; preserve independent availability gates and selected-state dimensions. |
| Theme and appearance preferences | More. Preserve current persistence and high-contrast/reduced-motion support. |
| Legend | Bottom-right expandable control, initially closed; retain applicable symbols/labels and source attribution. |
| Zoom / recenter | Bottom-right map controls, separated from legend popover overlap. Keep explicit camera controls accessible. |
| Closed-hours, offline, loading, errors, install notices | Retain existing semantics and actions; accommodate within new shell without recreating obsolete desktop overlays. |
| Commute preview | Keep map path preview and its actions working beside sidebar editing/detail content. |

Audit every `ActiveView` branch and separately rendered station/selection UI against this table. No reachable feature may disappear because it was absent from the old floating-panel renderer.

Terminology: current code uses network selection as “Default Map”/map mode (TTC versus GO/UP). Do not invent a second map-mode toggle or a geographic basemap. Retain any actual independent display controls found in the implementation. `rotated-landscape` is a separate mobile presentation and remains unchanged.

## Status overview

Use a compact service dashboard, not a full-length alert feed or decorative landing page:

1. Network service summary with source/freshness context and explicit degraded/unavailable state.
2. A short list of the highest-priority current disruptions with access to the full list. Start with at most three, using existing ordering/severity logic rather than inventing incident scoring.
3. Category counts/links, clearly separating current service impacts, planned work, and informational collections.
4. Line-status rows leading to line details/impacts and station browsing through existing paths.

Keep critical summary and at least the beginning of actionable content visible at ordinary desktop heights. Do not infer “good service” from empty unavailable data. Planned work stays distinct from active disruptions. Existing deduplication, cancellation, accessibility, surface-notice, and notice exclusions still apply. Read the affected [domain invariants](../domain-invariants.md); this is presentation reorganization, not authorization to change source semantics.

## Camera and geometry contract

Apply to TTC and GO/UP. Map geometry is authored schematic content: preserve root coordinates, station anchors, overlays, route identity, and existing zoom constraints. See [map asset contract](../ttc-map-asset-contract.md). No asset regeneration is expected for this shell change.

| Camera state | Sidebar/layout change |
| --- | --- |
| Untouched automatic overview | Recompute fit using the actual usable map rectangle, center within it, include existing safe margins. |
| User panned/zoomed or restored saved camera | Preserve map-space center and zoom; account for changed viewport dimensions rather than keeping stale screen translation. No automatic overview reset. |
| Selection focus | Reveal target in usable map area without unnecessarily zooming out; later manual pan takes precedence over automatic tracking. |
| Commute preview | Preserve existing preview behavior; keep relevant path visible when auto-fitting and honor subsequent user camera adjustments. |
| Explicit recenter | Fit current network overview to currently usable area and return to automatic overview behavior. |
| Network switch | Restore destination network's valid saved camera under existing preference rules; otherwise fit its overview. Never reuse another network's coordinates. |

Docked sidebar consumes layout width, not map occlusion padding. Narrow overlay sidebar consumes occlusion inside the map rectangle. Toolbar/legend occlusion must also be accounted for once, using actual bounds where needed. Avoid repeated fits during animation, jitter, or feedback loops between resizing, focus, and viewport persistence. Coalesce layout updates and respect active gesture deferral/reduced motion.

Do not let a resize-driven fit overwrite the user's stored manual camera. Dismissing search, collapsing content, or navigating lists must not remount the map or reset its camera. Keep existing intentionally network-specific map lifecycle where required.

## Architecture and files to inspect

Paths below are relative to repository root. Source inspection established these seams; recheck current code before editing.

| Owner | Implementation responsibility |
| --- | --- |
| `frontend/src/components/LineWatchShell.tsx` | Shared state/navigation, desktop shell composition, search, account actions, controls, station/impact routing. Inventory `ActiveView`, `renderPanelContent`, separate station renders, and desktop Current Service. |
| `frontend/src/components/MobileStatusSheet.tsx` | Reusable network-aware status content. Extract content from mobile presentation as needed; desktop must not inherit drag/sheet wrappers. |
| `frontend/src/components/MobileMoreSheet.tsx`, `MobileBottomNav.tsx` | Existing organization and secondary destinations; preserve mobile contracts. |
| `frontend/src/components/FloatingPanelShell.tsx`, `PanelHeader.tsx`, `StationDetailHeader.tsx` | Shared panel content/header semantics; supply desktop presentation without stacking floating-position offsets. |
| `frontend/src/components/StationDetailPanel.tsx`, `RegionalStationDetailPanel.tsx` | Station content currently outside common floating-panel navigation; explicitly integrate. |
| `frontend/src/components/NetworkMap.tsx`, `NetworkMapLegends.tsx` | Map composition, activity propagation, legend placement/disclosure. |
| `frontend/src/components/InteractiveTtcMap.tsx`, `InteractiveRegionalMap.tsx` | Replace legacy occluder assumptions, container measurements, selection focus and fit. |
| `frontend/src/hooks/usePanZoom.ts`, `useMapViewportPersistence.ts` | Center/scale preservation, resize reconciliation, saved camera behavior. |
| `frontend/src/app/view-navigation.ts` | Existing navigation stack semantics and Back resolution; extend behavior deliberately. |
| `frontend/src/styles/shell/` | Owning desktop-chrome, floating-panels, dashboard-shell, current-service, search-bar, map-controls, responsive-density files. Remove superseded desktop rules. |
| `frontend/src/styles/foundation/` and feature styles | Existing tokens/themes, high contrast, sidebar content adaptation. |
| `frontend/src/app/globals.css` | Import manifest only; do not append a pile of overrides. |

Known traps:

- Desktop currently does not render the mobile Status content and redirects desktop Status links to the menu. Implement a real desktop Status destination.
- Current map fit/focus logic measures floating menu/search/station panels and bottom chips. Leaving those assumptions after shrinking the container produces incorrect double offsets.
- `desktopMenuPinned` and `layoutResetSignal` affect map reconciliation. Replace desktop pin semantics deliberately without disturbing mobile behavior.
- Map activity currently depends on `activeView === "map"` in shell logic. An open Status/Search/Saved/More sidebar must not disable map input or geometry reconciliation.
- Current mobile eligibility is `(max-width: 767px), (orientation: landscape) and (max-height: 520px)`. Coarse-pointer performance mode is a separate concern. Preserve these distinctions.
- Existing panels can assume widths near 680px and pinned-menu offsets near 400px. Audit forms, list toolbars, dropdown portals, and sticky actions for the new content width.

Prefer a small desktop shell/presentation component and shared content seams over further enlarging the monolithic shell. Keep navigation transitions explicit and testable. Do not couple feature content to a particular sheet or sidebar position. Exact component names and internal state types are implementation choices; preserve established architecture where it already meets the contract.

## Visual and accessibility contract

Use [mobile header/layout handoff](../mobile-menu-header-layout-handoff.md) as visual background, confirmed against current code. The similarly named Expo implementation handoff is not this project's responsive-web design reference.

- Rail: compact neutral surface, clear selected state, existing icons with readable short labels; no hover-only navigation.
- Content: calm panel surface; raised controls/cards one step above it, cards at most 8px radius. Keep route colors and impact colors authoritative.
- Reuse shared header typography (approximately 22px), metadata rows, 44px action targets, 12–16px gutters, and existing authored badges.
- Back belongs to content history. Expand/collapse belongs to shell layout. Avoid multiple ambiguous X buttons that could mean clear selection, close search, or collapse everything.
- Expanded sidebar is nonmodal, including the narrow overlay variant: no global focus trap, dimmed backdrop, or inert exposed map. Real dialogs retain their existing modal semantics.
- Rail controls expose accessible names and current section. Toggle exposes `aria-expanded` and its controlled region. Search input is labeled; loading/results and empty states remain understandable to assistive technology.
- Keyboard users can reach sidebar and map controls in a predictable order. Selection initiated through a detail-opening action should expose a meaningful detail heading; live polls must not steal focus.
- Preserve visible focus, high contrast, reduced motion, 200% zoom/reflow, and enlarged text. Tooltips supplement visible labels; do not replace them.
- Legend disclosure does not cover zoom/recenter controls or extend outside the usable viewport. Close/escape behavior must not accidentally navigate away from sidebar content.

## Implementation checkpoints

### 1. Shell and camera

Record current layouts and navigation; establish desktop rail/content/map allocation and collapse preference. Make Status the desktop root and maintain interactive map activity. Implement dock/overlay transition and replace legacy camera offsets for both networks. Verify automatic fit, manual camera preservation, and network switching before broad content migration.

### 2. Content and navigation migration

Move all inventory items into sidebar/shared content adapters. Wire Search, Saved, More, details, Back/Forward, deep links, authentication returns, and network transitions. Preserve form drafts and scroll across collapse. Retire desktop bottom sheet, floating menu, duplicate chips, and obsolete panel positioning. Preserve mobile wrappers and paths. Confirm no destination is lost.

### 3. Polish and verification

Tune widths, typography, scroll behavior, light/dark/high-contrast states, narrow overlay behavior, keyboard operation, and source-visible map controls. Check mobile leakage. Run final appropriate checks once stable and provide representative screenshots and a concise report of actual results.

These are implementation checkpoints, not repeated permission gates. Deliver the complete agreed scope. Use focused browser checks during iteration rather than rebuilding/running every suite after each adjustment.

## Acceptance and regression coverage

Test observable behavior, not new CSS literals or component names. Update obsolete tests to the new contract; do not remove coverage merely because desktop sheet selectors disappeared.

| Scenario | Acceptance |
| --- | --- |
| First visit / reload | Expanded Status by default; explicit collapsed preference survives reload; direct detail links still show destination. |
| Collapse from search/form/detail | Reopen restores query/draft/detail/scroll; hidden controls cannot receive focus; no added history entry. |
| Navigation | Rail, nested Back, browser Back/Forward, saved-item activation, and account return paths resolve coherently. |
| Search | Rail opens/focuses; results remain accessible; dismissal restores origin and user camera. |
| Selection | Map station/impact opens matching sidebar details in either network, including from collapsed state. |
| Map geometry | Overview centers in usable area; no clipping/double inset. User pan/zoom survives expansion, collapse, and ordinary content changes. |
| Network switch | Correct root/detail fallback and per-network camera; no stale query, selection, unsupported control, or false data claim. |
| Narrow desktop | Correct dock/overlay transition; exposed map interactive; no backdrop/page overflow; sidebar content reachable. |
| Source states | Fixture, loading, failed/stale, offline, closed hours, and unavailable arrivals/markers remain honest and usable. |
| Saved/account | Signed-out, empty, populated, editing, saving/error, and notification states preserve behavior. |
| Mobile | Existing bottom navigation, sheets, compact controls, selection, search, rotation, and camera gestures remain intact. |

Inspect at 1440×900 and a large desktop; include 1280×800, 1024×768, a narrow desktop near 820px, compact 360px phone, both sides of 767/768px, both sides of the computed dock/overlay boundary, and short landscape around the existing 520px-height rule. Cross these with both networks, expanded/collapsed states, light/dark, relevant high-contrast/reduced-motion states, and zoomed text. Use representative coverage rather than blindly multiplying every combination.

Existing regression starting points include `view-navigation.test.mjs`, `desktop-service-sheet-state.test.mjs`, `narrow-desktop-layout.test.mjs`, `station-panel-layout.test.mjs`, and `map-viewport-preference.test.mjs`. Browser scenarios include map-viewport-persistence, search-close-map-position, search-close-panned-map, search-service-overlap, account-view-transitions, current-service, vertical-centering-and-switch, mobile-app-layout, and visual-baselines. Confirm exact current files before modifying them.

Read [testing guide](../testing.md). For this broad shell/navigation/shared styling change, final validation includes frontend `test:fast`, `typecheck`, `lint`, production build, full smoke/E2E, and visual review under repository policy. Reuse a correctly configured test build; run suites sharing mutable stubs serially. Respect documented local WebKit platform limitations and report CI/environment gaps. No unrelated backend or Expo suite is required absent changes there.

Provide screenshots demonstrating overview, collapsed rail, station/impact detail, search, Saved editing, and narrow overlay, covering both networks and themes across the set. Review visual diffs before updating baselines. Report what changed, actual checks/results, and any remaining limitations. Never claim browser verification from source inspection alone.

## Planning verification

This handoff is based on repository inspection and the user's accepted design decisions. It has not been implemented or browser-validated. Initial dimensions and overview item count are bounded engineering defaults to verify during implementation; the interaction, scope, persistence, and camera contracts are agreed requirements.
