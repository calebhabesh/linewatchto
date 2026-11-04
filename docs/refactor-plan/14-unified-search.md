# U — Search for routes, stops and stops near me

Owner request, 2026-11-04: make search cover everything the site knows about,
including TTC and GO bus routes, streetcar routes and every surface stop. A
rider standing at a stop, on the site or the installed app, should reach that
stop's departures in one or two taps, whether they know the stop number, the
street names or neither.

Plan 14 runs before [plan 15](15-map-view-layers-and-notice-view.md): it owns
the search index (U1), the invariant change (U0) and the Map View selection
(U4) that plan 15's notice View reuses.

Read first: the surface and freshness lines of
[domain invariants](../domain-invariants.md),
[source gates](../source-licensing-launch-gates.md) (nothing new is fetched
from a provider), and [plan 13](13-surface-network.md) for the catalogs this
plan reads.

## Decisions (2026-11-04, owner delegated to best UX and performance)

- **A prebuilt index on the device, not a search API.** Search answers on
  every keystroke and must work in the installed app on a weak connection.
  A generated per-network file is downloaded once, the first time search
  opens. It is cached like the other map assets, never as an API response.
  The backend's stop table (V91) stays the source for departures only.
- **One search box for both networks.** The current network's results come
  first. A result from the other network shows its network chip, and opening
  it switches network. A GO stop found from the TTC tab must not be a dead end.
- **Routes get a panel.** Stops already have one (S3). A route panel lists the
  route's notices and its stops by direction, so that route → stop →
  departures is always two taps.
- **Stops Near Me uses location on the device only.** It asks for location
  only when the rider taps it, never on load. The position never leaves the
  phone: nearest stops come from the local index, and only the chosen stops'
  departures are requested, by stop number, as today.
- **Recent stops** (the last 5 opened, per device, in browser storage) show in
  the empty search box. This is a per-device convenience only: storage can
  fail, and search works without it.
- Saving stops to an account is out of scope (later, beside My Stations).

## Findings

- `unified-search.ts` covers lines, stations, saved commutes, destinations and
  notices. `StationSearchPanel` adds one stop result, but only for an exact
  TTC stop number (`surfaceStopCodeFromQuery`), named only from the streetcar
  catalog. There are no route results, no stop names, and nothing for GO
  bus routes or stops.
- Stop and route data already ship as Map View assets: `ttc-surface-*.json`
  plus `-stops.json` (bus stops are 1.6 MB raw) and `go-surface-bus*.json`
  (813 GO stops, all with departures: `go-bus-stops.csv` is the backend
  allowlist). These files are too heavy to load just to search on a phone.
- Notices carry route ids and stop numbers, so a route or stop panel can
  list its notices without a new endpoint.
- Matching today is a plain substring and token match (`scoreText`). TTC stop
  names use "St / Ave / at / East Side" forms that riders don't type.

## Phases

| Phase | Owns | Detail |
| --- | --- | --- |
| U0 | Invariants, privacy copy | Done (2026-11-04) |
| U1 | Search index asset (generator) | Done (2026-11-04) |
| U2 | Matching and ranking | Done (2026-11-04) |
| U3 | Stop and route results in search | Done (2026-11-04) |
| U4 | Selection on the Map View (stops, routes) | Done (2026-11-04) |
| U5 | Route panel | Not started |
| U6 | Stops Near Me and recent stops | Not started |
| U7 | Phone flow and stop links | Not started |
| U8 | Coverage and close | Not started |

### U0 — Invariants and privacy copy

- Domain invariants: search results for surface routes and stops are
  wayfinding results from published static GTFS (schedule period named) and
  never claim service status. Departures keep the live or scheduled label on
  every time.
- Selection (moved from plan 15 L0): a route panel's View on Map, and a
  surface notice's View ([plan 15](15-map-view-layers-and-notice-view.md)
  L4), may select and frame stops or a route on the Map View in the neutral
  selected style, only while the rider has it open. They never use a service
  colour, badge or drawn detour. Without it, routes still carry no service
  status. This amends "Surface reads and notices do not color, badge, or add
  overlays to surface routes".
