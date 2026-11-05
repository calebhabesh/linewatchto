# L — Map View layers on phones and View for surface notices

Owner request, 2026-11-04: (1) phones need a way to reach the Map View layer
switches the desktop deck has; (2) streetcar and bus notices should get a
View action like line alerts. View applies to the Map View only, because
System Maps don't draw surface routes.

Read first: the surface line of [domain invariants](../domain-invariants.md),
[plan 13](13-surface-network.md) (layer deck, S5 and S8 decisions), and
[plan 14](14-unified-search.md), which runs first: L4 resolves stop
positions from its index (U1) and reuses its Map View selection (U4).

## Decisions (2026-11-04, owner delegated to best UX and performance)

- **Phones get a Layers sheet, not a second toolbar row.** "View Buses" in the
  left column becomes "Layers". It opens a bottom sheet with the same switches
  and captions as the desktop deck (TTC: Train Markers, Streetcars, Buses,
  Live GPS; GO/UP: Train Markers, GO Buses, Live GPS). Switches apply live and
  the map stays visible above the sheet. "View Trains" stays as its own
  one-tap button because riders use it most. This replaces plan 13's "Phones
  keep View Buses only".
- **One switch list for both sizes.** The desktop deck and the phone sheet
  render one component from one state, so labels, captions, defaults and the
  per-device memory cannot drift apart.
- **Notice View selects and frames, never colours.** View flies to the
  affected stops and marks them with the neutral selected style the stop panel
  already uses. A route-wide notice frames the route with the same style.
  Nothing is drawn in red, orange or any service colour, and the detour path
  is never drawn: notices give it only as text. This amends the invariant
  "Surface reads and notices do not color, badge, or add overlays to surface
  routes" (made in plan 14 U0).
- **Performance:** the selected style reads the existing sources, with no new
  geometry. Corrected in L1 to match what plan 14 U4 shipped, which L4 reuses:
  with a layer on, filters select within its full sources; with a layer off,
  those sources hold only the selected routes' corridors and the selected
  stops (a subset, not a filter on the full file). The phone sheet renders only
  while open. No layer data loads until its switch is on, except the routes
  or stop set a View or route panel needs.

## Findings

- The phone left column (`mobile-train-left-cluster` in `LineWatchShell`)
  holds View Trains, the bus toggle (`data-bus-toggle`) and the map view
  selector. The desktop deck switches live in the Map View toolbar. Corrected
  in L1: their state is split. Train Markers, Buses and GO Buses (with their
  per-device keys) are in `LineWatchShell`. Streetcars, Live GPS and GO Live
  GPS, their keys and the position reads their captions depend on are in
  `GeographicNetworkMap`.
- Alert View uses `MapActionButton` (`ImpactCardFields`) with View/Back and
  "No Map Location" when there is nothing to show. Notice cards should reuse
  it unchanged.
- Notices carry `routeIds`, `stopIds` and paired stop names. Check in L4
  whether TTC `stopIds` are pole numbers (`stop_code`, as the "7658" card
  suggests) or GTFS `stop_id`, and map both if they are mixed.

## Phases

| Phase | Owns | Detail |
| --- | --- | --- |
| L0 | Invariant amendment | Moved to plan 14 U0 |
| L1 | Shared layer switch list | Done (2026-11-04) |
| L2 | Phone Layers button and sheet | Done (2026-11-04) |
| L3 | Selection on the Map View (stops, routes) | Moved to plan 14 U4 |
| L4 | View on surface notices | Done (2026-11-04) |
| L5 | Coverage and close | Not started |

### L0 — Invariant amendment

Moved to plan 14 U0 (2026-11-04), because the route panel's View on Map ships
there first. Confirm the wording covers notice View before starting L4.

### L1 — Shared layer switch list

Extract the deck's switches into one component that takes the network, state
and handlers, and renders a horizontal deck (desktop) or a vertical list
(sheet). Keep the existing accessible names, stable dimensions and
per-device keys. The desktop deck should look the same; check it against the
`surface-buses` and `map-line-badges` specs.

