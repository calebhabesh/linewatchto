# Desktop sidebar polish: Gemini implementation handoff

Prepared for Gemini 3.8 Flash on 2026-09-16. The user accepted all ten recommendations across three interview rounds and confirmed shared understanding. Implement this pass; no further design approval is needed for routine execution. This handoff itself changes no application code.

## Objective and precedence

Make the desktop dashboard and every desktop destination visually coherent, readable, and appropriately sized. Retain the rail/sidebar/map architecture. Borrow the old menu's polished navigation rows and the existing wide Planned Closures panel's content hierarchy.

This document supersedes the fixed-width, always-visible search, and related presentation decisions in the [original desktop handoff](2026-09-16-desktop-sidebar-redesign.md). Retain its navigation, data honesty, account, accessibility, and camera contracts unless explicitly changed here. Prior reported test passes are historical results, not evidence that this polish pass is complete.

Read [root guidance](../../AGENTS.md) and [frontend guidance](../../frontend/AGENTS.md). Preserve unrelated changes. No backend, Expo, provider, map-asset, or mobile redesign work; no commit or deployment requested. Preserve responsive web mobile behavior when adapting shared components.

## Visual references, described independently of attachments

- Old menu: dark slate surface; modest brand header; small uppercase section headings with cyan accents; consistent left icons and labels; right-aligned count pills; compact horizontal line rows with authored line badges, service indicators, and chevrons.
- Current rough overview: outlined nested containers, oversized vertical line cards, inconsistent heading alignment, and poorly separated label/count text. These are defects to resolve, not reference styling.
- Cramped speed-zone panel: clipped heading, crushed filter controls, station names stacked awkwardly, crowded overlap chips, and an oversized circular map action. Expanding width alone does not excuse poor narrow-width reflow.
- Wide Planned Closures panel: restrained slate surfaces, readable title and metadata, clear route/station identity, semantic tinted overlap chips, separated information fields, and room for full descriptive copy. Reuse this hierarchy, while replacing its oversized circular map action.

Use existing tokens, fonts, authored route badges, icons, and semantic colors. Remove decorative white/gray outlines around the rail, sidebar, header, summary, and repeated overview rows. Distinguish surfaces using tone, spacing, and restrained existing elevation. Keep meaningful input boundaries, focus outlines, and high-contrast separators. Cards have radius at most 8px. Avoid nested decorative cards.

## Agreed layout and width contract

Use named destination profiles, not measurements of individual text or current API results. Polling, filters, loading, and item counts must not resize the shell.

| Profile | Initial target | Destinations |
| --- | --- | --- |
| Compact | 380px | Status, Search, More, Saved collection/navigation roots |
| Medium | 560px | Station detail, account/commute editing and substantive forms |
| Wide | 680px | Rich impact collections/details, line impacts, reliability/analytics |

Inventory every reachable desktop destination and assign a profile explicitly. Use compact for ordinary navigation, medium for substantive forms/details, and wide for rich impact fields or analytical content. Keep a collection's profile stable when switching between card/list presentations. Destinations not named above should follow these content rules; record the resulting mapping in code rather than scattering width literals through components.

For available shell width W, rail R = 72px, and target profile width P:

1. Dock when W >= R + P + 480px. Sidebar width is P; map receives remaining layout width.
2. Otherwise overlay beside the rail, without a backdrop. Sidebar width is min(P, W - R - 160px), leaving about 160px of map exposed.
3. Collapsed content consumes no sidebar width or map occlusion. Preserve the rail.
4. Preserve existing mobile eligibility, including short landscape. These formulas apply only to desktop presentation.

Initial dock thresholds are 932px, 1112px, and 1232px. Treat dimensions as browser-tuning targets, not a reason to skip inspecting content. Do not squeeze rich content down to the old 320px minimum merely to keep it docked. At 768px desktop width, medium/wide overlays have approximately 536px available. At a 1024px viewport, a wide panel overlays; at 1280px it docks with 528px remaining for the map.