- Location: requested only when the rider acts, used on the device, never
  sent, stored or logged. Add this to Privacy & Acknowledgements.

Done (2026-11-04): domain invariants amend the surface line with the neutral
selection exception and add a search line and a location line. Privacy &
Acknowledgements has a "Location for Stops Near Me" section, and Browser
Storage names Recent Stops; both describe U6 behaviour ahead of it shipping.
Test: `privacy-acknowledgements.test.mjs`.

### U1 — Search index asset

`scripts/generate-search-index.mjs` reads the generated catalogs (not GTFS
again, so the index can never disagree with the map) and writes
`search-index-ttc.json` and `search-index-go.json` beside them:

- Routes: number, name, kind (streetcar, bus, night, express, GO bus), colours,
  drawn flag, schedule period.
- Stops: stop number, name, routes, kind, position rounded to 5 decimals
  (about 1 m), parent station when inside a subway station. Columns, not
  objects, to keep the file small.
- Route stop sequences per direction for U5 go in a separate
  `route-stops-<network>.json`, loaded only when a route panel first opens.
- Run it from the existing generate scripts so a new schedule period rebuilds
  it. A script test checks that every catalog stop and route is in the index.
- Report the raw and gzipped sizes. If the TTC index exceeds about 100 KB
  gzipped, drop fields before splitting files.

Done (2026-11-04), from TTC feed S1000544 and GO feed 20261028133417
(catalogs regenerated from the pinned archives; existing assets
byte-identical):

| File | Rows | Raw | Gzipped | Brotli |
| --- | --- | --- | --- | --- |
| `search-index-ttc.json` | 225 routes, 9,017 stops | 487.4 KB | 109.3 KB | 87.5 KB |
| `search-index-go.json` | 38 routes, 813 stops | 46.9 KB | 13.8 KB | 10.4 KB |

- `scripts/generate-search-index.mjs` (`npm --prefix frontend run
  generate:search-index`), building on `scripts/lib/search-index.mjs`. The
  TTC and GO generators run it after writing. Columns are in stop-number
  order; TTC stop numbers and every position (1e-5 degrees) are stored as
  differences from the previous stop, which took the TTC index from 136.8
  to 109.3 KB gzipped without dropping a field (a street-name dictionary
  gained nothing over gzip). `decodeSearchIndexStops` is the reference
  reader for U2. Route colours are a palette. Route kinds: streetcar, bus,
  express (900 series), night-streetcar, night-bus, go-bus. A stop's kind
  comes from its routes, so there is no stop kind column. `stations` maps
  217 stops inside subway stations to LineWatch ids (bus bays from the
  station plans, else "X Station …" names).
- Route stop sequences are one file per layer instead of one per network:
  `ttc-surface-{streetcar,bus,night}-route-stops.json` (2.2, 39.2, 12.6 KB
  gzipped) and `go-surface-bus-route-stops.json` (4.2 KB). A route panel
  loads only its layer's file. They come from the surface and GO
  generators, since the catalogs have no stop order
  (`scripts/lib/route-stop-sequences.mjs`). Each route keeps its distinct
  patterns by direction with the most common headsign and weekday trips.
  Short turns and stop-skipping variants fold into the pattern that visits
  their stops in order. A minor pattern (under a tenth of the busiest
  pattern's trips, or under 3 stops, such as the 52's Pearson loop, which
  the feed splits off as its own trip) is dropped when the route's other
  patterns list 80% of its stops. Daytime sequences keep only stops the map
  draws.
- Night-only poles: 245 poles are served only by night routes (the 300 on
  Bloor), contrary to plan 13 S10's "night routes stop at daytime poles".
  Night mode now writes them to `ttc-surface-night-stops.json` (48 KB, not
  drawn, read only by the index), so it must run after the streetcar and bus
  modes. U4 needs a source for them before a night-only stop can be selected
  on the map.
