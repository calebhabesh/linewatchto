# Station Detail Enrichment Design

Date: 2026-06-02
Status: Approved for implementation planning

## Context

LineWatchTO already opens a station detail panel when a user selects a map
station. The existing panel shows served lines, a seeded access summary, seeded
station impacts, and explicitly labeled demo arrivals. Its backend read model is
partial:

- `station_lines` contains only a subset of the mapped stops.
- The frontend fallback assigns incorrect line IDs to several stops.
- Static wheelchair and elevator metadata is not represented.
- Normalized TTC elevator and escalator outage records are persisted but are not
  exposed through the station API.
- Normalized TTC route alerts can link directly to stations but are not exposed
  through the station API.

This slice enriches that existing station boundary. It does not introduce a live
arrival provider or nightly closure scheduling.

## Product Decisions

- Show accessibility per line/platform in the opened station detail panel.
- Render wheelchair and elevator icons only inside that panel, not beside every
  map station dot.
- Preserve an elevator icon when an outage is active, give it a warning state,
  and show the outage detail below it.
- Show only fresh TTC alerts directly linked to the selected station. Do not
  infer station disruptions from every alert segment that passes through a stop.
- Keep arrivals as clearly labeled demo estimates for this slice.

## Data Model

### Static Station-Line Accessibility

Add two non-null boolean columns to `station_lines`:

```sql
wheelchair_accessible boolean not null default false
has_elevator boolean not null default false
```

Create a Flyway migration that completes `station_lines` for every mapped Line
1, 2, 4, 5, and 6 stop and applies the researched accessibility values from:

```text
${LINEWATCH_ASSET_DIR}/ttc_station_accessibility_lines_1_2_4_5_6.csv
```

The CSV is an authoring input, not a runtime dependency. Encode the reviewed
values in the migration so local setup and deployment remain self-contained.

Store accessibility on `station_lines`, not `stations`, because Spadina differs
by mapped stop:

| Station-line | Elevator | Wheelchair accessible |
| --- | --- | --- |
| `spadina` / `line-1` | No | No |
| `spadina` / `line-2` | Yes | Yes |

Complete line tagging also corrects frontend fallback assignments such as
Kipling (`line-2`), Castle Frank (`line-2`), Don Mills (`line-4`), Mount Dennis
(`line-5`), and Humber College (`line-6`).

### Dynamic Facility Outages

Reuse the normalized ingestion tables introduced in
`V4__alert_ingestion_foundation.sql`:

```text
accessibility_outages
accessibility_outage_stations
```

Expose only active records while the latest successful TTC ingestion run is
inside the configured dashboard freshness window. Suppress dynamic outage rows
when polling is stale, missing, or unsuccessful.

The TTC outage record links to a station but does not reliably identify a
specific mapped line platform. When an active elevator outage exists, mark the
selected station's displayed elevator icons as warnings and show the source
detail row. Do not claim that a specific Spadina platform is affected unless the
source contract later provides that mapping.

### Dynamic Station Disruptions

Reuse active normalized route alerts linked through:

```text
alerts
alert_stations
```

Expose only directly linked records while dashboard ingestion is fresh. Preserve
the TTC wording, effect, and source update time. Do not infer police, fire, or
track-level emergency categories when source data does not state them.

Retain the legacy `station_impacts` read as fixture fallback only. Live station
disruptions take precedence whenever fresh ingestion is available.

## Backend API

Extend `GET /api/stations/{id}` without adding a new endpoint.

Each station line adds static accessibility:

```json
{
  "id": "line-2",
  "number": "2",
  "name": "Bloor-Danforth",
  "color": "#14a44d",
  "platformLabel": "Eastbound / Westbound",
  "wheelchairAccessible": true,
  "hasElevator": true
}
```

The access block keeps its existing summary fields and adds active facility
outages:

```json
{
  "status": "outage",
  "summary": "One active TTC elevator outage is linked to this station.",
  "updatedAgo": "Updated 8 min ago",
  "outages": [
    {
      "id": "accessibility-example",
      "assetType": "elevator",
      "title": "Elevator outage",
      "description": "Source-provided outage detail.",
      "updatedAt": "2026-06-02T14:12:00Z",
      "source": "TTC Live Alerts"
    }
  ]
}
```

