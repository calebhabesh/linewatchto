# Mobile Bottom Sheet UX Design

## Purpose

LineWatchTO already works well as a desktop, map-first TTC reliability dashboard. The mobile experience should not be the desktop dashboard compressed into a narrow viewport. It should become a rider-first mobile web app: fast to scan, reachable with one hand, responsive while the SVG map is mounted, and still clearly map-first.

This design keeps desktop behavior intact and adds a mobile-specific navigation and sheet model. The core mobile question is:

> Is my route, station, or commute affected now, later today, or this weekend?

The answer should be visible within a few seconds of opening the page, without opening a hamburger menu or fighting the SVG map.

## Current Context

The current frontend shell is a full-screen map app with top-left menu/search buttons, top-right utility controls, a top-center map control rail, left-side floating panels, mobile station bottom-sheet behavior, and an existing mobile performance first-pass plan.

The mobile performance pass should remain the foundation:

- Memoized `InteractiveTtcMap`.
- Stable callbacks from `LineWatchShell`.
- Conditional floating panel mounting.
- Mobile performance mode that disables costly background/effects.
- Pinch zoom support in `usePanZoom`.

This design assumes that pass is completed or carried forward before implementing the UX changes here.

## Goals

- Preserve the desktop map-first dashboard layout and behavior.
- Replace mobile hamburger-first navigation with reachable bottom navigation.
- Keep the map as the first screen, but add a compact status answer above the bottom nav.
- Render one mobile sheet at a time for status, search, alert categories, commutes, station details, or more/settings.
- Make mobile map controls smaller and less intrusive.
- Make station search mobile-native: search first, single-column browse, no squeezed two-column panel.
- Keep data claims honest: fixture/fallback/stale/fresh states remain visible and source-labeled.
- Improve perceived performance by avoiding hidden mounted panels and costly mobile paint effects.
- Maintain keyboard and screen-reader accessibility for all controls.

## Non-Goals

- Do not rewrite the map rendering engine.
- Do not replace the edited SVG map in this slice.
- Do not change backend APIs.
- Do not add dependencies.
- Do not add a PWA, install prompt, push notifications, or service worker.
- Do not redesign desktop.
- Do not claim live station arrivals, production GTFS geometry, or notification features.

## Recommended Mobile Information Architecture

Mobile should expose five primary destinations through a bottom nav:

- `Map`: inspect the TTC rapid-transit network and selected impacts.
- `Status`: rider-first current service summary with drill-ins for alerts, delays, Reduced Speed Zones, and closures.
- `Search`: jump to mapped stations.
- `Commutes`: saved commute impact cards.
- `More`: account, display settings, site guide, ingestion logs, reliability analytics, and health/source information.

The existing desktop hamburger menu can remain for desktop. On mobile it should be hidden or demoted behind `More`; the bottom nav becomes the primary navigation.

## First Screen

On mobile, the initial view should show:

- Full-screen TTC map.
- Recenter-only map control reachable near the lower right map area.
- A compact status peek above the bottom nav.
- Bottom nav fixed to the safe area.

The compact status peek should include:

- Line chips for Lines 1, 2, 4, 5, and 6.
- Total current impact count.
- Distinct counts for suspensions/active alerts, delays, Reduced Speed Zones, and upcoming closures.
- Source/freshness copy such as fixture mode, backend data, or last-polled text.
- A tap target opening the full `Status` sheet.

## Sheet Model

Mobile uses one active sheet at a time. Sheets should slide from the bottom and never stack visually.

Sheet types:

- `Status` sheet: mobile-specific service overview.
- Alert-category sheets: existing `ActiveAlertsPanel`, `DelaysPanel`, `ReducedSpeedZonesPanel`, and `PlannedClosuresPanel`, rendered through a mobile bottom-sheet version of `FloatingPanelShell`.
- `Search` sheet: existing `StationSearchPanel`, restyled on mobile.
- `Commutes` sheet: existing `SavedCommutesPanel`, rendered as a mobile sheet.
- `More` sheet: new mobile utility/settings sheet.
- `StationDetailPanel`: existing station bottom sheet remains separate and should temporarily hide the bottom nav to avoid overlap.

Sheet detents for this slice should be explicit button-controlled, not gesture-dragged:

- Medium: default for most sheets, about 55vh.
- Full: expanded sheet, about 88-90vh.