- Tests: `frontend/tests/search-index.test.mjs` covers the sequence folding,
  the builder (merged poles, night routes, stations, delta round trip, GO
  leading zeros), and a check that every shipped catalog route and stop, and
  every route-panel stop, is in the index with the same name and position.
  Checks: test:fast 2,195 passed, typecheck, lint (0 errors; 16 existing
  warnings), test:scripts 43 passed.
- Not done yet: service-worker or HTTP caching of the index (U3, when the
  client first loads it).

### U2 — Matching and ranking

These are pure functions in `unified-search.ts`, with tests:

- Stop number: exact match first, then prefix (from 3 digits).
- Route: an exact number ("105", "504", "GO 40") ranks above everything else.
  Names match by token ("dufferin", "king").
- Stop names: normalized both ways (Street/St, Avenue/Ave, "and", "&", "at",
  East/E, direction suffixes). Two streets ("dufferin steeles") match an
  intersection stop in either order. Opposite-side stops group under one
  intersection row that expands to each side and pole.
- Ranking across groups: exact stop number, exact route, station, stop name,
  line, notice. Each group is capped (5 stops, 5 routes). The full list is
  behind a "Show All" row.
- The index tokens are built once, when the file loads. Measure one
  keystroke on the production build at 4× CPU throttling: the goal is under
  4 ms. Move matching to a worker only if it misses that.

Done (2026-11-04):

- Stop and route matching is in `src/app/surface-search.ts`, kept out of
  `unified-search.ts` so that file stays the cross-group layer. That file
  gained `orderSearchGroups` (tiers: stop number, route number, station,
  route name, stop name, line, notice) and `capSearchGroup` (5 rows, then
  Show All). Route names rank after stations and before stop names: for
  "dufferin", Dufferin station comes first, then the 29, then the stops.
- `prepareSurfaceSearchIndex` decodes the U1 columns once and builds a
  sorted vocabulary with posting lists. Both long and short forms of each
  street word are indexed, so a half-typed "aven" finds "Ave". A query word
  is a binary-search prefix lookup marked into a reusable bitmask, and only
  stops that every word matches (in any order) get scored. Intersection keys
  (streets sorted, without direction, side or "Opposite") group a corner's
  poles within 250 m. They are computed for matched stops only.
  `searchSurfaceStops(…, limit)` builds only the places it returns and
  counts the rest (`total`) for Show All.
- Stop numbers: exact, then prefix from 3 digits. GO numbers match with or
  without leading zeros ("5" finds 00005 from the TTC tab). Route numbers:
  "504", "route 29", "52A" (the 52), and "GO 40" (GO only). Night and
  express namesakes rank after the day route.
- Two rules not in the plan: one letter, or a query of only street-type and
  direction words ("st", "ave", "west"), returns no stop-name rows.
  Stations, lines and routes still answer. "st" matched 2,111 places and
  cost 5 ms or more at 4×.
- Measured in Chromium (Playwright) at 4× CPU throttling, running this
  module's own code, since nothing in the production build calls it until
  U3. Medians: every prefix of "dufferin steeles" 0.0–0.8 ms; "7658", "765",
  "504" 1.2–1.4 ms; "queen st w" 0.7 ms. No worker needed. JSON parse of
  both files is 13 ms. The token build is 101 ms at 4× (16 ms unthrottled
  in Node), down from 168 ms after skipping Unicode normalization for ASCII
  names and deferring intersection keys. **U3 must not run it as one task on
  first focus:** run it in idle time or chunks, and keep the exact
  stop-number path answering until it finishes. Re-measure all of this on
  the production build in U3.
- Tests: `frontend/tests/surface-search.test.mjs`, 15 cases on the shipped
  indexes. Checks: test:fast 2,210 passed, typecheck, lint (0 errors; no
  warnings in the new files).

