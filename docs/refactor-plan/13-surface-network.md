# S — Surface network on the Map View

Owner request, 2026-11-02: add the TTC streetcar network to the TTC Map View
(MapLibre), then stop numbers with departures, and consider TTC buses and GO
buses behind a toggle. The System Maps stay as they are. livemap.ttc.ca is the
comparison point. We aim to be clearer and more honest about live versus
scheduled times, not to copy it.

Read first: the surface and freshness lines of
[domain invariants](../domain-invariants.md), and
[source gates](../source-licensing-launch-gates.md).

## Owner decisions (2026-11-02)

- **Shared track draws as one line with badges.** Where routes share a street
  (King: 504A/504B/508; Queen: 501/503), draw one streetcar line per corridor
  with route badges along it, like the TTC streetcar map. No per-route offset
  lines.
- **Streetcars show at every zoom, always on** (revised 2026-11-02; first
  decided as zoomed-in only). Hidden at the default view, riders could take
  them to be missing. They are drawn thinner than the subway so it stays the
  main read; route badges still wait for zoom 13. No toggle.
- **Plan scope:** every phase is listed; S1 to S3 are detailed. S4 to S7 are
  outlines, to be detailed when they start.
- System Maps (authored SVG) are out of scope.

## Findings

- **Same source, same licence.** The Map View lines come from TTC static GTFS
  `shapes.txt`, sliced and simplified by `scripts/generate-geographic-catalog.mjs`
  into `frontend/public/assets/linewatch/geographic/ttc-catalog.json` (155 KB,
  109 stations, 112 links). The same feed has every streetcar and bus route,
  under the Open Government Licence – Toronto already credited. Stop numbers
  are GTFS `stop_code`, the number on the stop pole.
- **Live surface predictions are already polled.** `TtcSurfaceArrivalPollingJob`
  reads `gtfsrt.ttc.ca/trips/update` every 15 s, and a source older than 2 min is
  stale (`application.yml`, `linewatch.surface-arrivals.*`). `ttc-enabled`
  defaults to `false`. Confirm the production setting before relying on it.
- **Indexing is per station, not per stop.** `TtcSurfaceArrivalIndexer` drops
  every stop not in `ttc_surface_station_stops` (V65). That table holds only
  stops whose GTFS `parent_station` is a subway station. Scheduled fallback
  (`ttc_surface_stop_times`, V80) is limited to the same stops.
- **An invariant blocks this today.** Domain invariants say: "Surface reads do
  not add routes, vehicles, or overlays to maps." S0 replaces that line.
- **Map budgets cover System Maps only.** `test:map-budgets` measures the
  System Maps. The Map View has no budget pass for added layers yet.
- **No open source for station floor plans is known.** livemap's platform, bay
  and elevator plans are not in GTFS, and no City of Toronto dataset with that
  detail was found. Treat them as TTC-internal until shown otherwise.

## Phases

| Phase | Owns | Detail |
| --- | --- | --- |
| S0 | Invariant and claims update | Done |
| S1 | Streetcar corridor asset (generator) | Done |
| S2 | Streetcar layer on the TTC Map View | Done |
| S3 | Stop markers and stop departures | Detailed |
| S4 | Live streetcar positions | Outline |
| S5 | TTC buses behind a toggle | Outline |
| S6 | GO buses on the GO/UP Map View | Outline |
| S7 | Station floor plans | Gated on a source |

### S0 — Invariant and claims update (done 2026-11-02)

