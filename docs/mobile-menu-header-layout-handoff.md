# Mobile menu headers and layouts: Gemini implementation handoff

Prepared 2026-09-10. This is an implementation prompt and design brief; application changes have not been made as part of this handoff.

## Task

Refine the mobile web/PWA menu headers and content layouts in `frontend/`. The user is finishing an existing mobile refactor and wants larger, cleaner, consistent headers, fewer separators, properly centered content containers, and a coherent three-tone surface hierarchy. Apply the same design language to TTC and GO/UP.

Read `../AGENTS.md` (relative to this document) and inspect the current working tree first. Many frontend files already contain uncommitted mobile-refactor work. Preserve those changes and build on the current checkout. Do not reset files or replace existing work with an older committed version. This task concerns the Next.js responsive dashboard, not the separate Expo app in `mobile/`.

Implement a reviewable first pass, then validate the finished change according to repository policy. Do not deploy, commit, alter backend contracts, or redesign map behavior as part of this task.

## Visual direction and screenshot context

The user's station-detail example shows an Ossington sheet: a small “Station” label, a prominent station name, discrete Save and Close buttons, spacious alignment, and dark neutral surfaces. Borrow that hierarchy and calm spacing for menu headers. Its 32px station title is a reference for prominence, not a required size for all menu titles.

The System Status example has a visible horizontal rule directly under its header. Remove that decorative separation. The Reduced Speed Zones and Streetcar & Bus Notices examples squeeze titles beside small source/count labels; reclaim title space instead of making every element tiny. The final example shows a filter console above an alert list: that is an appropriate place for one subtle functional divider.

Suggested design decisions below are starting values to verify in the actual browser, not pixel measurements from the screenshots.

## Header contract

Use a consistent hierarchy across top-level menus and nested panels:

1. Optional existing network/context kicker, when it conveys useful information.
2. Primary row: Back where applicable, category icon where useful, a single-line title, and Close.
3. Secondary metadata row for counts, source attribution, freshness, or account context when applicable.
4. Search/filter controls where applicable, followed by the content area.

Keep the **title** on one line at ordinary text sizes. The entire header does not need to occupy one row. Moving metadata below the title is the preferred way to preserve a large heading and readable attribution. Use the same metadata placement for comparable menus so headers do not jump around when counts change. Do not add empty metadata rows to menus with no metadata.

- Start with a shared 22px title, weight 750–800 using the existing font, tight but readable tracking, and approximately 1.2 line height.
- Use a small explicit compact variant, approximately 18–20px, only where the longest titles cannot fit after metadata is moved. Evaluate at 320px first. Avoid a different arbitrary size for each menu.
- If the category icon prevents a long title fitting, move it to the metadata row or omit the redundant decorative icon consistently for that header variant before making the title unreadably small.
- Preserve full labels such as “Reduced Speed Zones,” “Streetcar & Bus Notices,” and “Accessibility Outages.” Do not silently abbreviate them, clip them, use a marquee, or apply horizontal scaling.
- Keep source/count text approximately 11–12px and readable. Compact badge padding before reducing text size. Long metadata can wrap in its own row; preserve source and freshness meaning.
- Keep Back and Close hit areas at least 44×44px, with 18–20px glyphs and consistent subtle neutral button surfaces. Visible glyph size must not determine touch-target size.
- Titles are left-aligned. Do not center the title independently of the header layout. Keep heading and body alignment deliberate when a Back button adds a leading column.
- Preserve semantic headings, accessible names, visible keyboard focus, and Back/Close behavior. Decorative icons should be hidden from assistive technology.
- At enlarged accessibility text/zoom, allow a deliberate wrapping fallback if necessary to prevent lost text or inaccessible controls. The one-line target applies to default text sizing, not forced clipping at every scale.

Prefer named layout slots/classes over selectors such as `.panel-heading > div:last-child`. A small shared header component is appropriate if it fits the existing panel APIs without unnecessary churn; otherwise establish shared classes and consistent markup. Keep the station-detail header's existing station-name wrapping and actions intact.

## Dividers, spacing, and centering