### U3 — Stop and route results in search

- New groups in `StationSearchPanel`: Stops (stop badge with number, name,
  route badges, distance when location is known) and Routes (authored route
  badge, name, kind). Both reuse the existing row and badge components.
- Enter opens the top result, as today. A stop opens the stop panel (TTC
  `SurfaceStopPanel`, GO `GoBusStopPanel`) and flies the Map View to it. A
  route opens the U5 panel.
- The index loads on first focus. Until it arrives, the exact stop-number
  path keeps working from the query alone (no regression offline).
- From a System Map, opening a stop or route switches to the Map View.

Done (2026-11-04):

- `StationSearchPanel` has Stops and Routes groups
  (`SurfaceSearchResults.tsx`, on the existing result-row styles):
  - A stop row shows its number badge (red edge TTC, green GO), name and
    route badges in each route's colours.
  - An intersection's corners are one row with a pole count. It expands
    to each pole with its number, and long names wrap to two lines so
    "… East Side" stays readable.
  - A route row shows its badge, name and kind (Streetcar, Bus, Express
    Bus, Community Bus, Night Bus, Night Streetcar, GO Bus).
  - Each group shows 5 rows; Show All lists up to 50.
  - The other network's rows sit under a network heading, as stations do.
  - Distance waits for U6.
- The content groups (stops, routes, lines, stations, saved stations,
  commutes, alerts, notices) render from one list sorted by
  `orderSearchGroups`. Keyboard indexes and Enter follow the order on
  screen. Go To and Categories stay at the top as before. Lines now come
  after stations and stop names, as U2 ranks them.
- **Ranking change:** an exact route number now outranks an exact stop
  number (`route-number` is the first tier). Nearly every route number is
  also a stop number: "504" was opening stop 504 (Bloor St West at
  Dovercourt Rd) before the 504 King. This follows the U2 bullet's own
  example ("504"); 4- and 5-digit stop numbers, which have no route, still
  lead. `surface-stop.spec.ts` now clicks stop 100 under Stops, since 100 is
  also a route.
- A typed TTC number with no exact match (index not loaded, offline, or not
  a stop) keeps the old typed-number row, so "424242" still opens a panel
  that says it is not in the TTC stop list.
- Loading: `surface-search-index.ts` fetches both networks' files the first
  time search opens, through the catalogs' `cachedLoader` (same HTTP caching
  as the other Map View assets; the service worker does not cache them).
  Tokens are built by `prepareSurfaceSearchIndexInSlices`, which hands the
  page a turn every 6 ms.
- Opening: a stop calls the shell with its network. A route opens
  `SurfaceRoutePanel`, in the stop panel's place, with its badge, kind,
  name, schedule period and "Not live service." (plus a note for undrawn
  routes). U5 adds notices, stops by direction and View on Map. Either one
  switches a System Map to the Map View (the saved view setting). The other
  network's stop or route switches network first and opens on the Map View,
  as a station from the other network does.
- **Not done in U3:** the map flies to a found stop only while its layer is
  shown (Streetcars on by default; Buses and GO Buses off). Drawing and
  framing a selected stop with its layer off is U4.
- Production build, desktop, 4× CPU throttling, two runs each, with the index
  files blocked and with them loaded:
  - Opening search: one 106–131 ms long task in both cases. It is the panel
    render that was already there; the index adds no long task.
  - Keystrokes: key event durations are the same either way (median 24 ms,
    max 64–72 ms over 30 typed keys). That is the panel's existing React
    render; the matching itself is 0.1–1.4 ms (U2).
  - Index: stops answer 0.77 s after first focus. The TTC file is 499 KB
    uncompressed from the local test server; it is 109 KB gzipped (U1).
- Checked on the dev server: 1440 px (both themes) for intersection, route
  number, route panel and GO stop from the TTC tab; 360 px (both themes) for
  expand, pole, stop sheet and no horizontal overflow.
