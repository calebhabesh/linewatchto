# Saved Commute Impact Matching Design

## Goal

Make account-backed Saved Commutes useful after signup by showing whether a rider's saved rapid-transit route is affected by current or planned LineWatch TO service impacts.

The route engine should choose a **default scheduled route**, not a fastest live route. It uses scheduled adjacent-station timing from the active TTC GTFS import when available and deterministic fallback weights when scheduled weights are unavailable.

This feature is in-app impact matching. It does not add push notifications, email notifications, full trip planning, fare logic, walking transfers, manual route editing, or live station-arrival predictions.

## Current Gap

Saved Commutes currently stores a label, origin station, and destination station for the authenticated account. The card renders the route label but always says `Impact matching pending`.

The useful version should:

- compute a transfer-aware route between the saved origin and destination;
- derive every station and adjacent segment on that route;
- match dashboard-visible service impacts against those route stations and segments;
- clearly label the route as a default scheduled/topology route, not a live fastest route.

## Scope

In scope:

- weighted pathfinding across seeded Lines 1, 2, 4, 5, and 6 topology;
- Dijkstra route selection over `line_segments`;
- GTFS-derived median adjacent-station travel seconds when an active schedule import exists;
- fallback segment weights when no active GTFS import exists or a segment has no reliable schedule-derived weight;
- transfer penalties at shared station IDs such as `bloor-yonge`, `st-george`, `spadina`, `sheppard-yonge`, `cedarvale`, `kennedy`, and `finch-west`;
- impact matching against active suspensions, ordinary delays, active planned closures, Reduced Speed Zones, upcoming planned closures, and station-node service impacts already exposed by the dashboard read model;
- extending `/api/account/commutes` with route path and impact summary fields;
- frontend Saved Commutes cards that show clear, affected, planned, or route-unavailable states;
- tests for GTFS weight reads, weighted pathfinding, impact matching, account response mapping, frontend type handling, and smoke-stub rendering.

Out of scope:

- route review/edit UI;
- manual ordered station selection;
- alternate-route recommendations;
- complete TTC trip planning;
- live vehicle or live travel-time routing;
- walking transfers outside station complexes;
- user-specific accessibility preferences;
- elevator/escalator outage matching for saved commutes;
- background notification delivery;
- persisting route snapshots in `saved_commutes`;
- Redis-backed commute caching.

Manual route editing is the intended next slice after this feature. The backend path/impact DTOs should make that future possible by keeping station IDs and segment IDs explicit.

## Product Behavior

When a signed-in user opens Saved Commutes, each card should show:

- commute label;
- origin-to-destination route label;
- route path state;
- default-route summary;
- transfer summary when the path uses transfers;
- impact status pill;
- short impact detail;
- up to three matching impact references.

Status behavior:

- `Clear`: a route path exists and no current or planned dashboard-visible impacts intersect it.
- `Affected now`: one or more active delays, suspensions, Reduced Speed Zones, active planned closures, or station-node impacts intersect the path.
- `Planned impact`: no current impacts match, but one or more upcoming planned closures intersect the path.
- `Route unavailable`: the backend cannot compute a path through the current rapid-transit topology.

Timing behavior:

- `gtfs-scheduled-median`: all selected route segments use active GTFS-derived median adjacent-station travel seconds.
- `mixed-scheduled-fallback`: at least one selected route segment uses active GTFS-derived timing and at least one selected segment uses fallback timing.
- `topology-fallback`: no selected route segment uses GTFS-derived timing.

The frontend may show "Default scheduled route" when the source is GTFS-backed and "Default route" when fallback timing is used. It must not claim the route reflects live train movement.

## Backend Design

Add a new `commute` package for route and impact logic. Keep account ownership and persistence in the existing `account` package.

Core backend units:

- `CommuteResponses`: DTO records for route path, impact summary, and matched impact references.
- `CommuteTravelTimeRepository`: reads the active GTFS schedule import and returns median adjacent-station travel seconds by `line_segments.id`.
- `CommutePathService`: builds a weighted graph from `line_segments` and runs Dijkstra.
- `CommuteImpactService`: matches a computed path against dashboard-visible impact DTOs from `AlertDashboardService`.
- `SavedCommuteService`: injects the commute services and includes `path` and `impact` in each saved-commute response.

Graph behavior:

- each `LineSegmentEntity` is an undirected graph edge between `stationAId` and `stationBId`;
- each edge stores `segmentId`, `lineId`, `sortOrder`, `travelSeconds`, and `weightSource`;
- Dijkstra state includes `(stationId, currentLineId)` so transfer penalties are applied only when changing lines;
- first segment from the origin has no transfer penalty;
- changing lines at the same shared station adds a transfer penalty to the next segment's cost;
- tie-breaking is deterministic by total seconds, transfer count, segment count, then a stable path key.

Default weights:

- fallback segment travel time: 120 seconds;
- default transfer penalty: 180 seconds;
- Spadina transfer penalty: 300 seconds because the Line 1 and Line 2 nodes use separate map anchors and the transfer is longer;
- same-line continuation transfer penalty: 0 seconds.