The compact status peek is the collapsed status state; do not implement a draggable collapsed sheet in this slice.

## Status Sheet Content

The `Status` sheet is not a duplicate of every alert card. It is a decision surface:

- Header: `System Status`, source/freshness, close button.
- Line rows for Lines 1, 2, 4, 5, and 6.
- Each row shows route color, route name, and impact chips.
- Summary action buttons:
  - `Active Alerts`
  - `Delays`
  - `Reduced Speed Zones`
  - `Closures`
- Empty/clear state: `Good Service` for lines with no dashboard-visible impacts.
- If fixture/fallback data is shown, keep copy clear and do not call it live.

Tapping an impact category opens the existing full category panel in a mobile bottom sheet.

## Search Sheet Content

Station search should be mobile-native:

- The search input receives focus when opened.
- Search results are a single vertical list.
- Browse by line is a single-column list.
- When a line is selected, show its stations in the same sheet below or as a drill-in list, not as a squeezed two-column layout.
- Station rows retain line badges, impact badges, and outage badges.
- Selecting a station closes search and opens `StationDetailPanel`.

## More Sheet Content

The `More` sheet contains non-primary mobile utilities:

- Account state and actions:
  - Sign In
  - Create Account
  - Demo Account
  - Sign Out when authenticated
- Display settings:
  - High Contrast Mode
  - Reduced Motion
  - Theme toggle if the mobile map utility cluster is hidden
- Portfolio/deep tools:
  - Reliability Analytics
  - Site Guide
  - Ingestion Logs
- Source/health summary using existing ingestion health records.

Do not put live service categories only in `More`; those belong in `Status`.

## Map Controls

Desktop map controls remain as they are.

Mobile changes:

- Hide the zoom slider and explicit zoom in/out buttons.
- Keep pinch zoom as the primary zoom interaction.
- Keep a 48px recenter button.
- Hide top-right `Logs`, `Guide`, and theme utility cluster on mobile.
- Surface those utilities through `More`.
- Hide the large desktop legend on mobile; the status peek/sheet replaces it.

## Accessibility

- Bottom nav buttons should be at least 48px tall where practical.
- Sheet close/expand controls should be at least 44px.
- SVG map station/impact targets may remain geometrically constrained, but equivalent station/search/status list controls must exist.
- Use clear `aria-label`, `aria-current`, `aria-expanded`, `role="navigation"`, `role="dialog"` or `complementary` as appropriate.
- Preserve keyboard access for desktop menu and mobile sheets.
- Escape should close open mobile sheets and return focus to the invoking control when practical.
- Reduced motion should disable sheet animations and map effect animations.

## Performance

The mobile UX should support a target of visually responding to primary taps in under 200ms on typical mobile hardware. Implementation should avoid:

- Re-rendering the full map when opening sheets.
- Animating layout properties like width, height, left, right, padding, or max-height during frequent interactions.
- Keeping hidden alert/search/commute/analytics panels mounted.
- Running Vanta or heavy SVG filters on mobile performance mode.

Use transform/opacity animations only. Use lazy mounting for `More`, analytics, logs, and account-heavy content.

## Visual Direction

- Keep the dark transit-control-room feel.
- Use neutral dark surfaces with TTC line colors as anchors.
- Red remains suspension/closed service only.
- Orange remains delays/degraded service.
- Reduced Speed Zone uses existing amber/chevron styling.
- Planned preview uses blue.
- Cards stay at 8px radius or less unless inherited existing components already use a local radius.
- Avoid decorative hero/marketing content.

## Acceptance Criteria

- Desktop layout and menu behavior remain intact.
- On mobile, bottom nav is visible and top-left hamburger is not the primary path.
- Mobile first screen shows map plus compact status peek.
- Tapping `Status` opens a service overview sheet.
- Tapping category buttons opens the existing category cards as mobile sheets.
- Tapping map impact overlays still opens the correct category sheet and highlights the selected card.
- Tapping `Search` opens a bottom search sheet and station selection opens station details.
- Tapping `Commutes` opens saved commute cards.
- Tapping `More` exposes account, display, analytics, guide/logs, and source/health tools.
- Mobile map controls do not overlap bottom nav/status peek/station sheets.
- Existing fixture, typecheck, lint, build, and smoke tests pass after updates.

