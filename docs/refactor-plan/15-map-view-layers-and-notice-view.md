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
- **Performance:** the selected style is a filter on the existing sources,
  with no new geometry. The phone sheet renders only while open. No layer data
  loads until its switch is on, except the one route or stop set a View or
  route panel needs.

## Findings

- The phone left column (`mobile-train-left-cluster` in `LineWatchShell`)
  holds View Trains, the bus toggle (`data-bus-toggle`) and the map view
  selector. The desktop deck switches live in the Map View toolbar; state and
  per-device keys are in `LineWatchShell`.
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
| L1 | Shared layer switch list | Not started |
| L2 | Phone Layers button and sheet | Not started |
| L3 | Selection on the Map View (stops, routes) | Moved to plan 14 U4 |
| L4 | View on surface notices | Not started |
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

### L3 — Selection on the Map View

Moved to plan 14 U4 (2026-11-04). L4 uses that selection as it is.

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