- Remove decorative rules directly below menu titles, including System Status and nested panel headers. Use spacing and surface hierarchy for continuity.
- Keep a single low-contrast divider where fixed search/filter controls meet a scrolling result list. Avoid stacked borders from both the toolbar and list.
- Preserve necessary form/group boundaries and high-contrast affordances. Do not globally remove every border or focus outline.
- Use one shared mobile horizontal gutter: start at 16px, with 12px at narrow widths if needed. Header, metadata, toolbar, tabs, cards, and empty states should respect the same content grid.
- Center the content **container** within the full-width sheet; keep card text left-aligned. At phone widths lists should fill the available content width. Any justified maximum width at larger sizes needs equal automatic inline margins.
- Audit cumulative padding through shell, panel, body, and list. Remove obsolete desktop offsets or duplicate mobile padding at the owning layer. Do not compensate with arbitrary `translateX` values or per-menu negative margins.
- Check scrollbar space and safe-area insets before attributing an apparent offset to padding. Measure left/right gutters relative to the usable scroll viewport.
- Keep comfortable but dense spacing: roughly 12–16px between major blocks and 8–12px between cards. Respect the repository's maximum 8px card radius; retain existing rounded sheet corners.
- Keep scrolling owned by the existing intended content region. Preserve sticky controls, dropdown portals, bottom-nav clearance, keyboard behavior, and the ability to reach the final item without a large artificial blank tail.

## Three-tone surfaces

Use existing theme tokens and inspect their computed values before introducing anything new:

| Role | Intended treatment |
| --- | --- |
| Pull-up sheet and header | Darkest neutral application surface, visually continuous |
| Bottom navigation | Distinct dark grey, one step above the sheet |
| Front-page action buttons and raised controls/cards | Lighter neutral grey, clearly actionable/readable |

Start with existing `--panel`, `--panel-opaque`, `--panel-soft`, text, border, and mobile chrome tokens. If their current roles cannot express the hierarchy, introduce a small set of semantic aliases with light and high-contrast equivalents. Avoid scattered hard-coded greys, new glass effects, or decorative gradients. Preserve semantic TTC/GO route colors, impact colors, and existing selected-state accents.

Do not increase the current subsection glow/flare. Quiet title chrome, consistent gutters, and readable metadata should do the work. Existing subsection accents may stay; this is not a request to remove all authored visual identity.

## Saved versus My Stations icon

Keep the bottom-nav **Saved** bookmark. Use the existing Lucide **MapPin** for **My Stations** as a destination/category icon: Saved section selector, My Stations heading, More/account shortcuts, and equivalent navigation entry points.

Keep bookmark icons for the actual Save/Saved action on station detail and other save/remove controls. Those describe an action/state, while the pin identifies the station collection. Do not replace bookmarks globally. Keep My Commutes' route identity and all badge count logic unchanged.

## Files to inspect

All paths below are relative to the repository root. Treat this as a starting inventory; check other reachable menus before declaring coverage complete.

| Area | Files and useful anchors |
| --- | --- |
| Shared shell/navigation | `frontend/src/components/LineWatchShell.tsx` (`mobile-view-content-wrapper`, `mobile-saved-sections`, My Stations shortcuts), `FloatingPanelShell.tsx`, `MobileBottomNav.tsx`, `MobileSheetDragHandle.tsx` in the same component directory |
| Main mobile menus | `frontend/src/components/MobileStatusSheet.tsx`, `MobileMoreSheet.tsx` |
| Impact lists | `frontend/src/components/ActiveAlertsPanel.tsx`, `DelaysPanel.tsx`, `ReducedSpeedZonesPanel.tsx`, `PlannedClosuresPanel.tsx`, `LineImpactsPanel.tsx`, `ImpactListToolbar.tsx` |
| Other data menus | `frontend/src/components/AccessibilityOutagesPanel.tsx`, `SurfaceNoticesPanel.tsx` (including regional views), `AlertHistoryPanel.tsx`, `ReliabilityPanel.tsx`, `StationSearchPanel.tsx` |
| Saved/account | `frontend/src/components/MyStationsPanel.tsx`, `SavedCommutesPanel.tsx`, `NotificationSettingsPanel.tsx`; also inspect settings, feedback, release notes, and privacy panels reached from More |
| Visual reference | `frontend/src/components/StationDetailHeader.tsx`, `StationDetailPanel.tsx`, `RegionalStationDetailPanel.tsx` |
| Mobile layout cascade | `frontend/src/styles/shell/mobile-sheets.css`, `mobile-chrome.css`, `mobile-landscape.css`, `responsive-density.css`, `floating-panels.css`, `current-service.css` |
| Per-feature layout | `frontend/src/styles/account/my-stations.css`, `saved-commutes.css`, `notification-settings.css`; `frontend/src/styles/panels/` and `frontend/src/styles/station/station-detail.css` |
| Theme and late overrides | `frontend/src/styles/foundation/tokens.css`, `themes.css`, `high-contrast.css`; `frontend/src/styles/shell/header-flare.css`, `card-elevation.css`; import order in `frontend/src/app/globals.css` |