Use real layout allocation for docking. Measure overlay occlusion once inside the map viewport; never subtract docked width again as occlusion. Keep the exposed map interactive. Avoid page-level horizontal overflow and retain intentional map panning.

Initially change shell width without a sliding animation. Reconcile layout and camera together without visible repeated fits. Untouched overview refits; manually adjusted map-space center and zoom survive layout changes; selection is revealed deliberately. Preserve both networks' camera preferences. Read the original camera contract before changing geometry code.

## Header, search, scrolling, and navigation

- Keep the network header stable across destinations, with one network selector. Brand/network controls must fit without collision at every profile.
- Keep the full global search field on top-level views. In subordinate detail/form/category views, Search remains available through the rail; avoid stacking it above rich panel headers.
- Give detail/subordinate views one clear Back button and a readable wrapping title. Remove redundant close controls from embedded desktop panels. The rail toggle collapses the sidebar. Preserve close behavior for genuine dialogs and mobile presentations.
- Search activation retains its origin; dismissal/Back restores the origin's profile, filters, scroll, and drafts. Do not add browser-history entries for width changes or collapse.
- Keep the shell header and panel title visible while the main content scrolls. Filters and metadata belong in that main scrolling content. Each destination has one primary vertical scrollbar; remove competing floating-panel scroll wrappers in the embedded presentation.
- Back restores the originating width and state. Collapse/reopen preserves content, filters, drafts, and scroll. Hidden content is not keyboard-focusable. Network switching and deep links retain the original navigation contract.

## Status overview

Use compact, full-width rows rather than tiles or large vertical cards:

1. Modest network service summary, with honest freshness/source and degraded states.
2. Up to three priority current disruptions using existing ordering and semantics, when present.
3. Category rows under Current disruptions, Planned work, and More service information.
4. Compact horizontal line-status rows.

Category rows have aligned leading icons, readable labels, and trailing count pills. Keep zero-count destinations available but quieter. Place alerts/delays with current disruptions, speed zones/closures with work-related navigation, and accessibility/surface notices/announcements with additional service information. Section grouping is navigation, not evidence of incident timing: retain each feature's actual active, planned, inactive, and source states. Adjust supporting labels if needed so speed zones are not implied to be universally active and closures are not implied to be universally future. Do not change counts or classify informational collections as service impacts. Read the affected [domain invariants](../domain-invariants.md) before touching this presentation logic.

Line rows borrow the old menu pattern: authored route badge, line name, restrained service indicators, trailing chevron. Show readable secondary status text where needed without converting rows into tall cards. Preserve route colors and existing accessible status descriptions. Do not infer good service from unavailable data.

Account actions remain in Saved/More. Borrow the old menu's visual treatment, not its entire destination arrangement. Ensure critical summary and the beginning of actionable information remain in the first viewport at ordinary desktop heights.

## Rich content and map actions

Preserve existing card/list choices and rich card information. Do not force every collection through an extra compact-row-to-detail navigation step.

- Use the wide profile for speed zones, closures, and similarly rich impact content.
- Reflow toolbars into intentional rows as available width narrows; keep filter labels and selected values legible. Avoid truncating the main title.
- Allow long station names and directional text to wrap. Preserve an understandable origin/destination relationship when a route pair cannot fit on one line.
- Let overlap chips wrap without colliding with title, station pair, or metadata. Preserve their activation behavior and semantic colors.
- Keep field labels subordinate to values, with a clear reading order. Reflow metadata columns when needed rather than shrinking text.
- Replace large circular View on map controls with compact labeled buttons, preserving accessible action targets.

View on map in docked mode focuses/reveals the target while retaining detail beside it. In overlay mode, it focuses/reveals the target and temporarily collapses content so the target is actually visible. Retain the detail for reopening; do not rewrite the durable collapse preference. Distinguish this transient action from explicit rail collapse. Resolve focus to a stable visible control when hiding the focused button. Reveal against the resulting usable map rectangle, avoiding a stale pre-collapse inset or duplicate camera jump.

## Code findings and implementation seams

