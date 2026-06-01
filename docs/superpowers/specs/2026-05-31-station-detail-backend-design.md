# LineWatch TO Station Detail Backend Design

Date: 2026-05-31

## Purpose

Add the first meaningful full-stack feature to LineWatch TO: clickable station details backed by Spring endpoints and PostgreSQL seed data. The feature should make the map feel more inspectable while establishing backend ownership of station, line, access, and impact contracts.

The user-facing behavior is:

- A rider clicks or taps a station on the TTC map.
- The app opens station details in a right-side dock on desktop and a bottom sheet on mobile.
- The panel shows served lines, active station impacts, planned closure impacts, access status, and clearly labeled demo arrivals.
- The frontend calls Spring for station detail data when available, with local fixture fallback only for demo resilience.

This is not an official TTC product and must not claim live train arrivals, live accessibility ingestion, or live GTFS import.

## Product Scope

This slice builds station inspection for the subway/LRT dashboard. It does not replace the current map, alert cards, closure cards, saved commutes, or reliability panels.

In scope:

- Backend `GET /api/stations` list endpoint for map hit targets and station search/autocomplete groundwork.
- Backend `GET /api/stations/{id}` detail endpoint.
- Flyway schema and seed data for lines, stations, station-line connections, station access status, and station impact records.
- Demo arrivals served by the backend response and labeled as fixture/demo data.
- Frontend station hit targets over the existing SVG map.
- Desktop right dock and mobile bottom sheet.
- Responsive layout hardening for station details, including tap targets, panel sizing, loading states, empty states, and reduced-motion behavior.

Out of scope for this slice:

- Live TTC arrivals ingestion.
- Live elevator/escalator ingestion.
- Full GTFS import.
- PostGIS geometry snapping.
- User accounts, saved station preferences, and notifications.
- Replacing all frontend fixture data with backend data.

## UX Design

Station selection becomes a first-class map interaction alongside alert and closure previewing.

Desktop behavior:

- The station detail panel docks to the right side of the viewport.
- It avoids the existing left-side menu and alert/closure panels.
- It stays above the map but below critical global controls when layering conflicts arise.
- It is no wider than needed for scan-friendly operational data.

Mobile behavior:

- The station detail panel becomes a bottom sheet.
- It leaves enough of the map visible to preserve spatial context.
- It supports content scrolling inside the sheet instead of pushing the map offscreen.
- The close affordance is large enough for touch.

Station marker behavior:

- Supported station dots receive transparent SVG hit targets above the existing map asset.
- Hit targets must be keyboard reachable and screen-reader labeled.
- Selected stations receive a pulse/ring highlight.
- Stations with active access or service impacts receive a subtle warning state.
- Clicking an alert segment clears station selection only when the new selection would conflict visually.

## Frontend Responsiveness

Frontend responsiveness belongs inside this slice, not as a loose add-on. The station detail panel changes the layout, tap targets, and mobile viewport behavior, so responsive work is part of the acceptance criteria.

Required now:

- Right dock on desktop and bottom sheet on mobile.
- Stable panel width/height constraints so text and controls do not resize the map unpredictably.
- Tap targets at least 44px on touch layouts.
- No overlap between the station panel, floating menu, zoom controls, compass, and legend at common mobile and desktop widths.
- Immediate visual feedback after selecting a station, including a loading state if the backend request is in flight.
- Reduced-motion support for panel transitions and station pulse.
- Source-level fixture tests for the responsive classes and station-panel mode split.

Better suited for the next frontend-liveliness slice:

- Animated slow-zone tracers along delayed path overlays.
- Pulsing epicenter nodes for active alerts.
- Shuttle bus tracers for closed segments.
- Map focus/zoom-to-segment behavior.

Those motion features can build on the station and impact contracts created here. The existing SVG segment guide layer for nonlinear TTC sections should be used when the app starts representing precise nonlinear path segments such as St George to Spadina, St Andrew to Union, and King to Union.

## Backend Architecture

Create a station domain package under `com.calebhabesh.linewatch.station`.

Core units:

- `StationController`: HTTP endpoints and response status mapping.
- `StationService`: read model assembly and not-found behavior.
- `StationRepository`, `TransitLineRepository`, `StationLineRepository`, `StationAccessStatusRepository`, `StationImpactRepository`: JPA persistence.
- `StationDetailResponse`, `StationSummaryResponse`, and nested response records: API contract objects.

The backend should assemble a station detail response from database-backed station, line, access, and impact rows. Demo arrivals may be generated by the service from seeded station/line data for this slice, but the response must include copy that identifies arrivals as demo data.

## Data Model

Initial tables:

- `transit_lines`
  - `id`: stable route id such as `line-1`.
  - `number`: rider-facing line number.
  - `name`: rider-facing line name.
  - `color`: line color hex.
  - `sort_order`: display order.
- `stations`
  - `id`: stable slug used by API and frontend.
  - `name`: rider-facing station name.
  - `map_x`: SVG coordinate x in the `8250 x 4000` viewBox.
  - `map_y`: SVG coordinate y in the `8250 x 4000` viewBox.
  - `interchange`: whether the station connects multiple rapid transit lines.
- `station_lines`
  - `station_id`
  - `line_id`
  - `platform_label`
- `station_access_statuses`
  - `station_id`
  - `status`: `normal`, `advisory`, or `outage`.
  - `summary`
  - `updated_ago`