**Done (2026-11-04).**

- `src/app/map-layer-switches.ts` (`mapLayerSwitchRows`) turns the network,
  layout, state and handlers into rows: label, caption, id, accessible name,
  title and handler. It is its own module because the catalog and position
  modules import `map-view-layers.ts`, and these captions and titles import
  them back.
- `src/components/MapLayerSwitchList.tsx` renders the rows, with `layout`
  `"deck"` or `"sheet"`. `GeographicNetworkMap` renders it as the deck and keeps
  the deck's id, class, ref and waiting state, so its animations, placement and
  `desktop-sidebar-state` are untouched. State and storage writes did not move.
- Decisions: the sheet layout has its own ids (`map-layer-sheet-*`), because the
  hidden deck stays in the DOM on phones. Sheet rows are full width, at least
  44 px tall, with the switch at the row's end. The switch stays 34×20.
- Desktop deck unchanged: DOM, geometry, computed styles and screenshot bytes
  match the code before L1 at 1680, 1440 and 1024 px, on both networks and in
  both themes (:3000, markers and Live GPS off so captions hold still). The only
  DOM differences are the root's new `map-layer-switch-list` class and
  `data-layout`. The dev pass did not include high contrast or a switch's on and
  off states; the smoke specs cover switching.
- Sheet layout: no screen uses it until L2. Checked with a clone of the deck's
  markup at 360 px on both networks and in both themes: a column of 44 px rows,
  no overflow. No page overflow at 360 or 1440 px. No breakpoint changed.
- Checks: `test:fast` 2,278 (new `map-layer-switches.test.mjs`, 7 cases),
  typecheck, lint (no errors) and build pass. Smoke on desktop-chrome and
  mobile-chromium (`surface-buses`, `go-buses`, `night-routes`, `map-line-badges`,
  `bus-positions`, `go-bus-positions`, `streetcar-positions`, `surface-stop`,
  `geographic-map-lifecycle`, `network-fade`): 70 passed, 39 skipped, 1 failed.
- The failure is an existing flake, not from L1: `bus-positions.spec.ts:137`
  ("a stale source") on mobile-chromium. Repeated 15 times it failed 7 on
  unmodified 0a06fd10 and 2 with L1. `pressBus` times out waiting for the card;
  the cause was not looked into.
- Left for L2: the sheet must get state held in both the shell and the map.
  Rendering it from `GeographicNetworkMap`, with its open state passed in, avoids
  moving the position reads. The sheet's final padding and gaps are L2's, once it
  has a real container. L2's specs are the first to run the sheet layout through
  React (`test:fast` cannot render TSX). `surface-stop.spec.ts` takes the first
  `[data-bus-toggle]`, so check that still finds the right switch with a sheet open.

### L2 — Phone Layers button and sheet

- The left-column button shows "Layers" with a layers icon, and a small dot
  when anything differs from the defaults. It stays the same size in every
  state.
- The sheet uses the existing mobile sheet pattern (drag handle, Escape or
  scrim to close, focus returned to the button). The rows are full-width
  switches with the deck's captions, at least 44 px tall.
- Map View only. On a System Map the button is hidden, as the bus toggle is
  today.
- Inspect at 360 and 767 px, both themes, both networks, and the iOS
  installed-app bottom strip. Nothing overlaps the stop sheet or the legend.

**Done (2026-11-04).**

- `src/components/MapLayersSheet.tsx`, rendered by `GeographicNetworkMap` from the
  same state and handlers as the deck and mounted only while open. It is a portal
  into `.linewatch-shell`, so it sits over the bottom nav and takes the theme
  classes. `LineWatchShell` owns the button (`.mobile-layers-toggle`, was
  `.mobile-bus-toggle`) and the open state; the map reports the dot through
  `onLayersCustomizedChange`. `mapLayersDifferFromDefaults` compares the rows the
  network lists with their defaults.