Inspection found the following; verify against the working tree before changing it:

- `frontend/src/app/desktop-sidebar-state.ts` currently fixes content to 320–380px and a single 872px dock budget. Extend its pure layout calculation for destination profiles and per-profile thresholds.
- `frontend/src/components/LineWatchShell.tsx` applies inline width and maxWidth to the sidebar. CSS edits alone cannot implement the new sizing. Centralize profile selection alongside the active content resolver; preserve shared navigation/data ownership.
- `frontend/src/styles/shell/desktop-chrome.css` deliberately draws shell separators and nested card borders, including 10–12px radii. Replace owning rules rather than appending override piles.
- `DesktopStatusOverview.tsx` emits `desktop-status-state-pill`, while the base CSS targets `desktop-status-state-badge`; the notice modifier lacks matching styling. An empty section-bar element combined with space-between alignment pushes headings right. Repair these inconsistencies.
- Current source already contains horizontal flex rules for line rows and separated category labels/counts, unlike the rough screenshot. Verify the running build and served stylesheet first; stale assets, cascade, or incomplete loading have not been ruled out. Do not claim a root cause without reproducing it.
- Old-menu row markup remains in `LineWatchShell.tsx`; `header-flare.css` and `card-elevation.css` contain reusable section and row treatments. Reuse tokens/patterns without mounting a duplicate desktop menu.
- Outer sidebar scrolling and reused floating-panel scrolling can compete. Adapt `FloatingPanelShell`, shared headers, and owning feature styles as necessary; retain mobile wrappers.

Other likely owners include `DesktopNavRail.tsx`, `DesktopMorePanel.tsx`, the two station panels, impact panels, and map inset/camera helpers. Avoid further enlarging the shell with feature-specific styling logic. Keep changes proportional and avoid unrelated dependencies or refactors.

## Implementation sequence

1. Verify the current served UI and record representative before views. Implement profile resolution, layout budgets, and transient View on map collapse. Validate camera preservation and overlay focus in both networks early.
2. Apply the surface/row/header treatment, then adapt rich panels, Search, Saved/forms, More, and other reachable destinations. Check long content and scroll ownership as each pattern stabilizes.
3. Perform visual acceptance, fix defects, then run the appropriate final verification once. These are work checkpoints, not requests for user approval.

## Acceptance and evidence

Functional test success alone is insufficient. Provide reviewed browser screenshots of Status, rich impact cards, station detail, Search, Saved/form editing, and More. Include a smaller desktop overlay, both networks, representative light/dark states, and collapsed/reopened details after View on map. Describe any unverified or unavailable state honestly.

Inspect 1440×900, 1280×800, 1024×768, and a large desktop; inspect either side of all changed dock thresholds and the unchanged mobile boundary. Check compact 360px mobile and short landscape for leakage. Use representative coverage rather than blindly multiplying combinations.

Specifically inspect long headings/station names, dense overlap chips, toolbars, empty/error/unavailable states, active/planned distinctions, enlarged text/200% zoom, focus visibility, high contrast, and reduced motion. No clipped main headings, label/count collisions, decorative outline grids, inaccessible controls, competing primary scrollbars, or page-level overflow.

Add meaningful behavior coverage for profile-based dock/overlay transitions, stable widths across data changes, Back/state restoration, and transient View on map collapse without preference mutation. Verify manual camera preservation and target visibility after width/mode changes in both networks. Avoid tests that only assert CSS strings or component names.

Read the [testing guide](../testing.md) before browser suites. During iteration use focused browser checks; do not rebuild or run every suite after each tweak. For the completed broad shell/navigation/shared styling change, run frontend fast tests, typecheck, lint, production build, full smoke/E2E, and the required visual suite/review under repository guidance. Reuse an appropriate build, serialize suites with shared mutable fixtures, and report environment limitations. Review visual diffs before updating baselines.

Final implementation report: explain changes, link representative screenshots, report actual checks and gaps, and identify any dimension tuning from the initial targets. Do not mark this handoff implemented merely because the document or functional tests exist.