The surface line in [domain invariants](../domain-invariants.md) now says:
only the Map View, never a System Map, may draw TTC surface routes and stops,
and only from published static GTFS. They are wayfinding layers with no
service status; replacement-bus and short-turn trips are counted, not drawn.
Surface reads and notices never colour, badge or overlay a surface route, and
vehicles need their own fresh source (S4). Every surface departure carries a
live or scheduled status, and the S3 stop view labels it on every time.
Station surface arrivals today label the mix once per list ("Live estimates +
scheduled departures"); the per-time rule applies to the new stop view.

Update the feature reference and the README product claims only when S2 ships.

### S1 — Streetcar corridor asset (done 2026-11-02)

`npm --prefix frontend run generate:surface-catalog -- --ttc-gtfs <zip>` runs
`scripts/generate-surface-catalog.mjs` (corridor logic in
`scripts/lib/surface-corridors.mjs`) and writes
`frontend/public/assets/linewatch/geographic/ttc-surface-streetcar.json`.
The asset carries its own source block (feed version and dates, archive
SHA-256, OGL–Toronto attribution). It is not listed in the geographic
`manifest.json`, whose combined hash the catalog test pins to the two rail
catalogs. Types: `frontend/src/app/geographic-surface-catalog.ts`.

**What the feed showed (S1000544, 2026-11-01 to 2026-12-19):**

- `route_type` 0 also covers Lines 5 and 6 and the 300-series night routes.
  The map takes the daytime 5xx routes only. The backend importer also
  classes `route_type` 0 as streetcar, so the two agree on mode.
- 504A and 504B are trip headsigns under route 504, not routes. Badges use
  the route number. 508 is not in this feed.
- Bus replacements are trips of the streetcar route ("Replacement Bus" in the
  headsign): all of 503, and 501B, 504C and 506B. They are counted per route
  (`weekdayTrips.replacementBus`) and never drawn. 503 is listed with
  `drawn: false`.
- Diversions are in the schedule. This period the 501 streetcar runs
  Queen → Broadview → Gerrard → Coxwell → Queen, and the asset draws that.
  Regenerate when the feed changes each schedule period (the last two
  ran 8 and 7 weeks). `scripts/download-geographic-gtfs.mjs` pins an older archive, so
  download the current one from the TTC Open Data page.

**How corridors are built:** weekday (Monday-to-Friday service) streetcar
trips are grouped into patterns. Each pattern is cut at its stops with
`shape_dist_traveled`, so routes serving the same stops share a stop gap
exactly. Gaps with fewer than 6 weekday trips are left out. Taking patterns
busiest first, a gap running within 25 m of, and in the same direction as
(within 35°), lines already drawn folds into them and adds its routes. Only
the part that leaves them is drawn (loops, one-way streets). A crossing street
never shares routes. Pieces meeting end to end with the same routes are joined,
then simplified (Douglas-Peucker, 2 m) and rounded to 5 decimals.

**Result:** 10 routes (9 drawn), 41 corridors, 517 stops; 156 KB raw, 20 KB
gzipped. The output is deterministic for a given archive.

Checks: `frontend/tests/surface-corridors.test.mjs` (shared stops, opposite
direction folded, one-way detour, crossing street, low-trip gaps) and
`frontend/tests/surface-catalog.test.mjs` (source, routes drawn only when
streetcars run, coordinates, stop numbers, ≤ 200 KB raw and ≤ 40 KB gzipped).
Both run in `test:fast`. A rendered overlay of the output was compared against
the TTC streetcar map: no missing or doubled corridors downtown.

### S2 — Streetcar layer on the TTC Map View (done 2026-11-02)

- **Loading:** `loadStreetcarCatalog()` (`geographic-surface-catalog.ts`)
  fetches the asset once, only when the TTC Map View is ready. An effect in
  `GeographicNetworkMap.tsx` installs the layers when it arrives;
  `installTransitLayers` installs them on every later TTC install (theme
  `setStyle`, network switch back) from the cached catalog.
- **Layers** (`geographic-streetcar-layers.ts`): `transit-streetcar-casing`,
  `-line` and an invisible 16 px `-hit` line under `transit-routes-casing`,
  and `-badges` (line-placed, viewport-upright badge rows, one image per route
  set) under `transit-stations-outer`, so station names win placement. Lines
  show at every zoom, thinner than the subway (1.1 px at zoom 9 against its
  2.2, 2.6 against 5 at zoom 14); badges start at 13.
  The colour is the GTFS route colour, a constant, never data-driven. The
  `transit-` prefix gives network-switch removal and the network fade for free.
  A subway line filter dims streetcars to 0.25.
- **Interaction:** a press on a streetcar line (after overlap badges and
  stations, and never over an alert drawn there) opens `GeographicStreetcarCard`:
  the routes under the press, "Some trips run as replacement buses." where
  that applies, and "Weekday schedule, Nov 1 – Dec 19. Not live service." It
  shares the alert chooser's placement and follower (one card at a time),
  closes on Escape, the close button, another press, a new selection, or a
  network switch. Its styles sit in
  `overlap-chooser.css` (the dev server did not pick up a new `@import`).
- **Not done here:** no hover highlight, no route detail view (S3 gives the
  card somewhere to go), and the attribution string is unchanged ("TTC shapes
  © City of Toronto" already covers the source).

Checks: `frontend/tests/geographic-streetcar-layers.test.mjs` (order under the
subway, drawn at the default zoom and thinner than the subway, constant colour, idempotent install,
filter dimming, TTC-only install after loading, card rows, period label and
size). Browser checks on the dev server at 1440 and 360 px, dark and light:
streetcars at the default view, single lines with badges downtown, the card
from a press, Escape, network switch away and back, theme change, no
horizontal overflow, no page errors. On 360 px the card can only
fit between the side control columns, so its list scrolls (same placement
rules as the alert chooser). Frame A/B on real-GPU Chrome at 2560 × 1309,
downtown pan and zoom, layer visible vs hidden, three alternating runs:
median frame 1.5–2.0 ms vs 1.7–1.8 ms, no consistent difference. This
measures MapLibre rendering, which dev and production builds share; a
production-build trace was not run.

### S3 — Stop markers and stop departures

**Backend**

1. **Stop catalog:** import all TTC surface stops (`stop_id`, `stop_code`,
   name, coordinates, routes served) into a new table on the GTFS import, next
   to `ttc_surface_station_stops`. Keep the station table and its
   `parent_station` join as they are.
2. **Indexer:** `TtcSurfaceArrivalIndexer` also indexes predictions by stop.
   Every stop in the feed, not just station stops. The station view is
   unchanged.
3. **Endpoint:** `GET /api/surface/stops/{stopCode}/arrivals` returns routes,
   direction/destination, and the next departures. Each departure is tagged
   `live` or `scheduled` and carries the source's freshness. Unknown stop
   codes return 404. A code missing from the current feed version says so; it
   is not an empty list.
4. **Scheduled fallback:** `ttc_surface_stop_times` covers station stops only.
   Measure the row count and import time for all surface stops before extending
   it; the regional importer's memory note in plan 02 applies. If it is too
   large, non-station stops show live departures only and say "No scheduled
   times for this stop" when live is unavailable.

**Frontend**

1. **Markers:** stop-number pills from the S1 stop features, at a zoom deeper
   than the corridors appear. Collide and hide pills rather than overlap.
2. **Stop panel:** reuse the existing sidebar / mobile sheet. Header: stop
   number and name. Rows: route badge, destination, next 2–3 times. Each time
   is marked live or scheduled; tomorrow's times say "Tomorrow" (Toronto
   dates, `toronto-date.ts`); a stale or disabled source shows its state, not
   old times as current.
3. **Opposite sides:** a subway station's surface section already groups its
   stops. Tapping a stop marker near a station links to that station's view.
4. **Search:** stop numbers in unified search ("9037" opens the stop).
5. **Notices:** active surface notices for the stop's routes appear in the
   panel (display only, per S0).

Checks: backend tests for per-stop indexing (a non-station stop's prediction
is returned; the station view is unchanged), the endpoint (live, scheduled,
stale, disabled, unknown code), and the Toronto service-day boundary. Frontend
tests for live/scheduled/stale labels and "Tomorrow". One smoke test: tap a
stop pill, the panel shows labelled times. Run the backend suite and the
frontend fast checks once when stable.

### S4 — Live streetcar positions (outline)

- Read TTC GTFS-RT vehicle positions for streetcars. Confirm the feed URL and
  that it is covered by the same Open Data Toronto dataset.
- Markers show real GPS positions, labelled as live, with an age and a stale
  state. Unlike subway markers, they are not schematic.
- Its enablement and freshness are separate from trip updates and alerts.
- Open: poll cadence and payload size, marker style beside subway train
  markers, and hiding vehicles off their route (yard moves, diversions).

### S5 — TTC buses behind a toggle (outline)

- About 200 routes. A single GeoJSON is too heavy for phones. Build vector
  tiles (PMTiles in the static assets), with a zoom below which buses are
  hidden.
- Same corridor model as S1. Downtown streets merge into one line, and the
  route list opens on tap.
- Toggle in the Map View layer controls, off by default, remembered per
  device.
- S3 stop markers and departures extend to bus stops. This likely forces the
  scheduled-fallback decision from S3.

### S6 — GO buses on the GO/UP Map View (outline)

- GO GTFS bus routes, Metrolinx Open Data terms (already credited).
- Highway routes across the whole region overlap heavily. Use the same toggle
  and tile approach as S5, on the GO/UP Map View only.
- Departures reuse regional surface arrivals (`regional-enabled`). GO buses do
  not affect GO/UP rail status. Keep the TTC and GO/UP boundary.

### S7 — Station floor plans (gated)

Do not build until one source is confirmed in writing:

1. A Toronto Open Data station-footprint dataset.
2. OpenStreetMap indoor/railway platform data. ODbL: attribution and
   share-alike apply to derived data. Coverage varies by station.
3. The TTC agreeing to reuse of its plans.
4. Self-drawn from public sources.

Record the chosen source in the source gates before any asset is added.

## Open questions

- Production value of `LINEWATCH_TTC_SURFACE_ARRIVALS_ENABLED`.
- Row count and import time of `stop_times` for all surface stops (S3).
- Zoom thresholds for corridors and stop pills: tune on the map, then record
  them here.
