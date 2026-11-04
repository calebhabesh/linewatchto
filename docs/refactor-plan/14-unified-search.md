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
| U0 | Invariants, privacy copy | Not started |
| U1 | Search index asset (generator) | Not started |
| U2 | Matching and ranking | Not started |
| U3 | Stop and route results in search | Not started |
| U4 | Selection on the Map View (stops, routes) | Not started |
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