- Checks: test:fast 2,212 passed (2 new loader tests), typecheck, lint (0
  errors), build. Smoke on desktop-chrome and mobile-chromium:
  `surface-stop`, `search-close-*`, `mobile-app-layout` and the search tests
  in `dashboard`, `sidebar-list-scroll` and `account-view-transitions`
  passed. `desktop-search-entry` fails on both projects, before and after
  this change: it expects "Back to More", and desktop More has read
  "Back to Settings" since plan 13.

### U4 — Selection on the Map View

Moved from plan 15 (L3), 2026-11-04, so the route panel ships with View on
Map. Plan 15 L4 reuses it for notice View.

- Add a selected-stops filter (a set of stop numbers) and a selected-route
  filter on the streetcar, bus, night and GO bus sources. Both use the stop
  panel's existing selected style, with an outline under route lines. This is
  a filter on the existing sources, with no new geometry.
- If the route's layer is off, load only that layer's corridors and show only
  the selected route, without changing the switch. Remove them when the
  selection clears.
- The camera fits the selection with the same padding rules as alert View
  (full-width framing, toolbar and legend kept clear).
- `GeographicNetworkMap` already keeps one selected stop
  (`selectedSurfaceStopCodeRef`); extend that rather than adding a second
  selection path. Unit-test the filter inputs; check one route and one
  multi-stop selection on both networks at 360 and 1440 px.

Done (2026-11-04):

- One selection. `mergeSurfaceSelection` (`src/app/surface-map-selection.ts`)
  joins the open stop with a new map prop, `surfaceSelection` (stop numbers
  and one route with its layer). The shell holds it as `surfaceMapSelection`
  with an owner (`route` or `notice`) and clears it when the route panel
  closes, or on a stop, station, alert, view or network change.
  `showSurfaceSelectionOnMap` is the call U5's View on Map and plan 15's
  notice View make. Nothing calls it yet except a dev-only
  `window.__linewatchSurfaceSelectionDebug`.
- Style (`geographic-surface-selection-layers.ts`, shared by all four
  layers): a route gets a dark `#0f172a` band with a white edge under its
  casing. Selected stops get the selected pill and dot at every zoom, over
  other labels and under vehicles and stations. The ordinary stop labels
  filter out every selected stop, so a shared pole never shows twice; the
  old in-layer `case` styling is gone. Corridors carry a `routeKey`
  (`|29|929|`) so the route filter never matches the 129 or 929.
- Layer off: the layer's existing sources hold only the selected route's
  corridors and the selected stops, and only the selection draws; the switch
  is unchanged. This differs from the plan text, which said to filter the full
  sources: a subset avoids tiling 8,310 bus stops in the worker for one pole.
  The sources are the same ones and there is no new geometry. Turning the
  switch on replaces the subset with the full file. Clearing the selection
  removes these layers and sources.
- Where a stop draws: streetcar file, else bus stops, else night-only poles
  (`assignSelectedTtcStops`). Each file loads only when a selected stop
  needs it. Night-only poles load from `ttc-surface-night-stops.json` (48 KB)
  into a `transit-night-stops` source and draw only when selected. Selected
  pills take presses, night-only ones included.
- Camera: one effect replaces the two stop-focus effects and frames each
  selection once its files are in, whether or not its layer is on. This
  fixes the U3 gap: searched bus and GO stops now fly. One stop flies like a
  station (zoom 16, GO 15). A route or several stops use `fitBounds` with
  alert View's padding:
  - Desktop: `geographicDesktopFocusPadding`, full-width framing, max zoom 15.
  - Phone: chips and sheet kept clear, 72 px sides, max zoom 14.75.
  - Stops only: max zoom 16, with 24 px at the top for the pill.
- Phone fix: MapLibre adds `fitBounds` padding to the padding the camera
  already holds, which a phone stop or station flight leaves at the sheet's
  height. The total was taller than the screen, so the fit was skipped after
  a stop flight. The frame now asks only for the padding beyond what the
  camera holds.