Observed issues in the current source:

- Around the `.floating-panel-shell .panel-heading` block in `mobile-sheets.css`, the normal title is capped at 18px and view-specific overrides reduce several long titles to approximately 12–15px.
- The same block permits source labels as small as 5.5px and reduces header buttons to 24×24px. Replace these compromises with the header contract above.
- Metadata alignment relies on first/last-child selectors and several view-specific overrides. Consolidate obsolete rules instead of layering more exceptions over them.
- `StationDetailHeader.tsx` already provides the requested title prominence and 44px close-control reference.
- `MobileBottomNav.tsx` uses Bookmark for Saved, and `LineWatchShell.tsx` also uses Bookmark for the My Stations selector.
- Content centering is user-reported; the exact cause has not yet been verified in a browser. Trace the computed layout rather than assuming a particular file is responsible.

## Implementation and review sequence

1. Record the dirty working tree, read applicable guidance, and inspect header markup, CSS import order, theme tokens, and current browser layouts.
2. Build the first pass on System Status, Reduced Speed Zones, Streetcar & Bus Notices, My Stations, and My Commutes. Include the longest regional equivalents. These exercise root headers, nested headers, metadata, toolbars, tabs, and account content.
3. Apply the established pattern to the remaining reachable menus. Correct container gutters and the My Stations category icons in the same pass. Avoid changing data behavior.
4. Present representative screenshots and explain any necessary long-title exception. Do not claim a design is verified from source inspection alone.
5. Validate once stable, inspect actual diffs, and report any material remaining limitations.

## Acceptance and validation

- At 320, 360, 390, and 430 CSS px portrait widths, default-size menu titles remain fully visible on one line, controls do not overlap, and metadata is readable. Check wider mobile/tablet and landscape layouts plus desktop for leakage from shared styles.
- Header/title style is consistent across TTC and GO/UP, with only justified compact variants. Counts changing from zero to multiple digits do not squeeze titles or move controls.
- My Stations and My Commutes have equal usable left/right gutters in populated, empty, signed-out, loading/error, and add/edit states. Check Saved's section selector as well as the list below it.
- The filter/list boundary has at most one subtle separator. Header-only rules are gone. High-contrast mode and keyboard focus remain clear.
- Back, Close, Saved switching, station selection, show-on-map, list scrolling, filter dropdowns, and bottom navigation still work. Preserve scroll restoration and existing sheet/drag behavior.
- Check dark, light, high-contrast, reduced-motion, and enlarged-text cases. Do not make tiny fonts or hidden overflow the accessibility strategy.
- During iteration, use focused browser inspections and the smallest useful checks. For a finished TSX change, run frontend `test:fast`, `typecheck`, and `lint` per AGENTS.md. Run `test:visual` for this shared styling pass and inspect differences before updating any baselines.
- Relevant existing coverage includes `frontend/tests/smoke/mobile-service-sheet.spec.ts`, `mobile-app-layout.spec.ts`, `compact-mobile.spec.ts`, and `visual-baselines.spec.ts`; source-level checks include `mobile-bottom-sheet-ux.test.mjs`, `small-mobile-layout.test.mjs`, `station-panel-layout.test.mjs`, and `my-stations-ui.test.mjs`. Use the repository Playwright configuration and run suites sharing stub services serially.
- Add focused browser regression coverage for meaningful layout requirements: longest-title fit, equal gutters, and accessible header actions. Avoid brittle tests that merely search CSS source for new literal values.
- Follow AGENTS.md for broader smoke/E2E if shared navigation or shell behavior changes, and production build if integration boundaries change. Do not run backend/native suites for this frontend presentation task.

Final implementation report: summarize visual changes, provide representative before/after screenshots, identify any compact-title exceptions, list actual verification results, and distinguish unverified areas. Preserve source-honest labels and all existing product boundaries.