Use ISO timestamps in the API for dynamic records. Format relative time in the
frontend using the existing impact-time helper so the label remains current
without storing preformatted ages.

Station impacts retain their current card shape but add `updatedAt` for dynamic
alerts. Fixture rows may continue to use their existing `updatedAgo` copy.

Add a station-level `arrivalsSource` field with the fixed value
`"Demo estimates"` for this slice. Keep each arrival label as `"Demo arrival"`.
This forms an explicit source boundary for the later provider integration.

`GET /api/stations` continues to return station summaries. Complete
`station_lines` rows ensure every station summary includes its actual line IDs.
Its active-impact and access-status flags should reflect fresh dynamic reads when
available and fall back to fixture rows otherwise.

## Backend Components

- Extend `StationLineEntity` for the two static accessibility columns.
- Add focused station read repositories for active linked accessibility outages
  and active linked route alerts.
- Inject `IngestionFreshness` into `StationService`.
- Keep read-model assembly in `StationService`: choose fresh dynamic records or
  fixture fallback, map ISO timestamps, calculate status summaries, and preserve
  explicitly demo arrivals.
- Keep the controller endpoint unchanged.

The dynamic station queries should filter active records in the database. The
service freshness gate controls whether those records are visible to users.

## Frontend

Copy the provided authored SVG assets into:

```text
frontend/public/assets/linewatch/wheel-chair-symbol.svg
frontend/public/assets/linewatch/elevator-icon.svg
```

Extend `frontend/src/app/station-data.ts` so backend and fallback station details
share the enriched contract. Correct fallback line IDs and populate line-level
accessibility metadata from the same researched CSV values represented in the
backend migration.

Update `StationDetailPanel`:

- Render a line row for each served line with its existing line identity.
- Render wheelchair and elevator SVG icons under the corresponding line row.
- Use accessible text labels so the icons are understandable without relying on
  their artwork.
- Apply a warning treatment to visible elevator icons when any active elevator
  outage is linked to the selected station.
- Render active elevator and escalator outage detail rows in the access section.
- Render direct station alert cards in the station impacts section.
- Keep the arrivals heading and disclaimer explicit that estimates are demo
  data.

Do not add icons to the SVG map in this slice.

## Error Handling And Freshness

- An unknown station continues to return `404`.
- A missing static accessibility value defaults to `false` rather than claiming
  a facility exists.
- Missing, failed, or stale ingestion suppresses dynamic TTC station alerts and
  facility outages.
- A backend failure continues to use the local frontend fallback.
- Dynamic outage and alert rows identify `TTC Live Alerts` as their source.
- Demo arrivals remain visible and labeled even when live TTC ingestion is
  fresh, because this slice does not add a live-arrival source.

## Testing

### Backend

- Add migration assertions for the new `station_lines` accessibility columns,
  complete stop coverage, and Spadina's distinct line values.
- Extend station service tests for per-line static accessibility.
- Add station service tests for fresh elevator/escalator outage reads.
- Add station service tests proving stale ingestion suppresses dynamic records.
- Add station service tests for fresh directly linked route alerts.
- Verify summary line IDs and summary flags use the enriched read model.
- Keep controller contract tests current.

### Frontend

- Extend station adapter tests for corrected fallback line IDs.
- Add fallback assertions for Spadina's distinct Line 1 and Line 2
  accessibility.
- Extend panel layout tests for both authored SVG assets, accessible labels,
  outage warnings, and demo arrival labeling.
- Extend Playwright smoke coverage so a selected station panel renders line
  tags, accessibility icons, and a warning-state outage fixture.

### Verification

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Out Of Scope

- Public live-arrival provider selection and integration.
- Nightly closure active-window gating.
- Asset-level or platform-specific outage matching beyond TTC source links.
- GTFS import and production geographic segment matching.
- Accessibility icons beside map station dots.

