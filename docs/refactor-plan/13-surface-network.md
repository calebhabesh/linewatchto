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
  main read; route badges still wait for zoom 13. Revised again 2026-11-03:
  still on by default, but the Map View layer deck (below) can turn them off.
- **Plan scope:** every phase is listed and detailed (S7 after its source
  decision, 2026-11-03).
- System Maps (authored SVG) are out of scope.
- **Route badges match the TTC's colours exactly** (2026-11-03), even where a
  family falls short of WCAG AA at badge size: 900-series Express keeps white
  on `#00A651` (about 3.2:1). The route name beside each badge also names the
  route. Do not re-flag this as a gap.
- **Bus lines are TTC red, dashed** (2026-11-03), thinner than streetcars,
  chosen over grey (read as a basemap road in dark mode), solid thin red
  (read as a streetcar at street zoom) and a muted rose.
- **Live bus positions are their own phase** (S8, 2026-11-03), not part of S5.
- **GO buses** (2026-11-03, S6): GO green dashed lines; GO/UP gets the same
  deck (Trains, GO Buses) with Train Markers in it; GO stop departures from
  a per-stop Metrolinx Next Service endpoint.
- **Map View layer deck** (2026-11-03): the toolbar's Buses button is gone.
  On the TTC Map View the toolbar always carries a lower deck, one shape with
  it (inset, joined by concave curves), with Streetcar Routes (on by
  default), Live Streetcars (on by default) and Bus Routes (off by default),
  each remembered per device; no Layers button and no dividers between the
  switches (revised the same day from a slide-out row behind a Layers button).
  Live streetcar (and later live bus) markers get
  their own switches, not the Train Markers one: train markers are schematic
  estimates, cars are GPS. Phones keep "View Buses" only (until plan 15, L2:
  a Layers sheet with the same switches replaced it, 2026-11-04).
- **Bus lines draw at every zoom when on** (2026-11-03): they are off by
  default, so the default view stays clear.
- **One Live GPS switch** (2026-11-03, S8): the deck's Live Streetcars switch
  became Live GPS (caption "Streetcars", or "Streetcars & Buses" while Bus
  Routes is on), covering live streetcars and, while Bus Routes is on, live
  buses; the deck stays four switches (Train Markers, Streetcars, Buses, Live
  GPS). A fifth switch did not fit (measured in S8). Phones keep View Buses
  only, which also shows live buses. Plan 15, L2 replaced View Buses with a Layers sheet.

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
  defaults to `false`; production sets it to `true` (owner, 2026-11-02).
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
| S3 | Stop markers and stop departures | Done |
| S4 | Live streetcar positions | Done |
| S5 | TTC buses behind a toggle | Done |
| S6 | GO buses on the GO/UP Map View | Done |
| S7 | Station floor plans | Done |
| S8 | Live bus positions | Done |
| S9 | Live GO bus positions | Done |
| S10 | TTC night routes on the Map View | Done |

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

**Done 2026-11-02.** Owner decisions: production sets
`LINEWATCH_TTC_SURFACE_ARRIVALS_ENABLED=true`; scheduled times cover **all**
surface stops (chosen over streetcar stops only, after the measurement below).

*Measured* (feed S1000544, 1 GB heap, scratch PostgreSQL, one import):

| | Before (station stops) | After (all surface stops) |
| --- | --- | --- |
| `ttc_surface_stop_times` rows | 94,290 | 3,069,769 |
| table + indexes | 13 MB | 438 MB (heap 176, PK 119, stop index 143) |
| database | 84 MB | 516 MB |
| import wall time | ~10 s | ~51 s |
| peak heap before GC | 470 MB | 509 MB, no full GC |

Deleting the import (cascade) takes 2.2 s. With one retained inactive import
the table holds ~900 MB across a schedule change. A stop's scheduled query is
an index range read; the endpoint answered in ~4 ms. A live poll carries about
32k stop updates; 99% of realtime trip IDs match static trips.

*Built:*

- V91: `ttc_surface_stops` (9,122 stops: `stop_code`, name, coordinates,
  `station_id` where the stop resolves to a station, bay) and
  `ttc_surface_stop_routes` (boarding routes and headsigns; last stops and
  no-pickup rows excluded). `ttc_surface_stop_times` drops its key to the
  station-stop table and keys to the import. All surface trips are kept
  (97k). `surface_stop_catalog_available` joins the "complete import" checks,
  so an import from before V91 is re-imported by the refresh job.
- `TtcSurfaceArrivalIndexer` also builds `arrivalsByStop` for every stop in the
  feed; station rows are unchanged.
- `GET /api/surface/stops/{stopCode}/arrivals` (`TtcSurfaceStopArrivalService`):
  routes by destination, up to 3 departures each in the 2 h horizon, every one
  `live` or `scheduled`; `live.state` is `live`, `stale` (time of last update,
  predictions withheld), `unavailable` or `disabled` (no times, as the station
  view). A scheduled trip is dropped if predicted, or if earlier than its
  direction's last prediction. 404 for malformed or never-seen codes;
  `not-in-schedule` for a code only in a retained older import (feed version
  mismatch with the frontend asset); `unavailable` before the stop catalog
  loads. All 517 asset stop codes resolve against S1000544.
- Map View: `transit-streetcar-stops` pills (stop number on a nine-slice pill,
  minzoom 15, collision-hidden, above route badges and under station markers
  and names); the open stop's pill is filled. Press order: impact badge,
  station, stop pill, streetcar line.
- `SurfaceStopPanel` in the station panel's sidebar/sheet (header eyebrow
  "Stop 9037"): live-source line, link to the station for station stops, rows
  with route badge, destination and up to three tiles, each tagged Live or
  Scheduled with "Tomorrow" from `toronto-date.ts`; routes without departures
  collapse into one badge line; fresh notices for the stop's routes or stop.
  The stop belongs to the view it opened on; a station, an alert, search, a
  view change or GO/UP closes it.
- Search: a stop number ("9037", "Stop 9037") on the TTC network opens the
  stop, first on Enter; any TTC surface stop works, named from the streetcar
  asset when it has the stop.
- The streetcar card offers "Nearest Stop Departures" (nearest stop on its
  routes within 300 m).

*Checks:* backend suite 1,397 tests, 0 failures (new:
`TtcSurfaceStopArrivalServiceTest`, `TtcSurfaceStopArrivalControllerTest`,
`TtcSurfaceStopRepositoryIntegrationTest` against PostgreSQL, per-stop indexer,
stop service-day boundary, import of non-station stops and trips, writer stop
routes, source-version flag). Frontend `test:fast` 2,087, typecheck, lint (no
errors). `tests/smoke/surface-stop.spec.ts` (phone pill press, desktop search
and unknown code) passes on desktop-chrome and mobile-chromium. Dev-server
checks at 1440 and 360 px (dark and light) with the endpoint served by a
scratch S3 backend: live, stale, off, unknown stop, Tomorrow, station link,
card to stop, no page errors or horizontal overflow.

*Not done:* browser Back does not close the stop panel; a stop opened from
search is not focused on the map (the response carries coordinates for that);
pills exist only for streetcar stops (bus stops wait for S5); stop zoom 15 is
the first tuning, not reviewed by the owner.

### S4 — Live streetcar positions (done 2026-11-02)

Real GPS positions of TTC streetcars on the TTC Map View, labelled live with
their age, and stale when old. Unlike estimated subway train markers they are
not schematic placements.

**Source (measured 2026-11-02, 4:55–5:00 PM, feed S1000544 active)**

- Open Data Toronto lists vehicle positions under *TTC BusTime Real-Time Next
  Vehicle Arrival (NVAS)* (Open Government Licence – Toronto): "Vehicle
  locations and next vehicle arrival & departure predictions", at
  `https://bustime.ttc.ca/gtfsrt`, to be used with TTC static GTFS. Its
  vehicle feed is `https://bustime.ttc.ca/gtfsrt/vehicles` (protobuf,
  134 KB) and `…/vehicles?debug` (text, 758 KB). `gtfsrt.ttc.ca/vehicles/position`
  serves the same data, but that host's dataset page describes only alerts,
  so the default is the documented BusTime URL. Text, like the other TTC
  GTFS-RT reads: no protobuf dependency. There is one feed for all modes; no
  streetcar-only endpoint exists (`vehicles/streetcar` is 404).
- One poll: ~1,850 vehicles, 758 KB uncompressed (the server sends no gzip).
  The trip-updates feed already polled every 15 s is 7.7 MB, so positions add
  about 10% to inbound transfer.
- The feed header advances every 25–30 s. A streetcar's own report is 44 s old
  at fetch (median; p90 58 s, p99 67 s, max 103 s over 1,924 readings).
- Route alone does not say streetcar: 69 of 217 vehicles on 5xx routes were
  replacement buses. Their trips' static headsigns say "Replacement Bus"
  (all of 503, 501B, 504C), and fleet numbers agree (every Flexity 44xx–46xx
  was on a streetcar trip, every bus on a replacement trip). 222 vehicles had
  no trip (yard and out-of-service moves); 1 streetcar had a trip not in the
  schedule.
- 7 of 141 streetcars on schedule trips were 180–750 m from their route's
  drawn line and from their own trip's shape: five 504s on King W near
  Dufferin and two 501s on Queen E, where the schedule has the
  Broadview/Gerrard diversion. These are real unscheduled diversions.

**Decisions**