These constants are product heuristics. They are better than map distance and safe when GTFS is unavailable.

## GTFS Weight Derivation

The repository already has GTFS schedule tables from `V16__gtfs_schedule_arrivals.sql`:

- `gtfs_schedule_imports`
- `gtfs_routes`
- `gtfs_trips`
- `gtfs_stop_times`
- `gtfs_station_stops`

`CommuteTravelTimeRepository` should:

1. find the latest active GTFS import;
2. join stop times to `gtfs_station_stops` and rapid-transit routes;
3. pair adjacent stop-time rows within the same trip and line;
4. compute `next.arrival_seconds - current.departure_seconds`;
5. discard invalid values under 30 seconds or over 900 seconds;
6. match station pairs to `line_segments` in either station order;
7. aggregate with median seconds per segment.

The repository returns an empty list when no active import exists. The path service then uses fallback weights for every segment.

## API Contract

`GET /api/account/commutes` and `POST /api/account/commutes` keep the existing fields and add `path` and `impact`.

Representative response:

```json
{
  "id": "commute_01",
  "label": "Morning commute",
  "originStationId": "finch",
  "originStationName": "Finch",
  "destinationStationId": "union",
  "destinationStationName": "Union",
  "routeLabel": "Finch -> Union",
  "path": {
    "status": "available",
    "stationIds": ["finch", "north-york-centre", "sheppard-yonge", "york-mills", "lawrence", "eglinton", "davisville", "st-clair", "summerhill", "rosedale", "bloor-yonge", "wellesley", "college", "tmu", "queen", "king", "union"],
    "segmentIds": ["line-1-finch-north-york-centre", "line-1-north-york-centre-sheppard-yonge", "line-1-sheppard-yonge-york-mills", "line-1-york-mills-lawrence", "line-1-lawrence-eglinton", "line-1-eglinton-davisville", "line-1-davisville-st-clair", "line-1-st-clair-summerhill", "line-1-summerhill-rosedale", "line-1-rosedale-bloor-yonge", "line-1-bloor-yonge-wellesley", "line-1-wellesley-college", "line-1-college-tmu", "line-1-tmu-queen", "line-1-queen-king", "line-1-king-union"],
    "lineIds": ["line-1"],
    "transferStationIds": [],
    "estimatedTravelSeconds": 1560,
    "weightSource": "gtfs-scheduled-median",
    "summary": "Default scheduled route: 17 stations on Line 1, about 26 min"
  },
  "impact": {
    "status": "clear",
    "severity": "clear",
    "statusLabel": "Clear",
    "detail": "No active or planned LineWatch impacts match this route.",
    "matchedImpacts": []
  },
  "createdAt": "2026-06-05T14:30:00Z",
  "updatedAt": "2026-06-05T14:30:00Z"
}
```

Matched impact reference:

```json
{
  "id": "alert_123",
  "kind": "delay",
  "status": "current",
  "severity": "minor",
  "title": "Delays",
  "lineId": "line-1",
  "lineNumber": "1",
  "location": "Eglinton to Davisville",
  "displayDirection": "Southbound",
  "source": "TTC Live Alert",
  "matchedSegmentIds": ["line-1-eglinton-davisville"],
  "matchedStationIds": [],
  "startedAt": "2026-06-06T12:15:00-04:00",
  "updatedAt": "2026-06-06T12:20:00-04:00",
  "window": null,
  "timingStatus": "active-now"
}
```

## Frontend Design

`frontend/src/app/account-data.ts` owns the new TypeScript types for commute path and impact. The adapter keeps graceful unavailable handling for failed account calls.

`SavedCommutesPanel` replaces pending copy with real states:

- a `status-pill` reflecting impact severity;
- route detail text from `impact.detail`;
- route summary from `path.summary`;
- compact matched-impact rows with kind, line number, and location;
- a route-unavailable message when path status is not available.

The panel remains compact and dashboard-native. It should not become a trip planner page.

## Testing

Backend:

- `CommuteTravelTimeRepositoryTest` verifies SQL derives median adjacent station weights and returns no weights without an active import.
- `CommutePathServiceTest` covers weighted path selection, fallback weights, transfer penalties, deterministic transfer station IDs, and unavailable paths.
- `CommuteImpactServiceTest` covers clear routes, active segment matches, station-node matches, planned closure matches, and severity priority.
- `SavedCommuteServiceTest` verifies account responses include path and impact.
- `SavedCommuteControllerTest` keeps session-account ownership checks intact.

Frontend:

- `account-data.test.mjs` verifies new commute path and impact fields are typed.
- `account-ui-source.test.mjs` verifies the pending state has been replaced with impact rendering.
- smoke stub data returns a commute with a matching current impact so Playwright can assert the signed-in feature is visibly useful.

Verification commands:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Documentation Updates

After implementation, update `README.md`, `AGENTS.md`, and `GEMINI.md` to state that account-backed saved commutes compute default weighted rapid-transit routes and match dashboard-visible service impacts. Keep the limitations explicit: no push notifications, no manual route editing yet, no full trip planner, no Redis-backed commute cache, no accessibility-personalized matching, and no live subway/LRT route timing.