- `station_impacts`
  - `id`
  - `station_id`
  - `type`: `active-alert` or `planned-closure`.
  - `severity`: `delay`, `suspension`, or `planned`.
  - `title`
  - `summary`
  - `updated_ago`
  - `source`

Use seed data for the currently represented map stations, with priority on Union, King, Bloor-Yonge, St George, Spadina, Eglinton, Finch, North York Centre, York Mills, Sheppard-Yonge, Kennedy, Kipling, Sherbourne, Castle Frank, Don Mills, Mount Dennis, Finch West, Humber College, and Vaughan Metropolitan Centre. Keep Science Centre out of the first clickable seed until the edited SVG exposes a stable station id for it.

Normalize the existing frontend typo `eglington` to `eglinton` when introducing backend station ids.

## API Contract

`GET /api/stations`

Returns lightweight station summaries for map rendering and future search.

```json
{
  "generatedAt": "seeded-demo",
  "stations": [
    {
      "id": "union",
      "name": "Union",
      "mapX": 4311,
      "mapY": 3597,
      "interchange": true,
      "lineIds": ["line-1"],
      "hasActiveImpact": true,
      "accessStatus": "normal"
    }
  ]
}
```

`GET /api/stations/{id}`

Returns a station detail read model.

```json
{
  "id": "union",
  "name": "Union",
  "mapX": 4311,
  "mapY": 3597,
  "interchange": true,
  "lines": [
    {
      "id": "line-1",
      "number": "1",
      "name": "Yonge-University",
      "color": "#f4c430",
      "platformLabel": "Northbound / Southbound"
    }
  ],
  "access": {
    "status": "normal",
    "summary": "No station access advisories in demo data.",
    "updatedAgo": "Fixture seed"
  },
  "impacts": [
    {
      "id": "impact-union-weekend",
      "type": "planned-closure",
      "severity": "planned",
      "title": "Weekend signal upgrades",
      "summary": "Planned work affects Line 1 north of Eglinton. Union remains open.",
      "updatedAgo": "Fixture seed",
      "source": "Planned TTC closure fixture"
    }
  ],
  "arrivals": [
    {
      "lineId": "line-1",
      "direction": "Northbound",
      "minutes": 2,
      "label": "Demo arrival"
    }
  ],
  "dataMode": "seeded-demo",
  "disclaimer": "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions."
}
```

Not found behavior:

- Unknown station ids return HTTP 404.
- The frontend should show a compact unavailable state and leave the selected marker visible until the user closes the panel or chooses another station.

## Frontend Architecture

Create a station data adapter layer instead of calling `fetch` directly from the map component.

Core units:

- `frontend/src/app/station-data.ts`: TypeScript station API types, local fallback fixtures, and `getStationSummaries` / `getStationDetail` functions.
- `frontend/src/components/StationDetailPanel.tsx`: right dock / bottom sheet presentation.
- `frontend/src/components/InteractiveTtcMap.tsx`: station overlay hit targets and selected station highlight.
- `frontend/src/components/LineWatchShell.tsx`: selected station state and coordination with alerts/closures/menu.

The current `linewatch-data.ts` remains the fixture/API-shape seam for line status, map segments, alerts, closures, commutes, and reliability. Station detail moves into its own station-focused seam to keep files smaller and make later backend replacement clearer.

## Error Handling

Backend:

- Validate station id path variables as non-empty strings.
- Return 404 for missing stations.
- Avoid returning stack traces or internal database errors in API responses.

Frontend:

- Show loading state immediately after station selection.
- Show backend unavailable copy if the API request fails and fallback data is used.
- Show a not-found state if neither backend nor fallback has the station.
- Preserve keyboard access to close the panel and move focus logically.

## Testing Strategy

Backend tests:

- Service test for known station detail response.
- Service test for unknown station id.
- Controller test for `GET /api/stations`.
- Controller test for `GET /api/stations/{id}`.
- Flyway migration validation through `mvn -f backend/pom.xml test`.

Frontend tests:

- Station adapter fixture tests using Node's built-in test runner.
- Source-level component tests verifying station detail panel, selected station state, and responsive right-dock/bottom-sheet classes.
- Existing fixture, map layering, drawer layout, and glass rendering tests remain in place.

Verification:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Because this is cross-stack and user-facing, also run:

```bash
npm --prefix frontend run build
```

## Rollout Plan

1. Add backend station schema and API tests.
2. Add Flyway migration and seed data.
3. Implement backend station read model.
4. Add frontend station data adapter with fallback behavior.
5. Add station markers, selected station state, and station detail panel.
6. Add responsive layout hardening as part of the panel work.
7. Run cross-stack verification.

## Acceptance Criteria

- `GET /api/stations` returns seeded station summaries.
- `GET /api/stations/union` returns a detail payload with lines, access status, impacts, demo arrivals, and disclaimer.
- Unknown station ids return 404.
- Clicking or tapping a supported map station opens a station detail panel.
- Desktop uses a right dock; mobile uses a bottom sheet.
- The panel does not obscure the left menu, alert panels, zoom controls, or critical map context.
- Demo arrivals are labeled as demo data in code and UI copy.
- Frontend still works when the backend is not running by using local fallback station fixtures.
- Cross-stack verification commands pass or failures are reported with exact command output.
