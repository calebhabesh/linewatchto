# LineWatchTO GO/UP Network Expansion — Preliminary Design Record

**Date:** 2026-07-21
**Status:** Preliminary decisions captured before implementation
**Branch:** `feature/go-up-network-mode`
**Worktree:** `~/dev/ttc-reliability-navigator-go-up`

## Purpose

Record the product and technical direction agreed before implementation begins. This is not yet a detailed implementation plan. Real Metrolinx payloads must be inspected after the requested API key arrives before normalization rules are finalized.

The expansion remains part of **LineWatchTO**, an unofficial transit reliability dashboard. It must not be presented as an official TTC, Metrolinx, GO Transit, or UP Express product.

## Product Decision

LineWatchTO will use a network selector that switches between two complete map modes:

1. **TTC:** the existing subway/LRT map and TTC-scoped dashboard data.
2. **GO/UP:** a separate regional-rail and airport-rail map with GO rail and UP Express data.

GO/UP routes will **not** be overlaid on the TTC map. Selecting a network changes the map, stations, line statuses, alerts, freshness state, station search scope, and related panels as one consistent dataset.

The existing TTC experience should remain the default and should not regress while the regional mode is developed.

## Why the Addition Is Feasible

The project already has most of the reusable behavior needed for a second rail network:

- normalized alert categories and cards;
- source freshness gating and fixture fallback;
- raw staging, normalized persistence, lifecycle snapshots, and ingestion health;
- Redis-backed dashboard caching;
- line status summaries;
- segment and station-node impacts;
- clickable/tappable map overlays and card selection;
- saved-route impact matching and push delivery architecture for later phases.

The main architectural work is introducing an explicit network/source boundary and a second map implementation. Existing TTC-only assumptions must not be extended by merely inserting Metrolinx rows into TTC-specific tables and components.

## Custom Regional Map Asset

A custom SVG map has been authored and is the visual starting point:

```text
~/Pictures/Assets/LineWatch/Maps/Metrolinx_Custom_Map.svg
```

The external path remains the editable authoring source. A prepared application copy is stored at:

```text
frontend/public/assets/linewatch/regional-rail-map.svg
```

Inspected source properties:

- SVG view box: `0 0 14471.575 9632.7812`;
- contains separate Inkscape layers for stations and station text;
- contains regional rail and UP Express line work;
- currently uses TeX Gyre Heros Bold for most station labels;
- has 72 uniquely labelled station anchors and no duplicate XML IDs.

The prepared application copy promotes every station label to a stable `station-*` DOM ID, normalizes the major layer IDs, hides the authored Lake Ontario and Lake Simcoe overlay layer, and adds view-box padding so terminal selection and alert rings are not clipped. It uses view box `-200 -200 14871.575 10032.7812`. The authoring source remains unchanged by this preparation.

Adjacent-station segment guide paths and any route-specific attachment anchors still need stable IDs during regional map integration. Canonical application IDs should use the same identifiers as the backend/static-GTFS mapping. Do not rely on remaining editor-generated element IDs or `inkscape:label` values without review.

Typography should prioritize small-screen legibility. LineWatchTO already loads Inter, but the completed asset currently uses TeX Gyre Heros. During integration, visually compare the authored typography with Inter Medium/SemiBold before deciding whether a conversion is worthwhile; do not mechanically replace text styling if it degrades the finished layout.

The regional line colour tokens and their sampling notes are recorded separately in [`docs/2026-07-21-regional-rail-color-palette.md`](../../2026-07-21-regional-rail-color-palette.md).

## Data Sources

### API-key-backed sources

A Metrolinx API key was requested on 2026-07-21. The stated processing window is up to 10 business days. Keep the key in backend environment configuration and never expose or commit it.

Officially documented endpoints relevant to discovery include:

```text
GET /OpenDataAPI/api/V1/Gtfs/Feed/Alerts
GET /OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts
GET /OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates
GET /OpenDataAPI/api/V1/UP/Gtfs/Feed/TripUpdates
GET /OpenDataAPI/api/V1/Gtfs/Feed/VehiclePosition
GET /OpenDataAPI/api/V1/UP/Gtfs/Feed/VehiclePosition
GET /OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All
GET /OpenDataAPI/api/V1/ServiceataGlance/Trains/All
GET /OpenDataAPI/api/V1/ServiceataGlance/UPX/All
```

The dedicated UP alerts documentation describes a GTFS-Realtime-shaped `FULL_DATASET` response. Treat disappearance from a successful fresh full-dataset response as a possible deactivation signal, but finalize lifecycle behavior only after inspecting real responses and timestamps.

### Static data

Metrolinx publishes separate static GTFS packages for GO Transit and UP Express. Use static GTFS to resolve route IDs, stop IDs, station names, schedules, topology, and available shapes. The custom SVG remains the display geometry; static GTFS supplies canonical operational identifiers and validation.

### Data claims and uncertainty

Do not claim that the API supplies complete planned-construction coverage, accessibility outages, exact segment impacts, or complete vehicle positions until representative live payloads have been captured and verified.

If an alert identifies only a route, display a line-wide impact rather than inventing affected station-to-station geometry. If it identifies stops or trips that map cleanly through static GTFS, project only the supported station and segment impacts.

Do not scrape GO or UP website notices as a fallback. The API agreement provided during registration prohibits scraping the platform, and website notices may not match realtime feed coverage.

## Alert Taxonomy

Reuse the current LineWatchTO presentation categories where source semantics support them:

- delay;
- suspension/no service;
- planned closure or planned service change.

Do not assume Metrolinx `Category`, `SubCategory`, GTFS-RT `cause`, or GTFS-RT `effect` values before examining live payloads. Build fixture cases from captured, redacted payload shapes once the key arrives.

Do not map a record to **Reduced Speed Zone** merely because it represents a delay or modified service. Reduced Speed Zones remain an explicit category and should appear for GO/UP only if Metrolinx publishes an equivalently explicit restriction that the product intentionally supports.

## Backend Direction

Introduce provider-neutral boundaries instead of coupling Metrolinx ingestion to `TtcAlertIngestionService` or `ttc_alert_source_records`.

At minimum, normalized identities need a source namespace such as `source_system` or consistently prefixed IDs. The current global uniqueness of `alerts.source_id` is insufficient for multiple upstream agencies without a collision policy.

Recommended conceptual boundary:

```text
network_id: ttc | regional
source_system: ttc-live-alerts | ttc-gtfs-rt | metrolinx-go | metrolinx-up
```

Regional ingestion should have:

- separate opt-in enablement;
- configured HTTPS base URL and backend-only API key;
- explicit connect/read timeouts;
- conservative polling aligned with documented or approved quotas;
- source-specific raw staging;
- normalization isolated from source DTOs;
- independent freshness and health reporting;
- source-scoped disappearance/deactivation handling;
- dashboard cache eviction after successful application;
- no raw Metrolinx feed redistribution through LineWatchTO endpoints.

A network-scoped dashboard boundary is preferred:

```text
GET /api/dashboard?network=ttc
GET /api/dashboard?network=regional
```

The exact public/backend boundary must be reviewed against the API agreement before production release. Browser-facing responses should be purpose-built display DTOs, not a republished source feed.

## Frontend Direction

Preserve `InteractiveTtcMap` as the stable TTC implementation. It contains extensive TTC-specific SVG parsing, layer IDs, dimensions, camera behavior, attribution, and geometry assumptions.

Add a separate regional implementation behind a common shell-level contract, conceptually:

```tsx
<NetworkMap network="ttc" | "regional" />
```

with the shell selecting `InteractiveTtcMap` or a new `InteractiveRegionalMap`. Reuse existing pan/zoom logic, impact selection types, overlay visual language, station interaction behavior, and card-opening callbacks where practical. Extract shared primitives only when doing so reduces real duplication without destabilizing the TTC map.

The network selection must also scope:

- current status and alert counts;
- active alerts, delays, planned changes, and any supported special categories;
- station search and station details;
- map camera/recenter behavior;
- ingestion/source freshness labels;
- fixture fallback;
- mobile inspector and bottom-sheet content.

TTC-only behavior such as the subway operating-hours closed screen and TTC estimated train markers must not be applied to the regional map.

## Initial Delivery Slice

The first useful regional release should include:

1. Network selector with completely separate TTC and GO/UP maps.
2. Custom regional SVG integrated with stable station and segment identifiers.
3. Regional fixture data matching the future API shape.
4. GO rail and UP Express line status.
5. Fresh active alert cards.
6. Supported line-wide, station, and segment highlights.
7. Independent ingestion freshness and graceful unavailable/fallback states.
8. Desktop and mobile interaction coverage.

The first slice does not need to include:

- GO buses;
- realtime arrivals;
- vehicle-position markers;
- accessibility outage integration;
- saved-commute routing across TTC and regional networks;
- regional push notifications;
- regional reliability aggregation;
- scraped planned notices.

Those are later increments after the alert feed, IDs, and freshness behavior are proven.

## Branding, Attribution, and Release Guardrails

- Continue to identify LineWatchTO as unofficial.
- Do not use official GO, UP Express, or Metrolinx logos or copied official map artwork.
- Use the custom LineWatchTO regional schematic as the map asset.
- Use service and corridor names factually and avoid language suggesting partnership, sponsorship, or endorsement.
- Preserve any attribution required by static GTFS/API terms in the Privacy & Acknowledgements experience and relevant documentation.
- Before public release, clarify the API agreement's application-display, browser-response, service-name, and publicity restrictions if the approved key correspondence does not resolve them.

## Verification Expectations

Implementation will be cross-stack. Relevant verification should include:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Add focused tests for:

- source/network ID isolation;
- full-dataset deactivation and stale-run suppression;
- real captured alert-category mappings;
- route-only versus stop/segment-specific impacts;
- TTC/regional toggle isolation;
- regional fixture fallback;
- mobile and desktop regional map interactions;
- confirmation that TTC-only closed-hours and train-marker behavior stays TTC-scoped.

## Questions to Resolve When the API Key Arrives

1. Does the GO alerts feed include both train and bus records, and which field reliably separates them?
2. Which real route and stop IDs correspond to every line and station in the custom SVG?
3. Do dedicated UP alerts include useful `informed_entity` route, stop, or trip references?
4. Are operational and planned notices present in GTFS-RT alerts, REST service alerts, both, or neither consistently?
5. What timestamp represents source publication/update time for each endpoint?
6. What polling quotas or recommended intervals apply?
7. Are the documented trip-update and vehicle-position feeds complete enough for later user-facing arrivals or schematic markers?
8. Does the approved use permit the intended factual service labels and purpose-built browser display DTOs?

Until these questions are answered, implement only source-independent seams and fixture-backed behavior; do not encode speculative production normalization rules.