- Owner (2026-11-02): in-service cars off their route's drawn line are
  **shown at their GPS position and flagged** in their card ("Off its mapped
  route"), not hidden.
- A car is shown only when its trip is in the active static schedule, on a
  route of mode streetcar, with a headsign that is not "Replacement Bus".
  Vehicles without a trip (yard moves) and unmatched trips are not shown: the
  map cannot say what they are. No fleet-number rule.
- Poll every 15 s (the feed changes every 25–30 s). The browser asks every
  15 s while the TTC Map View is open and the page is visible.
- Freshness: the source is stale when its header is older than 2 min; a car
  is stale when its own report is older than 2 min, and is dropped after
  5 min. Ages come from the server's clock (sent as seconds) and grow in the
  browser between reads, so a failed read or an offline phone turns cars
  stale and then removes them; old positions never read as current.
- Marker (revised after owner review, below): a streetcar glyph in the
  estimated train marker's style, above streetcar lines and stop labels and
  under station markers. Stale cars are pale and faded. Shown from zoom 11 (the
  TTC default view is 11.2). Route numbers beside cars from zoom 14.
- A press opens a vehicle card in the streetcar card's place: route badge and
  destination, "Live GPS · 40 s ago" (or "Stale · Last Report 3 min ago",
  and the title drops "Live"), vehicle number, the off-route note, and
  "Nearest Stop Departures" (the nearest stop on the car's route within
  300 m), which opens the S3 stop panel. A car press wins over a stop pill
  (cars are drawn above pills); stations still win.
- No "next stop": the feed's `stop_id` is not the merged schedule's (0 of 141
  streetcars' stops were within 800 m of the car), and `current_stop_sequence`
  on the matching trip lands p90 1 km and p99 13 km away.
- Flag `LINEWATCH_TTC_STREETCAR_POSITIONS_ENABLED`, default off, separate from
  `LINEWATCH_TTC_SURFACE_ARRIVALS_ENABLED` and alerts. The cars are always
  on when the source is enabled; they do not follow the Estimated Train
  Markers chip (they are not estimates).

**Backend**

1. `linewatch.streetcar-positions.*`: `enabled`, `url`, `initial-delay`,
   `fixed-delay` (PT15S), `max-source-age` (PT2M), `vehicle-stale-after`
   (PT2M), `vehicle-max-age` (PT5M).
2. `TtcVehiclePositionParser` (text, line scanner) and
   `TtcStreetcarPositionPollingJob`; the indexer joins trips to
   `TtcSurfaceScheduleCatalog`. Last-good snapshot kept on failure.
3. `GET /api/surface/streetcars/positions`: `state` (`live`, `stale`,
   `unavailable`, `disabled`), source, `sourceUpdatedAt`, thresholds, and
   vehicles (id, route, destination, coordinates, bearing, `ageSeconds`,
   `stale`). Disabled and unavailable carry no vehicles.
   `Cache-Control: no-store`.

**Frontend**

1. `src/app/streetcar-positions.ts`: fetch, age and stale rules, off-route
   distance to the route's drawn corridors (> 100 m), GeoJSON features, card
   labels.
2. `geographic-streetcar-vehicles.ts`: source, marker images and layers;
   `GeographicNetworkMap` polls on the TTC network, redraws ages every 5 s,
   and opens the vehicle card from a press (after stations and stop pills,
   before streetcar lines).

Checks: backend parser, indexer (replacement bus, no trip, unmatched trip,
old reports), service states and controller; frontend age/stale/off-route
rules and layer install; one Playwright spec (stubbed positions: marker,
card, stale, disabled). Validate the stale paths first.

**Built:** package `com.calebhabesh.linewatch.streetcarposition` (properties,
parser, indexer, cache, polling job, service, controller), config in
`application.yml` and `application-dev-live.yml` (on there), the env
examples and `check-env-functional-parity.sh`; frontend
`src/app/streetcar-positions.ts`, `geographic-streetcar-vehicles.ts`,
`GeographicStreetcarVehicleCard.tsx`, wiring in `GeographicNetworkMap.tsx`
and `installTransitLayers`, card styles in `overlap-chooser.css`; the smoke
API stub answers `disabled`. The source is recorded in the source gates.

**Measured end to end** (scratch backend on S1000544 against the real feed,
2026-11-02 ~5:10–5:25 PM): 151 streetcars indexed from 1,860 vehicles (226
without a trip, 13 unknown trips, 69 replacement buses left out). The
response is 44.6 KB (4.9 KB gzipped) and answers in 2–8 ms. Over 4 min
(7,150 car readings) served ages were median 49 s, p90 65 s, p99 74 s, max
137 s; 0.06% passed the 2 min stale limit. The source header was at most
47 s old when served. A second instance reading a frozen copy of the feed went
live → live with 36 of 147 cars stale (header 95 s old) → `stale` with every
car stale, and the browser drew them hollow with "Stale · Last Report 2 min
ago". With no schedule imported yet the endpoint said `unavailable` and drew
nothing.

**Checks:** backend suite 1,407 tests, 0 failures, 1 skipped (new:
`TtcVehiclePositionParserTest`, `TtcStreetcarPositionIndexerTest`,
`TtcStreetcarPositionServiceTest`, `TtcStreetcarPositionControllerTest`).
Frontend `test:fast` 2,100 (new `tests/streetcar-positions.test.mjs`),
typecheck, lint (no errors; existing warnings elsewhere).
`tests/smoke/streetcar-positions.spec.ts` (live car card and nearest stop,
stale source, disabled source not asked again; it blocks service workers so
`page.route` sees the read) and `surface-stop.spec.ts` pass on
mobile-chromium and desktop-chrome against a fresh production build.
Dev-server checks with the endpoint routed to the scratch backend at 1440
and 360 px, dark and light: cars drawn in layer order, cards, one read per
load, no page errors or horizontal overflow.

**Owner review follow-up (2026-11-02).**

- *Max zoom:* the Map View zooms to 19 (was 17); the vector base map
  overzooms. Line widths hold their zoom-17 values beyond it.
- *Stop labels:* black on white like the TTC live map, not red-edged pills
  that read as route badges. Placement: our stop coordinates are the
  published GTFS stop positions (the pole, usually on the sidewalk), the same
  points the TTC map uses (checked 2167, 1149, 986). The TTC map draws a dot on
  that point with the label above; our pill was centred on it and covered the
  street, so it looked "on the line". Now a dot marks the exact position
  (`transit-streetcar-stop-dots`, always shown from zoom 15) and the label
  sits above it (collision-hidden); a press on either opens the stop. The open
  stop's label turns dark.
- *Streetcar marker:* redrawn from the train glyph's paint
  (`readTrainMarkerPaint`: outline, core stroke, dark windows, nose arrow) as
  a shorter, blunt, three-section articulated body, 18 px long at zoom 11, 26
  at 13 (the subway glyph's size there) and 40 from 16, turned to the heading;
  no arrow without a heading; pale grey when stale.
- *Stop panel:* the "Live Times" box and the white footnote are gone. The panel
  is one Departures section in the Train Arrivals design, reusing the station
  surface route card (`SurfaceRouteCard`, now exported, pins optional): grey
  source line under the heading (live + schedule, or a stale, unavailable or
  off source by name), Live / Scheduled / Mixed badge per route and
  destination, tiles with the live-signal or calendar icon, red when due,
  "Tomorrow" under times after Toronto midnight, and an amber source note.
- *Scheduled until live:* scheduled times already filled any route or
  direction without fresh predictions inside the 2 h window; the 306 at Howard
  Park was empty because it is a night route with nothing in that window. A
  route and destination with nothing in the horizon now shows its next
  scheduled departures within 24 h (still `scheduled`; e.g. 306 at 1:22, 1:42
  and 1:52 AM, "Tomorrow"). A disabled stop-departures flag still shows no
  times.
- Checks: backend 1,408 tests, 0 failures, 1 skipped (new: next scheduled
  departures beyond the horizon). Frontend `test:fast` 2,100, typecheck, lint
  (no errors). `surface-stop.spec.ts` (now asserting the tile icons) and
  `streetcar-positions.spec.ts` (now waiting for the positions read and closing
  a stop opened by an early press) pass twice each on desktop-chrome and
  mobile-chromium on a fresh build. Dev-server checks with stop and position
  reads from a scratch backend: stop 1149 at 1440 and 360 px in both themes
  (no page errors or horizontal overflow), and stop labels and car glyphs at
  zoom 18.3–18.6.

**Second review (2026-11-02).**

- *Tile shape:* the schedule/live icon clipped long times ("7 hr 19 min").
  Surface arrival tiles (stop panel and station surface section) now have a
  top row for the icon (`pt-5`, min height 82/86 px); at 360 px the longest
  time keeps at least 6 px each side and never meets the icon.
- *Night routes:* the published GTFS colours the 300-series night routes
  `#0054A6` (daytime routes `ED1C24`). Night badges are now that blue on
  white with a blue edge (`src/app/ttc-route-badge.ts`), in the stop panel,
  the station surface section, saved stations and the live car card; night
  cars on the map draw in that blue.
- *All route families (owner: accuracy first):* every TTC surface route
  badge now uses its GTFS colour family: regular red `ED1C24`, night
  `0054A6` blue on white, 400-series Community grey `6D6E71`, 900-series
  Express green `00A651` (white numbers), and routes 5 and 6 (Lines 5 and 6,
  GTFS route_type 0 like streetcars, so they can appear in stop data) in the
  app's line colours. The number-range rule was checked against every route
  in feed S1000544: no surface route differs. Applied to the stop panel, the
  station surface section, saved stations, the live car card, and the TTC
  Streetcar / Bus Alerts badges (status sidebar, desktop overview, notices
  panel), which were all fixed red before. White on Express green is 3.2:1,
  below the 4.5:1 text guideline at badge size; kept for accuracy with the
  TTC's own badges.
- Checks (after the route families): frontend `test:fast` 2,102 (the current-service source test now
  expects TTC route-family colours), typecheck, lint (no errors); stop,
  streetcar, station surface and notice smoke specs (17) pass on
  desktop-chrome and mobile-chromium on a fresh build; stop panel with 506,
  306, 939 and 403 checked at 1440 px in both themes.
- Checks (tile and night badge): frontend `test:fast` 2,102 (new `tests/ttc-route-badge.test.mjs`),
  typecheck, lint (no errors); stop, streetcar and station surface smoke
  specs pass on desktop-chrome and mobile-chromium on a fresh build; dev-server
  check of the stop panel at 1440 and 360 px, both themes, no overflow.

**Third review (2026-11-02).**

- *Night badge edge:* the 2 px inset ring read as a thin line with white
  outside it. It is now a 2.5 px solid blue border, the badge's outermost
  line, in every place the night badge shows.
- *Departures entrance:* the stop's Departures section fades and rises in
  (220 ms), each route a 40 ms beat after the last (capped at 200 ms), only on
  first appearance or when a new route joins; the 15 s refresh keeps the
  elements and does not replay it (checked: the animation stays `finished`
  across a refresh). Off under reduced motion (app setting and
  `prefers-reduced-motion`). One new keyframe, `surface-stop-enter`; the CSS
  inventory counts in `css-architecture-guardrails` and `measure-css` move
  from 83 to 84.
- *Refresh flash:* each 15 s refresh blinked the header's "Updating" badge
  (about 15 ms), shifting the panel down and back, and replaced every tile
  whose time moved (keys carried the time). "Updating" now shows only while a
  stop's first read loads, as on station panels, and tiles are keyed by slot
  so a refresh changes their text in place (checked: no nodes added or
  removed across two refreshes at stop 15644).
- *Stop camera:* opening a stop (press or search) flies the Map View to it
  like a station: the shared `focusGeographicCamera` (station framing above the
  phone sheet, or in the area the desktop sidebar and legend leave), at least
  zoom 16 so the pills draw. A stop open when the map mounts keeps the
  restored camera; a search before the stop list loads flies once it arrives.
  Bus-only stops are not drawn and do not move the camera.
- Checks: frontend `test:fast` 2,102, typecheck, lint (no errors); stop,
  streetcar, station surface and notice smoke specs (17) pass on
  desktop-chrome and mobile-chromium on a fresh build; badge close-ups at
  1440 px in both themes.

**Not done / open:** production enablement of
`LINEWATCH_TTC_STREETCAR_POSITIONS_ENABLED` (owner). The owner's :8080
backend needs a rebuild to serve the endpoint; until then the Map View gets a
404 and retries every 30 s, drawing nothing. The revised stop labels and
car glyph have not been reviewed by the owner yet. No frame
A/B with cars shown was run (150 symbols, one `setData` per 5 s). The card
stays where the car was pressed while the car moves on (its ring follows the
car). The nearest stop can be the opposite direction's platform. Text feed
is ~5.5× the protobuf (758 vs 134 KB); protobuf would need a dependency.

### S5 — TTC buses behind a toggle (done 2026-11-03)

The TTC bus network on the Map View behind a toggle: off by default,
remembered per device, TTC network only. Wayfinding only, like the
streetcars: no service status, never coloured by service data, no vehicles.

**Settled before building**

- *Scheduled fallback:* S3 already settled it. `ttc_surface_stop_times`
  covers every surface stop, bus and streetcar, and a route with nothing in
  the 2 h window shows its next scheduled departures within 24 h. S5 adds no
  backend work. Checked: bus-only stop 11630 (Dufferin Mall) opens with the
  402's scheduled times and "No live estimates here now".
- *Live bus positions:* not in S5 (owner); outlined as S8.
- *Line style:* TTC red, dashed (owner, above).

**Asset (measured, feed S1000544)**

`generate:surface-catalog -- --mode bus` reuses the S1 generator and corridor
model (`buildSurfaceCorridors`; the streetcar output is byte-identical). Bus
mode differs in three places, each found in the feed:

- Community routes (400, 402, 405, 406) run on part-week services (Mon/Wed/Thu,
  Tue/Fri), not every weekday: bus mode takes any Monday-to-Friday service.
- They run 12 to 16 trips a day, under the 6-trips-per-gap floor once split by
  direction and variant: a gap also draws when it carries a quarter of one of
  its routes' busiest gap (`minRouteShare: 0.25`). A busy route's rare branch
  still stays out.
- Community trips leave the first stop's `shape_dist_traveled` blank (meaning
  0); they were skipped before. It now reads as 0 for both modes.

Result: 180 daytime routes (night 300-series excluded, as for streetcars),
all drawn; 859 patterns, 1,557 corridors, 1,353 km; up to 12 routes on one
corridor; 687 route sets; 8,310 stops, all with pole numbers. Generation
takes about 30 s and fits a 1 GB heap (same output at 1, 2 and 4 GB).

| Form | Raw | Gzipped |
| --- | --- | --- |
| One GeoJSON (corridors + full stops) | 2,570 KB | 354 KB |
| Corridors + routes (`ttc-surface-bus.json`) | 626 KB | 117 KB |
| Stops: code, name, routes, 5 decimals (`ttc-surface-bus-stops.json`) | 1,621 KB | 175 KB |
| Vector tiles z12–15, whole tileset | — | 579 KB (1,143 tiles) |
| Vector tiles, one phone view (360×640) | — | 2–8 KB per zoom |

Tiles were cut in the scratchpad with `geojson-vt` + `vt-pbf` (the tiler
MapLibre itself uses for GeoJSON sources), corridors z12–14 and stops at 15,
4096 extent, gzip per tile.

**GeoJSON, not PMTiles.** Tiles would move 2–8 KB per phone view instead of
117 KB once (and 175 KB at stop zoom). Against that, PMTiles needs a runtime
dependency and a MapLibre protocol, a tiler in the build (tippecanoe is not in
the toolchain), byte-range requests through Next, the tunnel and the service
worker, and gives up the client-side lookups the map uses: a stop by number
for the camera, and the nearest stop on a line's routes for the card. The
measured phone cost of zoom-gated GeoJSON (below) is small, so the simpler
path won. Revisit if S6 GO buses or S8 live buses push past the budgets.

**Phone cost (measured).** No map budget covers the Map View, so a temporary
Playwright spec measured the production build (`mobile-chromium`, Pixel 5
viewport, real-GPU Chrome, CPU throttled 4×, service workers blocked, camera
on Dufferin at zoom 13.4), twice:

- *Turning buses on:* main thread +250–290 ms over an idle 5 s window,
  longest task 28–32 ms, none over 50 ms; workers 15–18 ms. Turning on again
  from cache: longest task 43–45 ms. Heap unchanged within noise (31–37 MB).
- *Stops:* zooming in to stop zoom (loading and parsing 1.6 MB) gave one task
  of 55 ms, the only one over 50 ms. Heap +~10 MB (44–47 MB).
- *Frames:* five drags per pass at zoom 13.4 and 12.2 (every bus line in
  view), buses off and on, alternating: median and p95 16.7 ms throughout
  (display rate), at most 1 frame over 20 ms in a pass, with no difference
  between on and off.
- Transfer: 116 KB corridors, 175 KB stops (gzip; the stop file only from
  zoom 14).

**Built**

- `scripts/generate-surface-catalog.mjs --mode bus` and
  `scripts/lib/surface-corridors.mjs` (`isDaytimeBusRoute`,
  `buildSurfaceCorridors` with `minRouteShare`); assets
  `frontend/public/assets/linewatch/geographic/ttc-surface-bus.json` and
  `ttc-surface-bus-stops.json`.
- `src/app/geographic-bus-catalog.ts`: types, loaders (each fetched once),
  zooms (lines at every zoom since the owner review; badges 14, stops 15,
  stop file from 14), stored toggle
  (`linewatch-map-view-buses-v1`, "on"/"off"), stop lookups, card rows.
- `src/components/geographic-bus-layers.ts`: `transit-bus-casing`, `-line`
  (`#ED1C24`, dash 2.2/1.4, 0.9 px at 12, 1.6 at 14, 3.2 at 17), invisible
  `-hit`, `-badges` (route family colours from `ttc-route-badge.ts`, five then
  "+N", drawn on `styleimagemissing` so only route sets in view are drawn),
  `-stop-dots` and `-stops` (label above the dot, as streetcar stops). Lines
  sit under `transit-streetcar-casing` (or the subway casing), badges under
  the streetcar badges, stops under the streetcar stops, whichever installs
  first. A pole the streetcar asset has is left to its streetcar label.
- `GeographicNetworkMap`: `busesEnabled` loads and installs the corridors
  (again after a style change), the stop file from zoom 14 or when a stop
  opens; off removes the layers and sources. Press order: impact badge,
  station, live car, streetcar stop, bus stop, streetcar line, bus line. A
  bus line opens the routes card as "Bus Routes" (nearest bus stop on its
  routes within 300 m, schedule period, "Not live service"). A bus stop opens
  the stop panel and flies there like a streetcar stop; with buses off, a bus
  stop from search leaves the camera.
- Controls: desktop, a Buses button in the Map View toolbar (TTC only;
  replaced by the layer deck in the owner review below); phone,
  "View Buses" above "View Trains" in the left column (lifted one slot with
  `translate`, no new `!important`). State lives in `LineWatchShell`.
- The Map View toolbar is now placed by `observeDesktopControlRail` like the
  System Map's: it was centred and only just cleared the right-hand buttons
  at 1440 px, and one more button overlapped them. At 1440 px with the sidebar
  it now drops its slider and captions (as the System Map toolbar does);
  from 1680 px it keeps them.
- The routes card scrolls as a whole when its placement is short (phone,
  between the side columns): the list had shrunk to nothing and the stop
  button and source note overlapped. This affected streetcar cards too.
- Docs: domain invariants (bus routes behind the toggle), feature reference,
  README. Source gates unchanged: same archive and licence, nothing new
  polled.

**Checks.** Frontend `test:fast` 2,119 (new `tests/bus-catalog.test.mjs`,
`tests/geographic-bus-layers.test.mjs`, bus cases in
`surface-corridors.test.mjs`), `test:scripts` 43, typecheck, lint (no errors). New
`tests/smoke/surface-buses.spec.ts` (phone: off by default, nothing fetched,
on, remembered across reload, bus stop opens, off; desktop: toolbar button,
gone on GO/UP) with `surface-stop` and `streetcar-positions` on
desktop-chrome and mobile-chromium; `geographic-map-lifecycle`,
`map-mode-regressions`, `network-fade` and `map-line-badges` on both. Smoke
locators for the train toggle now exclude the bus toggle, which shares its
class. Dev-server checks at 360 and 1440 px in both themes: lines, badges,
stops, card, stop panel and camera, toggle on/off, no page errors or
horizontal overflow; 600 px tall phone, the legend column still clears the
three buttons.

**Owner review (2026-11-03).**

- *Bus lines at every zoom:* `transit-bus-casing`, `-line` and `-hit` have no
  minzoom (0.6 px at zoom 9, 0.9 at 12); badges stay at 14 and stops at 15.
  At the default view the network reads as a thin dashed mesh under the
  streetcars and subway. Re-measured on the production build (same method
  as above, camera at zoom 11.2 with the whole network in view, twice):
  turning buses on adds 330–360 ms of main-thread work over 5 s, longest
  task 36–50 ms, none over 50 ms; pans at median and p95 16.7 ms with no
  frame over 20 ms, on or off; idle cost with buses on unchanged.
- *Layer deck:* the toolbar's Buses button (4 px from its left divider, 13 px
  from its right; its group had no gap after the divider) is gone. A first
  version slid a row out from a Layers button; the owner made it fixed and
  fused. `#map-view-layers-row` hangs from the toolbar's bottom edge, inset
  22 px each side (18 when compact), joined by 10 px concave fillets
  (`::before`/`::after` radial gradients in the panel colour), rounded at
  the bottom; toolbar and deck share one `drop-shadow` so neither shades the
  other. On the dark map the edges were hard to make out (owner); a traced
  white edge was tried and rejected, so the dark toolbar carries a subtle
  inset highlight along its top edge (white at 10%). The deck is 48 px tall
  with no top padding, close under the first row.
- *Trains in the deck (owner: trains belong with the surface switches;
  placement left to judgement):* the Train Markers switch moves into the deck
  on the desktop TTC Map View as its first switch, and the right-hand Train
  Markers panel folds away there (it stays everywhere else: GO/UP, both
  System Maps, phones). One setting, one accessible name ("Toggle estimated
  train markers (…)"). No switch hides the subway lines, which carry status
  and alerts, and train markers are not called live (they are estimates).
  Moving it out of the right-hand cluster also lets the toolbar keep its
  captions at 1440 px. Four labelled switches needed 813 px against a 626 px
  deck, so each switch now reads mode over detail: Trains / Estimated (or
  the marker status, Closed), Streetcars / Routes, Streetcars / Live GPS (or
  Stale, Unavailable, Source Off), Buses / Routes; the switch itself carries
  on or off; switches are 34×20 (the Train Markers one is 38×22). Fits with
  17 px to spare at 1440 px and 2 px compact at 1024 px. Trains use the
  train-in-tunnel icon so they never read as the streetcar glyph.
- *Animations (Web Animations, no stylesheet keyframes, none under reduced
  motion):* entering the TTC Map View (once the map is ready), the deck
  unrolls from the toolbar (clip-path, 280 ms) and its switches fade down
  one after another (45 ms apart), while the right-hand Train Markers panel
  folds to zero width (`useCollapseWidth`, 280 ms; its contents fade in the
  first half and are clipped, not squeezed) so the buttons beside it close
  up. Leaving it is the inverse: the switches fade out right to left and the
  deck rolls back up before the System Map takes over (the view toggle's
  new `onTransitionStart` starts it; the switch waits for it, about 100 ms
  longer than the toggle's own 160 ms glide), then the panel unfolds. TTC to
  GO/UP rolls the deck up alongside the network fade without holding the
  switch (the network can flip just before it finishes); GO/UP to TTC
  unrolls it again. Checked frame by frame (CDP screencast) in all four
  directions. Three switches in the Train Markers design (`MapLayerSwitch`,
  `SquishSwitch`), no dividers: Streetcar Routes, Live Streetcars (status On,
  Off, Stale, Unavailable or Source Off from the positions read) and Bus
  Routes. TTC only. When the toolbar compacts (captions dropped, 1440 px with
  the sidebar and below) the switches drop their text and keep icon, switch,
  accessible name and title; the deck is never wider than the toolbar
  (checked 1024–1920 px, no overflow). `measureDesktopMapInsets` counts the
  deck in the toolbar's reach, so camera framing keeps clear of it.
- *Streetcar Routes off* removes the streetcar lines, badges and stops
  (`removeStreetcarLayers`), closes their card, and stops their stops moving
  the camera; theme and network reinstalls honour it (`installTransitLayers`
  `streetcarRoutes`). The catalog stays loaded for live cars and lookups. A
  pole shared with buses moves to the bus label while streetcars are off.
- *Live Streetcars off* stops the positions read, clears the cars and closes
  their card. Cars no longer wait for the streetcar routes to install;
  streetcar and bus badges and stops install under the cars either way.
- Preferences: `src/app/map-view-layers.ts`
  (`linewatch-map-view-streetcars-v1`,
  `linewatch-map-view-streetcar-positions-v1`; the bus key unchanged).
- Checks: frontend `test:fast` 2,122, typecheck, lint (no errors);
  `surface-buses` (desktop test now drives the layer deck), `surface-stop`,
  `streetcar-positions`, `geographic-map-lifecycle`, `map-mode-regressions`,
  `network-fade` and `map-line-badges` on desktop-chrome and mobile-chromium
  on a fresh build (101 passed). Dev-server checks at 1440 (dark) and 1680
  (light): row open, each switch, Escape, no page errors or overflow.

**Not done / open:** bus badge and stop zooms (14/15) are first tuning, not
reviewed by the owner. Phones have no streetcar switches (owner: View Buses
only for now). `streetcar-positions` "live car opens its card" failed once on the
first run after a fresh build (camera off the car) and passed in four runs
after. Bus badges sit over subway lines where they cross, as streetcar badges
do.

### S6 — GO buses on the GO/UP Map View (done 2026-11-03)

The GO bus network on the GO/UP Map View behind its own switch: off by
default, remembered per device, GO/UP network only. Wayfinding only: no
service status, never coloured by service data, never part of GO/UP rail
status, no vehicles (S8). GO stop numbers open departures from Metrolinx
Next Service.

**Owner decisions (2026-11-03)**

- *Line style:* GO green (`#00853E`), dashed, thinner than the GO/UP rail
  lines: the TTC bus rule (agency colour, dashed). The dash keeps it apart
  from the solid Kitchener line, which shares the green. Chosen over a dark
  slate dash (reads as a basemap road) and a solid green hairline (reads as
  Kitchener). Badges use each route's GTFS colour.
- *Deck:* GO/UP gets the same layer deck, with Trains / Estimated and
  GO Buses / Routes; Train Markers moves into it on the desktop GO/UP Map
  View as on TTC (the right-hand panel folds away). Phones get the
  "View Buses" button on GO/UP too ("View GO Buses").
- *Stop departures:* a new per-stop endpoint over Metrolinx GO Next Service
  (the API, key and agreement already used for GO Bus rows at stations),
  limited to stops in the asset, cached, off with regional surface arrivals.
  Recorded in the source gates as a widened use.

**Asset (measured, GO GTFS feed 20261028133417, Oct 28 – Nov 27)**

The GO feed differs from the TTC one, so `scripts/generate-go-bus-catalog.mjs`
is its own generator over the shared corridor model (`buildSurfaceCorridors`):

- Service is dated (`calendar_dates.txt` only, one service per day). The
  weekday is the first full Monday-to-Friday week in the feed (Nov 2–6);
  route trip counts are that week's, shown as a weekday average.
- Neither `shapes.txt` nor `stop_times.txt` has `shape_dist_traveled`. The new
  `placeStopsAlongShape` measures the shape and puts each stop where the
  shape passes closest, in stop order (the earliest pass within 30 m of the
  closest, so a loop never jumps ahead). A pattern with a stop more than 150 m
  from its shape is dropped: two rare route 19 shapes (5 trips a week, a stop
  195 m off); route 19's main shapes draw.
- No pole numbers in `stop_code`: GO's stop number is `stop_id` ("00008"),
  which gotransit.com and Next Service use. Rail stations (letter IDs) cut
  lines but are not bus stops; the rail catalog draws them.
- Branches are `route_variant` (21A, 27F); badges are per route.
- Thresholds over five weekdays: a stop gap draws with 5 trips (one a day) or
  a quarter of its route's busiest gap, so a busy route's one-trip variant
  stays out.
- Opposite carriageways of a highway are farther apart than a street's, so
  they merge within 60 m (25 m for TTC): 1,929 km of corridors at 25 m,
  1,553 km at 60, 1,482 at 100; 150 m started folding crossing roads.
  Simplified at 5 m.

Result: 38 bus routes, 37 drawn (35 is the UP Express replacement bus,
weekends only: listed, not drawn); 201 patterns from 7,289 week trips;
483 corridors, 1,553 km; up to 10 routes on one corridor; 813 bus stops.
Generation takes about 2 s. It also writes
`backend/src/main/resources/regional/go-bus-stops.csv` (stop number, name,
routes), the backend's allowlist.

| Form | Raw | Gzipped |
| --- | --- | --- |
| Corridors + routes (`go-surface-bus.json`) | 230 KB | 47 KB |
| Stops (`go-surface-bus-stops.json`) | 161 KB | 18 KB |

**GeoJSON again.** The whole GO network is 65 KB gzipped, under half of the
TTC bus corridors alone, so tiles would save nothing worth a tiler and a
protocol. The stop file loads with the corridors (no zoom gate).

**Departures: what a GO stop can honestly show.** Station GO Bus rows come
from Next Service `Stop/NextService/{code}` for the bus stop codes listed at
each GO/UP station; the same call answers for any GO stop number. Its rows
carry `ScheduledDepartureTime` and usually `ComputedDepartureTime`, and before
a trip is tracked the computed time repeats the schedule (a live Bramalea read
on 2026-11-03 had 05:00:00 for both, next to a tracked 04:50:45 against
04:50:00). The station view labels any row with a computed time live. The
stop view labels a time live only when the computed time differs from the
schedule, otherwise scheduled; a row with no scheduled time is left out.
Next Service has no field that says a trip is under way, so the "or under
way" half of the proposal was not built. The GO static schedule for buses is
not imported (the regional import keeps rail, `route_type` 2).

**Phone cost (measured).** Production build, temporary Playwright spec
(`mobile-chromium`, Pixel 5 viewport, Chrome on the real GPU with
`--use-angle=gl`, CPU throttled 4× over CDP, service workers blocked), two
cameras (zoom 9, the whole network; zoom 11.5 over Toronto, the densest part),
each run twice:

- *Turning GO buses on* (both files parsed and installed): main thread
  +310–445 ms over an idle 5 s window (idle 34–39 ms), longest task
  32–45 ms, none over 50 ms; workers 16–18 ms. Turning on again from cache:
  longest task 46–52 ms; one task of 52 ms in two of four runs (zoom 9).
- *Idle with GO buses on:* unchanged (35–39 ms per 5 s).
- *Heap:* within noise (31–43 MB before, 40–43 MB on).
- *Frames:* five drags per pass, on / off / on / off: median 16.7 ms, p95
  16.7–16.8 ms (display rate), no frame over 20 ms in any pass, on or off.
- Transfer: 47 KB and 18 KB gzipped (the test server sent them raw, 230 and
  161 KB).

**Built**

- `scripts/generate-go-bus-catalog.mjs` (`npm --prefix frontend run
  generate:go-bus-catalog -- --go-gtfs <zip>`); `placeStopsAlongShape` in
  `scripts/lib/surface-corridors.mjs`; assets
  `frontend/public/assets/linewatch/geographic/go-surface-bus.json`,
  `go-surface-bus-stops.json`, and the backend allowlist above.
- Backend: `GoBusStopCatalog` (the CSV), `GoBusStopDepartureService`,
  `GET /api/regional/bus-stops/{stopCode}/departures`
  (`GoBusStopDepartureController`, `GoBusStopResponses`). Unknown or
  malformed numbers (not in the list; rail codes like "UN") are 404 and never
  reach Metrolinx. `regional-enabled` off: `disabled`, no call. Each stop's
  rows are cached for `regional-cache-ttl` (30 s) and minutes recomputed per
  request; all stops together make at most
  `regional-stop-fetches-per-minute` (60,
  `LINEWATCH_REGIONAL_SURFACE_ARRIVALS_STOP_FETCHES_PER_MINUTE`) upstream
  reads; over that the stop answers `unavailable` ("busy") without a call.
  A failed read is `unavailable` (cached for the window); a source older than
  `regional-max-source-age` (5 min) is `unavailable` ("stale") with no times.
  Departures within the horizon (2 h), up to 3 per route and destination.
- `src/components/geographic-bus-layers.ts` is now a kit
  (`createBusLayerKit`: ids, style, zooms, badge colours, layer order) with the
  TTC bus layer as one configuration (exports and ids unchanged; its stop
  pill images are renamed `transit-bus-stop-pill*`).
  `src/components/geographic-go-bus-layers.ts` is the GO configuration:
  `transit-go-bus-*` under `transit-routes-casing`, badges and stops under the
  station markers; widths 0.6 px at zoom 7, 1 at 10, 1.8 at 13, 3.2 at 17;
  badges from zoom 11, stops from 12.5. On the dark map the line is a lighter
  green of the same hue (`#3CC47A`): at a pixel wide `#00853E` with its black
  casing all but disappeared in the dev-server check. Light map keeps
  `#00853E`.
- `src/app/go-bus-catalog.ts` (types, loaders, `linewatch-map-view-go-buses-v1`,
  stop lookups, nearest stop within 1.5 km, card rows in GO colours),
  `src/app/go-bus-stop-departures.ts`, `src/components/GoBusStopPanel.tsx`
  (the TTC stop panel's sheet, header and arrival tiles; "GO Stop 00008";
  source line "Metrolinx live estimates + GO schedule", "GO schedule · no live
  estimates here now", or off/unavailable; routes with nothing listed as
  badges; an amber note that a time is live only when Metrolinx moved it and
  that GO buses do not affect train status; refresh every 30 s).
- `GeographicNetworkMap`: `goBusesEnabled` loads and installs both files on
  GO/UP (again after a style change); off removes the layers. A GO line press
  opens the routes card as "GO Bus Routes"; a GO stop press opens the GO stop
  panel and flies to it (zoom 15). The deck renders on both networks (TTC:
  Trains, Streetcars, Live Streetcars, Buses; GO/UP: Trains, GO Buses). Its
  exit plays on any network switch and on leaving the Map View on either
  network; the next deck's unroll cancels a leftover roll-up so it never stays
  closed. Checked frame by frame (CDP screencast) in four directions: GO/UP
  Map View to and from the System Map, GO/UP to TTC, TTC to GO/UP.
- Shell: the open stop is network-scoped (`{ code, view, network }`), so a
  TTC stop never opens on GO/UP or the reverse; stop search stays TTC-only.
  `trainMarkersInLayerDeck` is now the desktop Map View on either network.
- Docs: domain invariants, source gates, feature reference, README.

**Checks.** Backend: new `GoBusStopDepartureServiceTest` (8) and
`GoBusStopDepartureControllerTest` (2); full backend suite 1,418 passed
(1 skipped) in a scratch copy. Frontend `test:fast` 2,135 (new
`tests/go-bus.test.mjs`, placement cases in `surface-corridors.test.mjs`),
typecheck, lint (no errors). New `tests/smoke/go-buses.spec.ts` (phone: off
by default, nothing fetched, on, remembered, its own key, GO stop opens with
labelled times, off; desktop: GO/UP deck with Trains and GO Buses, switch to
TTC shows TTC's deck) and the updated `surface-buses` desktop test; with
`surface-stop`, `streetcar-positions`, `geographic-map-lifecycle`,
`map-mode-regressions`, `network-fade` and `map-line-badges` on
desktop-chrome and mobile-chromium (103 passed). Dev-server checks at 1440
(both themes) and 360 px (both themes): lines, badges, stop labels, card,
toggle, no page errors or horizontal overflow.

**Owner review (2026-11-03).** The deck is tapered to its switches on both
networks instead of spanning the toolbar inset with the switches spread out:
centred under the toolbar (`width: fit-content`, `margin-inline: auto`,
12 px between switches), still never wider than the toolbar's inset
(`max-width`). Measured on the dev server: GO/UP 314 px and TTC 614 px under
a 670 px toolbar at 1440 and 1680 px; compact at 1024 px, 132 and 260 px
under 298 px; centred to the pixel, no overflow, both themes.

**Not done / open:** the dev backend on :8080 needs a restart to serve the
new endpoint (until then a GO stop shows "not in the GO bus stop list").
GO stop search by number is not added. The station GO Bus view still labels
every computed time live (owner to decide whether it adopts the stop rule).
GO badge and stop zooms (11, 12.5) and the dark-map green are first tuning,
not reviewed by the owner.

### S7 — Station floor plans (done 2026-11-03)

Do not build until one source is confirmed in writing:

1. A Toronto Open Data station-footprint dataset.
2. OpenStreetMap indoor/railway platform data. ODbL: attribution and
   share-alike apply to derived data. Coverage varies by station.
3. The TTC agreeing to reuse of its plans.
4. Self-drawn from public sources.

Record the chosen source in the source gates before any asset is added.

*Found 2026-11-03:* livemap.ttc.ca draws its station plans from the TTC's own
ArcGIS Online feature service `StationFootprints_View`
(`services2.arcgis.com/4bxnkNIQISOHuO8V/…/StationFootprints_View/FeatureServer`,
layers StationPaths and StationExits), owned by the TTC GIS account and
publicly queryable. Its item says "View layer for station layout map layers,
for the livemap app" (floor plans, exits, stairs, escalators, elevators,
retail). It carries no licence, access or copyright text and is not an Open
Data Toronto dataset, so OGL–Toronto does not cover it: being reachable is not
permission. It is a candidate for option 3 (ask the TTC whether it may be
reused under OGL–Toronto with attribution). Only the service metadata was
read; no features were downloaded.

*Owner decision (2026-11-03):* build S7 from `StationFootprints_View`, credited
to the TTC in Privacy & Acknowledgements, without waiting for written
permission (recorded in the source gates with that basis). To be detailed and
built after S8.

**Service (inspected 2026-11-03).** `StationFootprints_View` FeatureServer
(item `f2a1b2d052784774baa1aa77ab8d3974`, owner `TTCGIS`, public, a view;
last modified 2026-10-21; capabilities Query only; native spatial reference
Web Mercator 102100, queried as WGS84; 1,000 records per page; no licence,
access or copyright text). Two layers only (ids 0, 2, 4, 5 do not exist):

| Layer | Geometry | Features | Fields used |
| --- | --- | --- | --- |
| 1 StationPaths | Polygon (480) / MultiPolygon (2) | 482, ~10,000 vertices | `stop_code` (parent station's GTFS stop code), `floor`, `building_name` (sort only) |
| 3 StationExits | Point | 2,583 | `icon_name`, `stop_code`, `exit_direction`, `description`, `stop_name` (station-name points only) |

- *Stations:* 109, every station in our catalog (Lines 1, 2, 4, 5, 6). Each
  area is one level of one part ("Jane Stn Eastbound Platform", "… Bus
  Terminal"); one floor per area. Levels per station: 1 (26 stations), 2 (8),
  3 (58), 4 (15), 5 (Eglinton), 6 (Avenue). Floors −5 to 2; level names are
  Street, Concourse, Platform and variants (Bus Terminal, Mezzanine, Bridge…).
- *Points:* stairs 1,127, elevators 485 (one per floor per shaft, about 222
  shafts), escalators 456, entrances 313 (`location_type` 2, each with a name
  such as "Jane St Entrance"; 290 carry a compass `exit_direction`, 23 at King
  and Dufferin are lettered `exit_left_A2` with a placeholder direction),
  station-name label points 109, retail 52, washrooms 18, bike parking 12,
  PPUDO 9, lost and found 1, photo ID 1.
- *Raw size:* about 0.5 MB of area GeoJSON and 1.0 MB of point GeoJSON.
- *Not in the service:* bus bays. The service's renderer and a dark variant
  (`StationFootprints_View_dark`, layer 1 only) carry styling; other services
  in the same account (`Subway_Stations_*`, `TTC_surface_stops`, …) are not
  covered by the owner decision and were only listed.
- *Join:* the service's `stop_code` is the current GTFS parent-station stop
  code (Jane 1167 = stop_id 43295). Our `ttc-catalog.json` `gtfsStopId`
  values are from an older feed (Jane is 43281, now St Clair West), so the
  generator joins by station name, with one alias ("Jane & Finch" → "Jane
  And Finch"). The stale catalog ids are a separate issue, not fixed here.

**Settled before building (owner, 2026-11-03)**

- *Switch:* none. Plans appear on their own when zoomed in on the TTC Map
  View, like basemap detail; the deck (full at 1440 px) and phones are
  unchanged.
- *Levels:* every level at once, deeper darker (street level lightest,
  platforms darkest), lower levels drawn under upper ones. No level picker.
- *Features:* entrances and elevators only. Stairs, escalators, retail,
  washrooms and bike parking are left out. (Revised in review, below: stairs
  and escalators with their up/down arrows, and bus bays from GTFS.)
- *Phones:* same as desktop.

**Asset.** `npm --prefix frontend run generate:station-plans`
(`scripts/generate-station-plans.mjs`; `--from <dir>` reads saved layer
GeoJSON instead of querying) writes
`frontend/public/assets/linewatch/geographic/ttc-station-plans.json`:

| Content | Count |
| --- | --- |
| Areas (`station-area`: stationId, floor), deepest first | 482 (none dropped) |
| Entrances (`station-entrance`: stationId, bearing, name, letter?) | 313 |
| Elevators (`station-elevator`: stationId), shaft points within 4 m merged | 226 (from 485) |
| Raw / gzipped | 390 KB / 70 KB (72 KB on the wire, 400 KB decoded) |

Coordinates are rounded to 6 decimals (about 0.1 m), repeated vertices
dropped. Two runs give byte-identical output. A service station missing
from the catalog fails the run. Nothing is fetched from the TTC at runtime,
and raw responses are not kept in the repository.

**Zooms and draw order.** The file loads from zoom 15; footprints draw from
15.5, entrance arrows and elevator tiles
from 16.5, entrance names from 17.5.

- Footprints (`transit-station-plan-fill`, `-outline`) sit under the lowest
  transit line present (bus, then streetcar, then subway casing), so every
  route draws over them.
- Icons (`transit-station-plan-icons`) sit just above the subway lines,
  before `transit-commute-line`: under alerts, impact arrows, station markers
  and names, stop labels, train markers and live vehicles. They always draw
  and never push labels aside (`icon-ignore-placement`).
- Names (`transit-station-plan-labels`) are collision-hidden, so station
  names and stop numbers win.

Plans are installed by `installTransitLayers` (after every style change and
network switch, once the map has reached zoom 15) and on first load by
`GeographicNetworkMap`. Ids start with `transit-`, so a network switch removes
them; the network fade now also covers fill layers.

**Style.** Constant paint, never data-driven. Light: greys from `#eff0f2`
(street) to `#a9afb8` (−3 and below) at 78%, grey outlines. Dark: light greys
from `#b9bcc0` to `#5f6368` at 42% over the dark map, as livemap draws them,
near-black outlines. Entrance: a dark disc with a white edge and an arrow
turned to its bearing (out of the station; lettered exits use their named
direction); its name reads "A1 · Dufferin Street West Side" where lettered.
Elevator: a white tile with up/down triangles, the same in both themes. Not
pressable. An icon says where an elevator or entrance is, never whether it
works.

**Bus bays.** The plan service has none. The bay numbers livemap shows come
from TTC GTFS stop names ("Jane Station at Bus Bay 2" is stop 14700; Bays 3–5
are 14701–14703, Bay 1 is 15009; 526 GTFS stops mention a bay), which are
already our stop pills and S3 departures, under OGL–Toronto. So bays link
honestly through GTFS, not through the plan source. (Built in review, below:
bay badges from GTFS that open the bay's departures.)

**Built**

- `scripts/lib/station-plans.mjs` (join, ring cleaning, entrance arrows,
  elevator merge), `scripts/generate-station-plans.mjs`, the asset.
- `src/app/geographic-station-plans.ts` (types, zooms, labels; the loader was replaced by a URL source in review),
  `src/components/geographic-station-plan-layers.ts` (layers and icons);
  `installTransitLayers` installs plans when loaded;
  `GeographicNetworkMap` hands the file to the map from zoom 15 on TTC;
  `installTransitOpacity` wraps `fill-opacity`.
- Attribution: the TTC Map View credit reads "TTC shapes © City of Toronto ·
  Station plans © TTC"; Privacy & Acknowledgements has a "TTC Station Plans"
  section (no licence, removal if the TTC objects, an elevator shown is not
  one working) and a TTC Live Map link.
- Docs: domain invariants (station plans rule), source gates (asset and
  removal), feature reference, README.

**Phone cost (measured).** Production build, temporary Playwright spec
(deleted): `mobile-chromium` Pixel 5, Chrome on the real GPU
(`--use-angle=gl`), CPU 4× over CDP, service workers blocked. Plans on and off
alternate (on / off / on / off; "off" aborts the asset request, since there is
no switch). Each pass starts at zoom 14.8 at Union or Bloor-Yonge, then the
traced window presses Zoom In twice (crossing the load, footprint and icon
zooms, so it covers fetch, parse, tiling and install), then an idle 5 s
trace, then five touch drags with rAF intervals. The whole spec ran twice;
the second run checked the asset loaded in every on pass (72 KB transferred)
and none in off passes, and screenshots showed the plans.

| | Plans on | Plans off |
| --- | --- | --- |
| Crossing window, main thread (5 s) | 1,574–1,955 ms | 1,504–1,984 ms |
| Longest task | 26–38 ms | 29–44 ms |
| Tasks over 50 ms | none | none |
| Workers | 113–259 ms | 98–194 ms |
| Idle 5 s, main thread | 575–837 ms | 548–886 ms |
| Drags: median / p95 | 16.7 / 16.7–16.8 ms | 16.7 / 16.7–16.8 ms |
| Frames over 20 ms per pass | 0–1 | 0 |
| Heap | 20–46 MB | 21–43 MB |

So plans add worker time for tiling (about 15–85 ms at these stations) and no
main-thread, idle or drag cost distinguishable from run-to-run noise.

**Checks.** Frontend `test:fast` 2,162 (new `tests/station-plans.test.mjs`;
attribution and acknowledgement assertions), typecheck, lint (no errors, the
16 pre-existing warnings). Dev-server checks at Jane (1440 px dark and light,
360 px both themes), Union and Bloor-Yonge (1440 dark): footprints, arrows,
elevators and names in the intended order, attribution shown, no page errors
(the console showed 404s from the not-yet-rebuilt :8080 surface endpoints).
No S7 smoke spec was added. Smoke `geographic-map-lifecycle`, `network-fade`,
`map-mode-regressions` and `surface-buses` on desktop-chrome and
mobile-chromium (the transit install and fade changed): 92 passed, on the
production build used for the cost run.

**Not done / open**

- Zooms and the light/dark greys are first tuning (current values in the
  owner review below); in light mode the depth steps are subtle.
- Our GTFS line geometry does not always follow the TTC plans: at Bloor-Yonge
  Lines 1 and 2 run 30–40 m off the platforms, and at Jane Line 2 kinks into
  the station dot (livemap runs straight through). Geometry, not fixed.
- The station dot sits outside its footprint's bounds at 22 stations (GTFS
  parent-station points); not changed.
- The catalog's stale `gtfsStopId` values (older feed) are not fixed.
- Written TTC permission is still advisable (source gates).

**Owner review (2026-11-03)**

- *Ease in:* plans fade in by zoom, as the overview line badges do (opacity
  interpolated over a zoom range, under the network fade): footprints
  15.25–16, entrances, elevators and bays 16.25–16.75, stairs and escalators
  17–17.5, entrance names 17.25–17.75. The file is handed to the map from
  zoom 15.
- *Bus bays:* the generator now also reads TTC static GTFS (`--ttc-gtfs`,
  feed S1000544): every station child stop whose name carries a bay number
  ("Jane Station at Bus Bay 2", "… Temporary Bus Bay 3", "… Lower Bus Bay 6";
  not "Bay Station" or "Bayview") is a `station-bay` with its stop number:
  285 bays. They draw as black "BAY / 2" signs (livemap's style), always
  shown, over stop labels (a bay's own stop pill gives way to it, so one sign
  per pole) and under train markers and station names. Pressing one opens
  that stop's departures (S3), as a stop pill does. Licence: OGL–Toronto (the
  same GTFS), recorded in the asset's `baySource`.
- *Stairs and escalators:* the service has them (stairs 1,127 points,
  escalators 456; see the inventory above). They draw from zoom 17 as white
  tiles with the source's direction as livemap does: stairs up/down (a step
  glyph with a ↗ or ↘ arrow), plain stairs (no arrow, 38 points), escalators
  up/down. One direction's points within 4 m merge: 1,095 stairs, 448
  escalators. The direction is the source's, read from that point's level.
- *Bigger icons:* entrances and elevators 22 px, stairs and escalators 20 px,
  bays 22×26 px at zoom 18 (0.8× at the fade start, 1.25× at 20).
- *Elevators* use the site's own blue elevator icon
  (`/assets/linewatch/outages/elevator.svg`, as in station panels and
  Accessibility Outages), drawn to a bitmap once; a white tile of the same
  size stands in until it loads. It still never says whether the elevator
  works.
- *Max zoom 21* (was 19), about livemap's closest. The saved Map View camera
  (`readGeographicMapViewport`/`save…`) now accepts zoom up to the map
  maximum (it stopped at 20, so a phone left at 20–21 would have lost its
  view).
- *Asset:* 700 KB raw, 91 KB gzipped. It is now given to MapLibre as a URL,
  one source for all plan layers (filtered by `featureType`; icons, labels and
  bay images by expression), so MapLibre's worker fetches and parses it. The
  page's main thread no longer loads it: the first review-round measurement
  (main-thread fetch and parse of the larger file) found one 64–81 ms task
  when plans loaded (1–2 tasks over 50 ms per pass, twice), against 31–37 ms
  without plans.
- *Image resolver:* bay badges are drawn on demand by
  `map.setMissingStyleImageResolver`. In maplibre-gl 6.11 a
  `styleimagemissing` listener cannot supply the image for the request that
  fired it; the S5/S6 bus and GO bus route badges used that listener and
  moved to the resolver too (overlap badges keep the listener). Bus badges
  were checked drawing at Dufferin with Bus Routes on.

**Phone cost, review round (measured).** Same method as above, the zoom-in
window now three presses (14.8 to 17.8, crossing every plan zoom), one run
after the URL change (the two runs before it measured the main-thread
loading that was replaced):

| | Plans on | Plans off |
| --- | --- | --- |
| Crossing window, main thread | 2,355–2,644 ms | 2,335–2,597 ms |
| Longest task | 27–34 ms | 27–36 ms |
| Tasks over 50 ms | none | none |
| Workers | 207–310 ms | 170–224 ms |
| Idle 5 s, main thread | 714–871 ms | 688–718 ms |
| Drags: median / p95 | 16.7 / 16.7 ms | 16.7 / 16.7 ms |
| Frames over 20 ms per pass | 0–1 | 0 |

Plans now add worker time (about 25–120 ms) and no main-thread task cost; the
idle window ran up to about 150 ms higher with plans on at these stations
(more symbols at zoom 17.8). Screenshots confirmed plans drew in every on pass
(the worker's fetch does not appear in the page's resource timing). This
round was run once, not twice.

**Checks, review round.** Frontend `test:fast` 2,165 (bays, directions,
viewport zoom), typecheck, lint (no errors). Smoke `geographic-map-lifecycle`,
`network-fade`, `map-mode-regressions`, `surface-buses`, `go-buses`,
`map-line-badges`, `surface-stop`, `map-viewport-persistence` on
desktop-chrome and mobile-chromium on a fresh build: 104 passed. Production
build screenshots (Pixel 5, both themes) at Jane 18.4, 20 and with Bus Routes
on, Bloor-Yonge and Union, and Dufferin bus badges. The :3000 dev server was
down during this round (connection refused) and was not restarted; desktop
1440 px was checked earlier in the dev session, before the icon changes, and
a bay press opened stop 14700 there. The console showed basemap style
warnings (`wood-pattern`, `highway-shield-*` filters) and API 404s in stub
mode, none from plan layers.

*Second review (2026-11-03):* the first stair glyphs (thin steps, corner
arrow) read poorly. Stairs and escalators now follow the TTC station sign
pictograms livemap uses: a white tile with a bold black edge, a bold
four-step staircase (escalators: a hollow band with a standing rider), and a
separate arrow below it (↗ below right for up, ↘ below left for down; down
mirrors the staircase or band), 22 px at zoom 18. Drawn in canvas on a
24-unit grid, not copied from the service's PNGs. Checked at 3× on the dev
server at Jane and Bloor-Yonge in both themes.

**Open after review:** the escalator rider sits close to the band at 22 px.

*Bay signs in Surface Connections (owner, 2026-11-03: one sign per bay
group).* A station's Surface Connections already grouped routes by bay; each
TTC bay group with a plain bay number ("Bay 2", from the backend's
`bayPlatform`, parsed from the same GTFS stop names) now opens with a header:
the bay sign (CSS, same design as the map's), "Bus Bay 2" and "STOP 14700 ›",
which opens that bay's stop departures over the map (the stop panel links back
to the station). Rows under a header leave the bay out of their meta line
("TTC Bus · West"); collapsed starred rows keep it. "Streetcar Platform",
"Platform 1", "Bay 2, Platform 1" and unsupplied bays keep today's text. GO/UP
stations get no sign. The stop number comes from `ttc-station-bays.json`
(written beside the plans by the same generator: 44 stations, 285 bays,
1.7 KB gzipped; `src/app/station-bays.ts`), loaded once when a station shows
a bay; a bay with two stops of that number (a "Lower" bay) gets no link. The
arrival API is unchanged. The stop link is styled in
`surface-connections.css` like the section caption (11px, semibold, uppercase,
0.05em) in the link blue: the global button reset (`font: inherit`) is
unlayered and overrides Tailwind utilities on a `<button>`, which first left
it at 17px regular. The stop panel's "Jane Station" link: hover stays inside
its edge (an outline outside it was clipped at the top of the scroll area),
keyboard focus is an inset ring, and 8px below it evens the space above and
below.

Checks: `tests/station-bays.test.mjs`; `test:fast` 2,168; typecheck; lint (no
errors). Smoke `dashboard`, `surface-stop`, `geographic-map-lifecycle` on both
projects: 189 passed, 1 failed, then fixed: "shows official TTC performance
metrics from backend" (desktop) still opened Reliability Analytics from the
desktop Settings panel, which S8's review removed; it now uses the rail. The
surface-connections dashboard test asserts the Bay 7 header and that the row
no longer repeats it. Dev server: Jane at 1440 px (dark) and 360 px (light),
bay link opens stop 14700, no page errors.

*Later in review (2026-11-03).* The stop link is 13px bold, uppercase, 0.05em
(the caption style at the header's size). The stop panel's "Jane Station"
link now returns to the station with Surface Connections open and scrolled
into view (`StationDetailPanel` `initialSection`, set only by that link; it
had opened the station at the top with the section collapsed); covered by a
new `surface-stop` smoke test with stub stop 14999 at Stub Station.

*Map View deck and Train Markers panel animations (owner, 2026-11-03).*
Recorded frame by frame (computed clip and opacity per rAF) on the dev server
at 1440 px. System Map to Map View: the deck rendered open for 240–590 ms
while the map loaded, then snapped shut and unrolled (the entrance waits for
the map). It now waits rolled up with its switches hidden
(`data-deck-waiting` while loading, in `map-controls.css`, only without
reduced motion), so the entrance starts from nothing. Map View to System Map:
the right-hand Train Markers panel unfolded to 206 px and snapped to 102 px,
because whether the buttons beside it drop their captions depends on the
panel and on the System Map toolbar, which mounts after it starts. The panel
now waits for that toolbar to be placed (`nextDesktopControlRail`, 700 ms at
most), settles the layout (`settleDesktopControlRails`), then measures and
unfolds; while it animates, the toolbar keeps the buttons' caption state
(`observeDesktopControlRail` holds it while a child is collapsing). Recorded
after: System Map to Map View, panel folds 102 to 0 and the deck unrolls from
closed; back, the deck rolls up and the panel unfolds 0 to 102 with no
overshoot; the same on a second round trip. Smoke `desktop-more-navigation`,
`desktop-profiles-and-collapse`, `geographic-map-lifecycle`, `go-buses`,
`map-mode-regressions`, `network-fade`, `surface-buses`, `surface-stop` on
both projects on a fresh build: 107 passed. `test:fast` 2,168, typecheck,
lint (no errors). The
idle-cost difference above was one run. Desktop not re-checked after the icon
changes.

### S8 — Live bus positions (done 2026-11-03)

Real GPS positions of TTC buses on the TTC Map View, with Bus Routes on, from
zoom 13, labelled with their age and stale when old, from the same vehicle
feed read as live streetcars (S4).

**Owner decisions (2026-11-03)**

- Its own phase; shown only with Bus Routes on; same feed, freshness and stale
  rules as S4; only trips in the active schedule; TTC only (no GO vehicle
  source is used). (Before S8.)
- *Switch:* one switch for live vehicles, not a fifth. A fifth labelled switch
  needed 698 px against the deck's 631 px at 1440 px (the toolbar is 675 px
  wide at 1440 and above) and 296 against 262 px compact at 1024. Then, in
  review: the switch reads **Live GPS** with a caption naming the vehicles
  ("Streetcars", or "Streetcars & Buses" while Bus Routes is on), and the
  Train Markers switch reads **Train Markers** over "68 Trains" ("Trains" when
  off; never "live": they are estimates). To fit, the deck's gaps went from
  12 to 6 px, its ends from 12 to 10, switch padding from 6 to 4, the
  icon-to-text gap from 8 to 6, and the deck inset under the toolbar from 22
  to 18 px. Measured on the dev server at 1440 px: 619 of 634 px with Bus
  Routes on, 576 off, no text clipped; compact 1024 px unchanged (260 px).
  The switch kept the S4 key (`linewatch-map-view-streetcar-positions-v1`).
- *Marker:* a short one-section bus glyph in the streetcar glyph's paint,
  about two thirds of its length, in the route family's colour.
- *Phones:* View Buses also shows live buses (no new control).
- *Replacement buses* (a streetcar route's "Replacement Bus" trips, which S4
  leaves out) show as live buses, marked in their card.

**Source (measured 2026-11-03, 5:25–6:45 AM, feed S1000544 active)**

Vehicles on the feed that the bus filter keeps (bus-route trips, night routes
included, plus replacement buses), sampled every 5 min:

| Time | All vehicles | Kept as buses | of which night | Replacement | Streetcars | No trip |
| --- | --- | --- | --- | --- | --- | --- |
| 5:25 | 1,342 | 458 | 139 | 14 | 94 | 766 |
| 6:00 | 1,547 | 857 | 58 | 27 | 103 | 549 |
| 6:45 | 1,644 | 1,143 | 8 | 35 | 108 | 345 |

The S4 sample at 5 PM had about 1,850 vehicles; this morning's count was
still climbing when measured, so the peak is above 1,143 (the S4 numbers
suggest about 1,400). A bus's own report was a median 53 s old at fetch (p90
58 s); at most 3 of about 1,100 were over the 2 min stale limit. The feed
read itself was 640 KB of text at 6:45.

**Payload.** All buses: 317 KB raw, 28 KB gzipped (1,142 buses; Caddy
gzips API responses in production). Every 15 s that would be about 6.8 MB an
hour on a phone, so the Map View asks only for the area around its view. A
phone view at zoom 13 grown by half its size each side holds 90–160 buses
(25–44 KB raw, 3.0–4.7 KB gzipped); at zoom 14, 27–53 buses (1.3–2.1 KB
gzipped). Measured at downtown, Yonge–Eglinton, Finch station and
Scarborough Centre (the densest).

**Built**

- Backend (package `streetcarposition`): `BusPositionProperties`
  (`linewatch.bus-positions.enabled`, `LINEWATCH_TTC_BUS_POSITIONS_ENABLED`,
  off by default, on in `dev-live`; URL, cadence and freshness limits are the
  streetcar ones). `TtcStreetcarPositionPollingJob` reads the feed once when
  either flag is on and indexes each kind only under its own flag; a failed
  read keeps both last-good snapshots. `TtcBusPositionIndexer` (bus routes and
  replacement buses, `replacement` flag), `TtcBusPositionCache`,
  `TtcBusPositionService` (S4 states and age rules), `GET
  /api/surface/buses/positions?bbox=west,south,east,north`
  (`TtcBusPositionController`, `no-store`; a malformed or non-Toronto box is
  400; no box returns every bus). Env examples and the parity script carry
  the flag.
- Frontend: `src/app/bus-positions.ts` (read area = view plus half its size
  each side, rounded outward to 0.01°; a pan inside it needs no new read;
  features; the S4 age and stale helpers reused; off-route against the bus
  corridors, never claimed for a route with no drawn bus line);
  `geographic-bus-vehicles.ts` (glyph, layers under live streetcars and over
  stop labels, from zoom 13, route numbers from 15). `GeographicNetworkMap`
  reads with Bus Routes and Live GPS on, from zoom 13, again when the view
  leaves the read area and every `refreshSeconds` while visible; below zoom 13
  nothing is read and the buses clear. The map source is updated only when a
  bus's state or the selection changes, not on each 5 s age tick. A press
  (after stations and live streetcars, before stop labels) opens the vehicle
  card in bus mode: "Live Bus" ("Bus" when stale), age line, vehicle number,
  "Replacement bus for the 501 streetcar." where marked, the off-route note,
  and Nearest Stop Departures (nearest bus stop on its route within 300 m, or
  the streetcar route's stop for a replacement bus; the bus stop file loads
  when a bus card opens). Bus badges and stops installed later go under the
  buses.
- Docs: domain invariants (bus vehicles allowed under their own flag),
  source gates (widened S4 use), feature reference, README.

**Phone cost (measured).** Production build, temporary Playwright spec
(`mobile-chromium`, Pixel 5 viewport, Chrome on the real GPU with
`--use-angle=gl`, CPU throttled 4× over CDP, service workers blocked), the
6:37 AM snapshot (1,142 buses, 104 streetcars) served by bbox as the backend
does, Bus Routes on in every pass, Live GPS on / off / on / off, three
cameras, the whole spec run twice. Each zoom-13 pass starts at zoom 12.6 and
double-taps to 13.6, so the window covers the first read and install.

- *Whole city (zoom 11.2):* no bus read in any pass (below the bus zoom).
  Idle main thread 794–1,036 ms per 5 s with Live GPS on, 716–934 off; the
  difference is the live streetcars (the switch covers both), not buses.
  Drags: median 16.7 ms, p95 16.7–16.8, no frame over 20 ms, on or off.
- *Downtown (zoom 13.6, 44 buses in the read area):* 5 s after crossing
  zoom 13, main thread 1,129–1,448 ms on vs 1,156–1,301 off; longest task
  27–44 ms on vs 24–31 off; none over 50 ms; workers 73–96 vs 47–82 ms.
  Drags: median 16.7, p95 16.8 either way; 8–11 frames over 20 ms on and
  9–14 off (the drag sequence also zoomed these passes to 16 on and off
  alike; the long frames match).
- *Scarborough Centre (zoom 13.6, 71 buses):* after crossing, main thread
  1,248–1,402 ms on vs 1,177–1,256 off; longest task 56–64 ms on vs 49–56
  off; one or two tasks over 50 ms in each on pass and in three of four off
  passes. A 15 s refresh read ran in each on pass. Drags: median 16.7, p95
  16.7–16.8, no frame over 20 ms, on or off.
- *Heap:* within noise (21–54 MB across all passes).

So live buses at the zoom floor add roughly 70–200 ms of main-thread work in
the seconds after they first load and no measurable cost to dragging. All
1,142 buses citywide were not drawn in any pass: the zoom floor keeps reads
to the view, and at zoom 13 downtown the bus and streetcar glyphs already
crowd the streets.

**Checks.** Backend: new `TtcBusPositionIndexerTest`, `TtcBusPositionServiceTest`,
`TtcBusPositionControllerTest`, `TtcStreetcarPositionPollingJobTest` (one read
for both, each flag alone, both off, failed read keeps both); full suite
1,435 passed, 1 skipped, in a scratch copy. Frontend `test:fast` 2,156 (new
`tests/bus-positions.test.mjs`), typecheck, lint (no errors). New
`tests/smoke/bus-positions.spec.ts` (phone: live bus card with age and nearest
stop and a read area around the camera, replacement bus, stale source,
disabled source asked once, nothing read with buses off or below zoom 13).
Smoke set (bus-positions, surface-buses, go-buses, surface-stop,
streetcar-positions, geographic-map-lifecycle, map-mode-regressions,
network-fade, map-line-badges, desktop-more-navigation, sidebar-list-scroll,
desktop-profiles-and-collapse, smoke) on desktop-chrome and mobile-chromium:
130 passed, 4 failed: `sidebar-list-scroll` "regional mixed line impacts" and
"station browsing, detail and saved lists" on both projects, which assert
stub data this work did not touch (the commute test routes
`/api/account/commutes` without blocking service workers); not checked on a
clean tree. `geographic-map-lifecycle` "View on Map" failed once in a
parallel run and passed three times alone. Dev-server checks at 1440 (both
themes) and 360 px: bus glyphs, replacement-bus card, deck, no page errors or
horizontal overflow.

**Not done / open:** production enablement of
`LINEWATCH_TTC_BUS_POSITIONS_ENABLED` (owner). The owner's :8080 backend
needs a rebuild to serve the endpoint (until then a 404 and a retry every
30 s, no buses). The cost run used a 6:37 AM snapshot (1,142 buses), not the
peak; repeat at peak if wanted. Bus zoom 13, glyph size and route numbers
from 15 are first tuning. At zoom 13 the red bus and red streetcar glyphs
differ mainly by length (17 vs 26 px). A bus under a station marker cannot be
pressed (stations win). The payload was measured with responses built from
the live feed by the indexer's rules in a script, not from the running
endpoint (the dev backend was not rebuilt).

**Also in this session (owner review).** Desktop "More" became **Settings**
(gear) below the second rail divider, above Feedback; its panel dropped the
links the rail already has (Reliability Analytics, Alert History,
Accessibility Outages, Streetcar & Bus, TTC Announcements, Leave Feedback),
and Site Guide moved into About. Phones keep More unchanged. After a search
from it, desktop reads "Back to Settings".

### S9 — Live GO bus positions (done 2026-11-03)

Owner request, 2026-11-03: live GO bus positions on the GO/UP Map View, as
S8 does for TTC buses. Not built; detail before building.

**Found (one read, 2026-11-03 ~9:40 AM, the backend's Metrolinx key).**

- `api/V1/Gtfs/Feed/VehiclePosition` (already polled for GO train markers by
  `MetrolinxVehiclePositionClient.fetchGo`): 203 vehicles, 25 trains and 178
  GO buses (route type 3 in GO GTFS; route ids carry a date prefix, e.g.
  `09261126-41`). Buses carry position, bearing, trip id, stop id,
  current status, occupancy and timestamp. `parseVehiclePositions` drops
  them today (their route does not resolve to a rail line).
- Bus report age at the feed timestamp: median 59 s, p90 359 s, max 2,099 s.
  S4/S8's 2 min stale limit would mark many GO buses stale; GO needs its own
  freshness rule.
- `api/V1/ServiceataGlance/Buses/All`: 187 bus trips with latitude,
  longitude, course, `DelaySeconds`, previous/next/at stop codes,
  `IsInMotion`, route and trip numbers. Richer (delay), but a second endpoint
  to poll; not read by the app today.

**Owner decisions (2026-11-03)**

- *Source gate:* the owner confirmed the registered Metrolinx API agreement
  covers serving normalized GO bus positions (source gates, S9 entry).
- *Source:* VehiclePosition only (no new upstream read; Service at a Glance
  not used).
- *Pre-trip buses* (heading to their trip's first stop before its start):
  hidden.
- *Freshness:* a bus under way is stale after 5 min and dropped after
  15 min; the feed is stale after 2 min, as the train markers.
- *Switch:* a Live GPS switch on the GO/UP deck (caption "GO Buses"), its
  own key, on by default, drawing only while GO Buses is on; phones' View GO
  Buses shows them.

**Constraints:** GO/UP only;
TTC sources never authorize GO claims and GO buses never affect GO/UP rail
status or train markers. Wayfinding: labelled with age, stale when old,
never coloured by service data.

**Sample (2026-11-03, 10:24 AM – 7:24 PM, every 10 min, 55 reads, no
failed read).** Script in the session scratchpad, not the repo; it keeps
counts only, never the payload. Overnight and early-morning reads were not
recorded (owner, 2026-11-04): they only tune the limits, since a late report
is labelled stale or dropped, never live. One 11:50 PM read had a p90 of
612 s, so late-night buses may show stale more often; the 5 and 15 min
limits are first tuning. Every bus carried a trip, position, bearing, stop and occupancy; every
bus trip but one (in one read) was in the GO GTFS (feed 20261028133417) and
active that day; 28–29 routes. "Pre-trip" is a bus whose stop is its trip's
first stop before the scheduled start (layover or deadhead).

| Time | Trains | Buses | Pre-trip | Under way: median / p90 / p99 age | Under way over 5 / 10 min | Feed |
| --- | --- | --- | --- | --- | --- | --- |
| 10:24 | 23 | 156 | 40 | 17 / 157 / 1,537 s | 6 / 5 | 167 KB |
| 12:24 | 22 | 137 | 36 | 11 / 31 / 331 s | 2 / 0 | 149 KB |
| 14:24 | 21 | 147 | 36 | 18 / 38 / 498 s | 3 / 1 | 157 KB |
| 16:24 | 32 | 191 | 35 | 51 / 71 / 1,390 s | 5 / 4 | 209 KB |
| 17:24 | 44 | 215 | 36 | 49 / 89 / 3,650 s | 8 / 5 | 242 KB |
| 19:24 | 27 | 176 | 45 | 13 / 92 / 1,973 s | 5 / 4 | 190 KB |

Peak 223 buses (5:44 PM). Across all reads 7,256 under-way bus reports:
4.1% over 5 min, 2.4% over 10 min; the p90 ranged 28–171 s. An old report is
usually one bus stuck for a long time (the p99), not slow reporting in
general, so 5 min stale and 15 min gone (owner decision) keep almost
every moving bus live. Pre-trip buses were 30–45 per read, their reports up
to 70 min old. Service at a Glance listed 142–231 trips per read (not used).
GO publishes bearing 0 and speed 0 for every bus: no heading.

**Built**

- Backend: `MetrolinxGoVehiclePositionSnapshots` (package `regional`): the GO
  VehiclePosition read, cached 10 s, last-good for 2 min after a failed read;
  `MetrolinxVehiclePositionClient.fetchGo` (train markers) and the bus
  service both read it, so one upstream read serves both, and nothing reads
  it on a schedule. Package `gobusposition`: `GoBusPositionProperties`
  (`linewatch.regional.bus-positions.*`, `LINEWATCH_REGIONAL_GO_BUS_POSITIONS_ENABLED`
  off by default, on in `dev-live`; max source age 2 min, stale 5 min, max
  age 15 min, refresh 15 s), `GoBusPositionIndexer` (bus route ids end in a
  route number, rail in letters; destination from the vehicle label; trip
  start from `start_date` and `start_time`, GTFS time from noon minus 12 h),
  `GoBusPositionService` (on request; disabled reads nothing; a bus is
  served once its trip's scheduled start has passed; bbox; each shared read
  indexed once), `GET /api/regional/buses/positions?bbox=`
  (`GoBusPositionController`, `no-store`, S8's bbox rules). Env examples and
  the parity script carry the four variables.
- Frontend: `src/app/go-bus-positions.ts` (read, the S4 age and stale rules
  with the GO limits from the response, features, next-or-nearest stop,
  switch caption, `linewatch-map-view-go-bus-positions-v1`);
  `geographic-go-bus-vehicles.ts` (S8's glyph, exported as `drawBusGlyph`,
  in GO green, `#3CC47A` on the dark map, drawn level with no arrow, under
  the train markers and stations, from zoom 10, route numbers from 13).
  `GeographicNetworkMap` reads with GO Buses and Live GPS on, from zoom 10,
  for the view grown by half, again when the view leaves it and every
  `refreshSeconds` while visible; below zoom 10 nothing is read. A press
  (after live TTC vehicles, before stop labels) opens the vehicle card in
  `go-bus` mode: "Live GO Bus" ("GO Bus" when stale), GO route badge and
  name, destination, age line, vehicle number, Next Stop Departures (the
  bus's next GO stop on its route) or Nearest Stop Departures (within 1 km),
  "Position from Metrolinx GO bus GPS. Not a schedule." The desktop GO/UP
  deck has Train Markers, GO Buses, Live GPS (caption "GO Buses"; "With GO
  Buses" while GO Buses is off; Stale, Unavailable, Source Off from the
  read). Phones: View GO Buses shows live GO buses.
- Docs: source gates (S9 entry), domain invariants, feature reference,
  README.

**Payload.** The whole GO network at 7:26 PM: 125 buses served (44
pre-trip hidden), 31 KB raw, 3.8 KB gzipped. A phone view at zoom 10.6 over
Toronto grown by half held 31; at zoom 12.6 over Mississauga, 25.

**Phone cost (measured).** Production build, temporary Playwright spec
(`mobile-chromium`, Chrome with `--use-angle=gl`, CPU throttled 4× over CDP,
service workers blocked), the 7:26 PM snapshot served by bbox as the backend
does, GO Buses on in every pass, Live GPS on / off / on / off, two cameras,
the whole spec run twice. Each pass starts a zoom below the camera and
double-taps across it, so the 5 s window holds the first read and install.
Every on pass was served its read (31 or 25 buses); screenshots show the
glyphs.

- *Toronto (zoom 10.6, 31 buses):* main thread 668–755 ms on vs 672–817 off
  in the 5 s after crossing; longest task 123–156 vs 124–156; one or two
  tasks over 50 ms on and off alike (the zoom itself); workers 73–90 vs
  82–83 ms. Idle 5 s: 63–153 vs 71–160 ms.
- *Mississauga (zoom 12.6, 25 buses):* 501–663 ms on vs 586–693 off; longest
  31–59 vs 44–53; at most one task over 50 ms either way. Idle 54–128 vs
  61–78 ms.
- *Drags (five per pass):* median 16.7 ms, p95 16.7–16.8, no frame over
  20 ms, on or off. *Heap:* 35–63 MB, noise.

So live GO buses cost nothing measurable on the phone: about 30 glyphs in
view and a 4 KB read.

**Checks.** Backend: new `GoBusPositionIndexerTest`, `GoBusPositionServiceTest`,
`GoBusPositionControllerTest`, `MetrolinxGoVehiclePositionSnapshotsTest`
(one read per window; last-good; train markers and buses share one read);
`MetrolinxVehiclePositionClientTest` and the train-marker tests pass on the
shared read. Frontend `test:fast` 2,177 (new `tests/go-bus-positions.test.mjs`),
typecheck, lint (no errors, 16 warnings as before). New
`tests/smoke/go-bus-positions.spec.ts` (phone: card with age, route, next
stop opening the GO stop panel, no TTC vehicle read; stale; disabled asked
once; nothing read with GO Buses off, Live GPS off or below zoom 10) and the
`go-buses` desktop deck test (three switches, caption, own key): 6 passed on
desktop-chrome and mobile-chromium.

**Not done / open:** production enablement of
`LINEWATCH_REGIONAL_GO_BUS_POSITIONS_ENABLED` (owner). The owner's :8080
backend needs a rebuild to serve the endpoint (until then a 404 and a retry
every 30 s, no GO buses). The cost run used an evening snapshot (125 buses),
not the 5:44 PM peak (223), and the payload was built from a live read by the
indexer's rules in a script, not from the running endpoint. GO bus zoom 10
and route numbers from 13 are first tuning. Not checked on the dev server
(needs the backend rebuild).

### Scope and coverage (owner, 2026-11-03)

- **The Map View is the coverage target.** System Maps stay the uncluttered
  rail-only view by design; surface routes and vehicles belong to the Map
  View only.
- **Agencies:** TTC and GO/UP only. MiWay, YRT, Brampton Transit, Durham and
  other agencies publish their own GTFS but are out of scope.
- **TTC subway and LRT trains:** estimated train markers are the vehicle
  positions we provide for them (labelled as estimates; the TTC publishes no
  subway or LRT vehicle positions in the feeds used). Owner observation: in
  the TTC vehicle feed Line 5 is spotty and Line 6 is not provided at all,
  so no LRT GPS layer is planned.

### S10 — TTC night routes on the Map View (done 2026-11-03)

Owner decision, 2026-11-03: draw the TTC night network (300-series routes,
bus and streetcar) on the Map View. Today S1 and S5 leave night routes out
of the drawn lines (`isDaytimeStreetcarRoute`, `isDaytimeBusRoute` in
`scripts/lib/surface-corridors.mjs`), while S8 already shows live night
buses and the stop view lists night departures.

**Found (TTC GTFS S1000544, Nov 1 – Dec 19).** 35 night routes: 6
streetcar (301, 304, 305, 306, 310, 312) and 29 bus. Every one runs every
night (weekday service 1: 988 trips, 229 shapes; Saturday 951, 220;
Sunday 1,691, 245, the Saturday-night/Sunday-morning run being longer).
Weekend services add 58 shapes the weekday one lacks (mostly longer early-
morning variants). 44 weekday night trips are "Replacement Bus" trips.

**Owner decisions (2026-11-03):** night lines show with Bus Routes on (the
deck stays four switches; phones: View Buses; never by time of day);
weekday night pattern only (weekend-only variants not drawn); night blue,
streetcar solid and bus dashed; own asset and layer.

**Asset (measured, feed S1000544).** `generate-surface-catalog.mjs --mode
night` (`isNightRoute`, `buildNightCorridors` in
`scripts/lib/surface-corridors.mjs`): the 35 night routes from the
Monday-to-Friday service, 763 night trips in 161 patterns, streetcar and bus
night routes built apart so a street with both draws each in its own style
and a badge row never mixes them; a night route's quiet branch keeps a
quarter of its busiest gap (the bus rule). Replacement-bus (44) and
short-turn trips are counted, not drawn. Every route draws. No stops: night
routes stop at daytime poles, which the stop view already lists with their
night times. Generation takes about 3 s.

| Form | Corridors | Length | Raw | Gzipped |
| --- | --- | --- | --- | --- |
| `ttc-surface-night.json` | 332 (30 streetcar, 302 bus) | 66 + 587 km | 204 KB | 43 KB |

Up to 4 night routes on one corridor. The daytime assets regenerated from the
same archive are byte-identical (SHA-256 of `ttc-surface-streetcar.json`,
`ttc-surface-bus.json` and `ttc-surface-bus-stops.json` checked before and
after).

**Built**

- Generator as above; `tests/surface-corridors.test.mjs` covers night route
  selection and the apart-by-kind build with the route share.
- `src/app/night-route-catalog.ts` (types, loader, per-kind badge image ids,
  card rows with the replacement-bus note); `geographic-night-layers.ts`:
  two instances of the bus layer kit (`dash` may now be null for a solid
  line), night blue `#0054A6` (`#5B9BE0` on the dark map, where the dark
  blue sank into the basemap in the screenshot check), streetcar solid and
  bus dashed, each thinner than its daytime line, under the daytime bus and
  streetcar lines; night badges from zoom 13, under the daytime badges.
- `GeographicNetworkMap`: the night file loads with Bus Routes on (desktop
  Buses switch, phone View Buses) and installs and removes with the bus
  layers; a press (after daytime streetcar and bus lines) opens the routes
  card as "Night Routes" (night badges; "Some trips run as replacement
  buses." for 301, 304, 306; no stop button; "Weekday night schedule,
  Nov 1 – Dec 19. Not live service."). Night lines dim under a line filter.
- Docs: domain invariants, feature reference, README.

**Phone cost (measured).** The S9 harness (production build,
`mobile-chromium`, Chrome with `--use-angle=gl`, CPU 4×, service workers
blocked): each pass loads with Bus Routes off and taps View Buses in a 6 s
trace, so the window holds both files' parse and install; night served /
blocked (404) / served / blocked, so the difference is the night layer
alone; two cameras, run twice. Every served pass fetched the file; the
screenshots show the dashed blue 300 along Bloor.

- *Whole city (zoom 11.2):* turning on, main thread 1,357–1,456 ms with
  night vs 1,392–1,472 without; longest task 53–63 vs 58–70; one or two
  tasks over 50 ms vs one; workers 31–33 vs 25–27 ms. Idle 840–940 vs
  840–985 ms (live streetcars).
- *Downtown (zoom 13.6):* 1,378–1,611 vs 1,228–1,417 ms; longest 56–73 vs
  56–62; one or two over 50 ms vs one; workers 28–31 vs 15–16 ms. Idle
  781–858 vs 779–976 ms.
- *Drags:* median 16.7 ms, p95 16.7–16.8, one frame over 20 ms in one pass
  without night. *Heap:* 33–60 MB, noise.

So the night network adds up to about 200 ms of main-thread work and 15 ms
of worker time while Bus Routes turns on downtown, sometimes one more task
over 50 ms, and nothing measurable afterwards.

**Checks.** Frontend `test:fast` 2,184 (new `tests/night-routes.test.mjs`,
night cases in `surface-corridors.test.mjs`), typecheck, lint (no errors).
New `tests/smoke/night-routes.spec.ts` (phone: the file loads with Bus
Routes, a press on the 322 where no daytime line runs within 400 m opens
"Night Route" with the weekday night label and no stop; nothing loads with
Bus Routes off).

**Not done / open:** a press on a street with a daytime line opens the
daytime card only (the night line is under it), so on Queen the 301 is read
from its badge, not the card; listing night routes in the daytime card is
not built. Night badge zoom (13), widths and the dark-map blue are first
tuning. Not checked on the dev server.

## Open questions

- Production disk headroom for ~0.9 GB of surface stop times across a
  schedule change (S3 measurement above).
- Stop pill zoom (15) and badge zoom (13): confirm on the map.
- Bus badge and stop zooms (14, 15): confirm on the map.
- GO bus badge and stop zooms (11, 12.5) and the dark-map green: confirm on the map.
- Live bus zoom (13), glyph size and route numbers (15): confirm on the map.
- Live GO bus zoom (10) and route numbers (13): confirm on the map.
- Night line widths, dark-map blue (`#5B9BE0`) and badge zoom (13): confirm
  on the map; whether daytime route cards also list the night routes under them.
- Whether station GO Bus rows adopt the S6 live rule (live only when the
  computed time differs from the schedule).
- Station plan fade zooms and greys, and the stair/escalator glyphs: confirm on the map.