- Decisions: the sheet does not use `useMobileDraggableSheet`, whose 50% floor and
  height saved with the station sheets would hide the map. It is sized to its rows
  and only drags down to close (over 64 px, or a flick). A light scrim keeps the
  map readable; a press on it closes the sheet and never reaches the map. The sheet
  closes itself if the view stops being a phone Map View.
- The stop sheet hides the left column, so Layers cannot open over a stop sheet.
- Inspected on the production build at 360 and 767 px: TTC and GO/UP in light and
  dark, and TTC in high contrast at 360 px. No page overflow; the nav is covered.
- iOS bottom strip: not checked on a device. With `--mobile-safe-bottom` forced to
  34 px the rows clear the inset. The sheet reaches the layout viewport's bottom as
  the stop sheet does, so a black-translucent install would show the nav-coloured
  strip below it.
- Not done: Android Back does not close the sheet. `feature-reference.md` and plan
  13's phone note still say View Buses (L5). Sheet cost not measured (L5).
- Tests: `map-layers-sheet.spec.ts` (7 phone, 1 desktop), one more case in
  `map-layer-switches.test.mjs`; the `surface-buses` and `go-buses` phone cases
  now go through the sheet.

### L3 — Selection on the Map View

Moved to plan 14 U4 (2026-11-04). L4 uses that selection, with one change: it holds a list of routes.

### L4 — View on surface notices

- `SurfaceNoticesPanel` cards, and notice results in search, get the
  `MapActionButton`:
  - stops with known positions: frame and select them. One stop also opens
    its departures.
  - no stops, but drawn routes: frame and select the route.
  - neither: "No Map Location" (disabled), as for alerts.
- Stop positions come from the plan 14 index (U1); selection and framing
  are plan 14 U4.
- From a System Map, or the other network, View switches to that network's
  Map View first. View then Back returns to the notice list at the same
  scroll position, as alert View does.
- On phones, View closes the list to the map with a compact notice strip
  (route badge, title, Back), following `MobileImpactInspector`.

**Done (2026-11-04).**

- `src/app/surface-notice-target.ts` (`surfaceNoticeMapTarget`) resolves a notice
  to stops, a route or nothing from the plan 14 index. Selection and framing are
  U4's: `showSurfaceSelectionOnMap` (now with an optional view) and owner `notice`.
- The phone strip is `SurfaceNoticeMapStrip.tsx`, in the bottom nav's footprint, so
  the controls above it don't move. It replaces the status peek while shown, because
  the peek covered half the framed map.