- The map region carries `data-surface-selection-layers` for tests.
- Tests: `surface-map-selection.test.mjs` (14 cases: route-to-layer, merge,
  key, route and stop filters evaluated with the style spec, stop
  placement on the shipped files, bounds, layer order and colours, layer-off
  sources, clean removal). The bus, streetcar and GO layer tests were updated
  for the filter. Smoke: `surface-stop.spec.ts` checks that a bus stop
  searched with Buses off draws, is flown to, and clears on close.
- Checked on the dev server at 1440 and 360 px, light and dark, with Buses
  and GO Buses off:
  - TTC: the 29 from its route panel. Several stops: 979, 2020 and 2034 (bus),
    100 (streetcar) and 96 (night-only). The 329 night route.
  - GO: the 40 from its route panel. Stops 00128, 00132 and 00139.
  - Clearing left no selection layers or sources.
- Production build, desktop, 4× CPU: opening bus stop 2034 with Buses off
  against streetcar stop 100, two runs each, showed the same long tasks: the
  camera flight's 50–140 ms frames, 1.3–1.6 s in total. Loading the stop
  file adds no task of its own.
- Checks: test:fast 2,226 passed, typecheck, lint (0 errors; the 16 existing
  warnings), build. Smoke on desktop-chrome and mobile-chromium: 42 passed
  (`surface-stop`, `surface-buses`, `go-buses`, `night-routes`,
  `geographic-map-lifecycle`, `bus-positions`, `go-bus-positions`,
  `streetcar-positions`, `search-close-*`).
- Not done:
  - The stop position search passes is still unused. The camera waits for
    the bus stop file the first time a bus stop is opened with Buses off.
  - The selection keeps full opacity while a subway line is filtered.
  - A selected route drawn with its layer off has no route badges; its panel
    names it.
  - There is no phone re-fit after the sheet resizes (alert View has one).

### U5 — Route panel

This panel uses the same container as the stop panel (desktop sidebar, phone
sheet):

- Header: route badge, name, kind, schedule period, and "Not live service"
  as on the routes card.
- Active notices for the route (fresh only, as in search), each opening its
  notice.
- Stops by direction, in order, each opening its departures. The stop nearest
  the rider is marked when location is known.
- View on Map frames the route's corridors with the neutral selected style
  from U4. A bus route
  shows even with Bus Routes off: only that route is drawn while the panel is
  open, and the layer switch is unchanged.
- Undrawn routes (for example 503, all buses this period) say so instead of
  showing a View action.

### U6 — Stops Near Me and recent stops

- In the empty search box: a "Stops Near Me" row, then Recent Stops.
- Tapping it requests one position (`getCurrentPosition`, high accuracy, 10 s
  timeout) and lists up to 8 stops within 500 m with distance and routes. The
  nearest 3 request departures right away; the rest request them when opened.
  Requests are capped so a rider walking does not repeat them.
- States: asking, denied (how to allow it, and search still works), no fix,
  nothing within 500 m (widen to 1 km once), low accuracy (say so).
- Works on both networks. Stops from both are listed together and marked by
  network.

### U7 — Phone flow and stop links

- On phones, opening a result closes search and shows the stop sheet over the
  map. Back returns to search with the query and scroll position kept.
- A link to a stop (`?stop=7658`, or the GO form) opens the stop panel, so a
  shared link or a home-screen shortcut works. Check the existing URL and
  navigation handling before adding the parameter.
- Inspect at 360 and 1440 px in both themes. Test with the keyboard, a screen
  reader name on each row, and no overlap with the iOS top chrome.

### U8 — Coverage and close

Unit tests for the index script and matching. Smoke specs: stop by number, by
intersection, a route, Near Me with a mocked position (desktop-chrome and
mobile-chromium). Update the feature reference, README claims and the
privacy page. Measure phone cost on the production build: the index download,
first-focus parse time and keystroke time.