- Stop ids, checked against the live API and a TTC `stops.txt` (the plan's question):
  - TTC GTFS-RT notices carry pole numbers. All 9 seen equal both `stop_code` and
    `stop_id`. In that file 42 stops have a differing `stop_id`, none is another
    stop's `stop_code` and none is in the index, so a number cannot select the wrong pole.
  - TTC Live Alerts notices repeat the stop name as the id. The same alert can
    appear in both forms and name different poles (11321 and 9149); that is existing
    backend output and L4 does not merge them.
  - A name matches only poles on the notice's route, and can select both sides of an
    intersection. Without a route it counts only if one pole has that name. An
    unknown number falls back to its paired name, so no id table was needed.
  - GO/UP rail notices carry station and line codes and always get No Map Location
    (20 of 41 live). Only GO Bus notices resolve there, as in `surfaceNoticesForRoute`.
    No live GO Bus notice carries stops, so GO stop numbers have unit coverage only.
- Corrections to this plan:
  - `MapActionButton` is `ImpactCardMapButton`. It is unchanged; its fixed 78 px width
    is overridden from the notice card and search row, as the outage list does.
  - "The other network" cannot happen: the notice list and search only show the
    selected network's notices, so no network switch was built. Add one if a surface
    ever lists another network's notices.
  - U4's phone padding reserved half the screen when no sheet was open, by falling
    back to the saved sheet height. It now reserves that only with a sheet up.
- Decisions:
  - A notice for several routes selects and frames every one the map draws (10 of 38
    live notices name several routes and no stops), across layers. U4's selection
    went from one route to a list for this; a route panel passes a list of one. The
    strip shows two badges and "+N". Undrawn routes (503) are left out.
  - Back returns a System Map to the System Map and restores the saved preference: it
    undoes all View did. A searched stop still leaves the Map View on, as it opens a
    place rather than a look from a list. A station or alert ending View stays on the
    Map View, where it is shown.
  - A search row's View with one stop opens it as a searched stop, with Back to Search.
    On a phone other targets go to the map with the strip. On desktop they open the
    list at that notice with View on, and Back steps on to search.
  - A pole pressed during View opens its stop, which clears the other selected stops;
    Back from that stop returns to the list.
- Back, added here (decided by the owner, not in the plan above):
  - Android or browser Back closes the Layers sheet with its exit animation and stays
    on the map. Opening the sheet adds one history entry; any other close gives it back.
  - View adds one entry. Back from the card, strip, stop panel, browser or desktop
    Escape all end View and spend that entry, and the list's own Back or Close takes
    it too. Selection clears with the notice, as for U4's other owner.
  - If a station or alert ends View, its entry stays under theirs, so one later Back
    press does nothing visible (same as other surface panels).
- Other changes: the list's 30-second refresh no longer blanks loaded rows, which reset
  the scroll. The list keeps filters, scroll and focus through Back (`SurfaceNoticePlace`).
  The dev-only `__linewatchSurfaceSelectionDebug` hook is gone, as its comment planned.
- Inspected on :3000 with live notices at 360, 767 and 1440 px, both networks and both
  themes: no page overflow, no service colour or badge on the map, no drawn detour.
  High contrast styles were not inspected. Desktop search rows show no notices on dev
  (not investigated; a React strict-mode double run of the existing fetch is the likely
  cause), so search rows were inspected on the production build with stubbed notices:
  360 px dark and 1440 px light by eye, 767 px and 1440 px dark for page overflow only.
- Not checked: a real Android or iOS device (Back is `page.goBack()` in Chromium), the
  iOS bottom strip. Moved from L5 and done here: target unit tests, and smoke for notice
  View and Back, View from a System Map and Back on the sheet. L5 keeps the cost
  measurements, feature reference, README and plan 13's phone note.
- Tests: `surface-notice-target.test.mjs` (14), `surface-notice-view.spec.ts` (10 cases on
  desktop-chrome and mobile-chromium, 1 phone only). `test:fast`, typecheck, lint
  (0 errors, 16 existing warnings) and build pass. Smoke on both projects across
  `surface-notice-view`, `map-layers-sheet`, `surface-stop`, `go-buses`,
  `search-back-and-stop-links`, `stops-near-me`, `search-stops-and-routes`,
  `surface-buses`, `night-routes`, `geographic-map-lifecycle`, `bus-positions` and
  `network-fade`: 114 passed, 42 skipped (`surface-notice-view` was fixed and rerun alone).
  `dashboard.spec` notice cases: 10 passed. The several-routes strip and framing were
  checked by eye at 360 px and 1440 px light, with no page overflow at 360 px dark.

### L5 — Coverage and close

Unit tests for the notice → map target resolution (stops, route, none, mixed
ids). Smoke specs: phone Layers sheet (each switch, persistence, focus
return), notice View/Back on desktop and phone, and View from a System Map.
Check that the desktop deck is unchanged. Update the feature reference,
README and plan 13's phone note. Measure phone cost on the production build:
opening the sheet, and a notice View with Bus Routes off.

## Order

Run after plan 14. L1 then L2, then L4, then L5. L1 and L2 depend on nothing
from plan 14, so they can also be done at any point in between.
