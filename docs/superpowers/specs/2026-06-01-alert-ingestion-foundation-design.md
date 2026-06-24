# LineWatchTO Alert Ingestion Foundation Design

**Date:** 2026-06-01
**Status:** Approved for implementation planning

## Objective

Add the first live-data backend slice for LineWatchTO by polling the official TTC Live Alerts JSON endpoint, preserving the source records, normalizing rapid-transit alerts and station accessibility outages, tracking ingestion health, and persisting changed route-alert snapshots.

This slice deliberately keeps the existing seeded dashboard read paths in place. It builds and verifies the ingestion foundation before live records drive `/api/alerts`, `/api/status`, station panels, or map overlays.

## Approved Delivery Sequence

Live data will be introduced in three consecutive backend slices:

1. **Alert ingestion foundation:** poll, stage, normalize, deduplicate, snapshot, and report ingestion health.
2. **Live alert API switch:** replace seeded alert, status, station-outage, and map-overlay read paths incrementally while preserving frontend fixture fallback.
3. **Live station arrivals:** add a separate arrival-source adapter and short-lived cache after confirming the machine-readable TTC arrival endpoint.

Arrival times are intentionally separate from alert ingestion. They have a different upstream source, a higher refresh rate, and short-lived value. They should be cached rather than stored as historical disruption records.

## Official Source Boundary

The alert poller will read:

```text
GET https://alerts.ttc.ca/api/alerts/live-alerts
```

The endpoint was verified on 2026-06-01. It currently returns a JSON envelope with:

- `lastUpdated`
- `routes`
- `accessibility`

Route records currently include structured fields such as:

- `id`
- `alertType`
- `lastUpdated`
- `activePeriod`
- `activePeriodGroup`
- `route`
- `routeType`
- `stopStart`
- `stopEnd`
- `stopIDList`
- `title`
- `description`
- `headerText`
- `effect`
- `effectDesc`
- `direction`
- `cause`
- `causeDescription`
- `shuttleType`
- `shuttleStart`
- `shuttleEnd`
- `childAlerts`

Accessibility records use the same general envelope and include asset-specific values such as `routeType`, `elevatorCode`, and `escalatorCode`.

The endpoint is used by the TTC Live Alerts experience but is not treated as an immutable public contract. The client must ignore unknown JSON fields, preserve each raw source record, and isolate source DTOs from LineWatch domain models.

Relevant TTC source pages:

- [TTC Live Alerts](https://www.ttc.ca/service-alerts)
- [TTC Live Alerts JSON](https://alerts.ttc.ca/api/alerts/live-alerts)
- [TTC Live Alerts upgrade description](https://www.ttc.ca/riding-the-ttc/Updates/TTC-upgrades-Live-Service-Alerts-digital-experience)

## Current Repository Constraints

The backend already has:

- Flyway-created `alerts`, `alert_segments`, `snapshots`, and `ingestion_runs` tables.
- Partial JPA entities for `AlertEntity`, `SnapshotEntity`, and `IngestionRunEntity`.
- A seeded rapid-transit station catalogue for Lines 1, 2, 4, 5, and 6.
- Seven coarse SVG-backed `line_segments` records used by the demo map.
- Seeded `/api/map`, `/api/status`, `/api/alerts`, and station responses.

The existing segment records are display corridors, not a complete station-to-station network. Their PostGIS geometry remains nullable. This slice must not claim complete map matching, imported GTFS geometry, or production geospatial inference.

## Scope

### Included

- Poll the official TTC Live Alerts JSON endpoint on a configurable schedule.
- Stage every record from both `routes` and `accessibility` without discarding unsupported route types.
- Normalize subway and LRT records for Lines 1, 2, 4, 5, and 6 into the existing rapid-transit alert domain.
- Normalize elevator and escalator records into station accessibility-outage records.
- Resolve TTC station names through a deterministic station alias resolver.
- Preserve unresolved records for inspection and count them in ingestion health.
- Upsert records using stable TTC source identifiers.
- Mark records inactive only after a complete successful poll.
- Append route-alert snapshots only when rider-visible normalized state changes.
- Expose `GET /api/health/ingestion` for the latest alert poll status.
- Add focused unit and service tests using captured TTC-shaped fixture JSON.
- Keep scheduling disabled by default unless enabled through configuration.

### Excluded

- Replacing seeded `/api/alerts`, `/api/status`, station-panel, or `/api/map` responses.
- Rendering live overlays in the frontend.
- Live train-arrival ingestion or caching.
- GTFS static import.
- Populated PostGIS geometry.
- Geospatial intersection logic.
- Redis integration.
- Surface-route dashboard rendering.
- Planned-closure webpage scraping outside the official Live Alerts JSON payload.
- AI-based alert parsing.

## Architecture

### Data Flow

```text
TTC Live Alerts JSON
        |
        v
TtcAlertClient
        |
        v
TtcAlertIngestionService
        |
        +--> create ingestion_runs row: running
        |
        +--> stage all source records
        |       +--> routes
        |       +--> accessibility
        |
        +--> normalize supported projections
        |       +--> rapid-transit alerts
        |       +--> alert-to-station links
        |       +--> accessibility outages
        |       +--> accessibility-outage-to-station links
        |
        +--> append changed route-alert snapshots
        |
        +--> deactivate records missing from a successful poll
        |
        +--> complete ingestion_runs row: success or failed
```

### Source Staging

Add a `ttc_alert_source_records` table. It is the source-of-truth staging boundary for the latest known TTC alert records:

```text
source_section       routes | accessibility
source_id            TTC record id
route_type           TTC routeType when present
source_updated_at    TTC lastUpdated
payload              raw JSON record
active               whether present in the latest successful poll
first_seen_at
last_seen_at
```

The primary key is `(source_section, source_id)`.

Staging all source records provides three benefits:

1. TTC fields remain inspectable when normalization fails.
2. Surface-route records are preserved without expanding the current subway/LRT dashboard scope.
3. Future normalization improvements can be tested against captured source records.

### Rapid-Transit Alerts

Extend the existing `alerts` table to persist normalized TTC route-alert metadata:

```text
line_id
source_alert_type
effect
effect_description
direction
cause
cause_description
start_station_id
end_station_id
active_period_start
active_period_end
source_updated_at
shuttle_type
shuttle_start
shuttle_end
raw_payload
```

Add `alert_stations`:

```text
alert_id
station_id
sort_order
```

The link table records every resolved affected station in source order. It supports station-panel reads in the next slice without requiring geospatial matching.

Add `alert_active_periods`:

```text
alert_id
source_period_id
starts_at
ends_at
sort_order
```

TTC planned closures can contain `childAlerts` for recurring nightly windows inside a broader parent period. Normalize child periods when present and otherwise use the parent `activePeriod`. This allows the later API switch to distinguish an upcoming planned preview from a closure that is actively affecting service.

The existing `alert_segments` table remains unused by the ingestion foundation. Segment projection will be designed during the live API switch because the current map corridors are intentionally coarse.

### Accessibility Outages

Add `accessibility_outages`:

```text
id
source_id
asset_type            elevator | escalator
title
description
effect
effect_description
active_period_start
active_period_end
source_updated_at
active
raw_payload
created_at
updated_at
```

Add `accessibility_outage_stations`:

```text
outage_id
station_id
```

The association table allows the model to handle both the common single-station outage and any future TTC record that resolves to multiple stations.

### Ingestion Health

Extend `ingestion_runs` with counts that make the pipeline observable:

```text
records_fetched
records_staged
records_normalized
records_unmatched
source_feed_updated_at
```

Expose:

```text
GET /api/health/ingestion
```

The response reports the latest alert run status, start and completion timestamps, counts, and failure message when applicable. It does not claim that dashboard data is live while seeded read paths remain active.

Counter meanings are explicit:

- `records_fetched`: all records received across `routes` and `accessibility`.
- `records_staged`: source records successfully upserted.
- `records_normalized`: rapid-transit alerts and accessibility outages successfully projected.
- `records_unmatched`: records intended for a supported projection but missing a supported effect, line, asset type, or station resolution.

Intentionally staged surface-route records do not increment `records_unmatched`.

## Schema Migration

Add an additive Flyway migration after the existing schema and map-seed migrations. Do not rewrite migrations that may already have been applied. Preserve the existing uncommitted `svg_path` and demo-segment adjustments while adding the ingestion tables, columns, indexes, foreign keys, and constraints in the new migration.

## Normalization Rules

### Structured Fields First

The normalizer uses TTC structured fields before text parsing:

- `routeType` and `route` identify the supported rapid-transit line.
- `stopStart`, `stopEnd`, and `stopIDList` identify affected stations.
- `effect`, `effectDesc`, `alertType`, and `activePeriodGroup` classify the impact.
- `direction`, `cause`, and shuttle fields are copied as structured metadata.

Regex parsing is limited to narrow fallback cases, such as extracting an accessibility station name from the prefix of `headerText`. Regex is not the primary route-alert parser.

### Station Resolution

Add a `StationAliasResolver` with explicit aliases for TTC naming variants. Examples include:

- `St George` -> `st-george`
- `St. Clair` -> `st-clair`
- `Bloor-Yonge` -> `bloor-yonge`
- `Cedarvale` and `Eglinton West` -> `cedarvale`
- `TMU` and `Dundas` -> `tmu`
- `Vaughan` and `Vaughan Metropolitan Centre` -> `vaughan-metropolitan-centre`

Aliases must be normalized case-insensitively with whitespace trimming. They remain explicit and testable rather than inferred with fuzzy matching.

Unresolved station names are not silently discarded. The staged source record remains active, the projection stores any resolvable metadata, and the ingestion run increments `records_unmatched`.

### Alert Classification

LineWatch keeps its current rider-facing severity vocabulary:

```text
delay
suspension
planned
```

Classification rules are deterministic:

- Current no-service or closure effects normalize to `suspension`.
- Reduced-speed zones and significant-delay effects normalize to `delay`.
- Future scheduled closures normalize to `planned`.
- Unknown effects remain staged and count as unmatched until explicitly supported.

The existing `type` column remains the rider-facing grouping:

- Scheduled closure records use `planned-closure`.
- Other supported rapid-transit disruptions use `active-alert`.

The normalized periods determine whether a scheduled closure is upcoming or currently effective. During the later API-switch slice, an effective planned closure must contribute to current line status and may also remain visible in the planned-closure timeline.

The source fields remain stored so classification can evolve without data loss.

### Active-State Handling

TTC records use sentinel timestamps such as `0001-01-01T00:00:00Z` when no meaningful end time is available. Normalize those sentinel values to `null`.

After a complete successful poll:

- Upsert every fetched source record and supported normalized projection.
- Mark staged records missing from the poll inactive.
- Mark normalized alerts and outages missing from the poll inactive.

After a failed fetch, JSON parse failure, or persistence failure:

- Mark the ingestion run failed.
- Preserve the prior active records.
- Do not interpret the failed poll as an empty feed.

Use separate transaction boundaries for run tracking and feed application:

1. Create and commit the `running` ingestion-run row.
2. Apply staging, projection, snapshot, and deactivation changes atomically.
3. Mark the run `success` in a committed outcome update.
4. If feed application rolls back, mark the run `failed` in a separate committed outcome update.

## Scheduling And Configuration

Enable Spring scheduling, but gate the poller behind configuration:

```yaml
linewatch:
  ingestion:
    alerts:
      enabled: ${LINEWATCH_INGESTION_ALERTS_ENABLED:false}
      url: ${LINEWATCH_INGESTION_ALERTS_URL:https://alerts.ttc.ca/api/alerts/live-alerts}
      fixed-delay: ${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:PT2M}
```

The default remains disabled so local development, tests, and seeded demos do not make unexpected network calls. A service method must also support direct invocation in tests.

## Error Handling

- Configure explicit HTTP connect and read timeouts.
- Reject non-2xx upstream responses.
- Ignore unknown TTC JSON properties.
- Fail the run if the envelope cannot be parsed safely.
- Bound persisted error-message length.
- Log unmatched line and station identifiers with their TTC source ids.
- Preserve prior active data on all failed runs.
- Treat a valid empty feed as a successful poll only after the full envelope parses successfully.

## Testing

Use TDD with TTC-shaped local fixture JSON. No backend test should require public network access.

### Client Tests

- Deserialize a captured route alert, reduced-speed zone, elevator outage, and escalator outage.
- Ignore unknown upstream JSON fields.
- Normalize sentinel end times to `null`.
- Surface HTTP and malformed-payload failures.

### Normalizer Tests

- Map structured subway and LRT route records to internal line ids.
- Classify active suspension, delay, and planned closure records.
- Resolve canonical station names and aliases.
- Extract accessibility station names from TTC-shaped records.
- Preserve unresolved records and report unmatched outcomes.

### Ingestion Service Tests

- Stage all source records, including unsupported surface-route records.
- Upsert repeated source ids without duplication.
- Append a snapshot only when rider-visible route-alert state changes.
- Deactivate records absent from a successful poll.
- Preserve prior active records after a failed poll.
- Record success and failure run counts.

### Controller Tests

- Return the latest alert-ingestion run from `/api/health/ingestion`.
- Report a clear no-runs-yet state before the first poll.

## Live API Switch Slice

After the ingestion foundation passes verification:

- Replace `/api/alerts?type=live|planned` hard-coded responses with normalized database reads.
- Derive `/api/status` from active normalized alerts.
- Replace seeded station access summaries with active accessibility-outage reads.
- Include active route alerts linked through `alert_stations` in station detail responses.
- Design the display-segment projection required for live map overlays.
- Keep the existing complete local-fixture fallback in Next.js.
- Continue to label fallback mode clearly when backend reads fail.

## Live Arrival Slice

After live alert read paths are stable:

- Confirm the machine-readable TTC arrival source used by station pages.
- Add a dedicated arrival-source adapter.
- Resolve TTC stop/platform identifiers to LineWatch stations.
- Cache arrival estimates briefly instead of persisting them as alert history.
- Return explicit unavailable state when the arrival source fails.
- Replace seeded placeholder arrivals in `/api/stations/{id}` only after source and cache tests pass.

## Documentation Guardrails

Until the live API switch is complete:

- Describe ingestion as implemented only when polling, persistence, and tests exist.
- Describe dashboard alert and station data as seeded demo data.
- Do not claim that the visible map is live.

Until the arrival slice is complete:

- Keep station arrivals labeled as demo placeholders.
- Do not claim live train predictions.

At all stages:

- Present LineWatchTO as an unofficial TTC dashboard.
- Preserve links to TTC sources.
- State that TTC source formats and alert precision can change.

## Verification

Run:

```bash
mvn -f backend/pom.xml test
```

For the later API-switch slice, also run the frontend fixture, typecheck, lint, build, and Playwright smoke commands documented in `AGENTS.md`.

## Success Criteria

- The backend can poll the official TTC JSON endpoint when explicitly enabled.
- Every fetched route and accessibility record is staged with raw JSON.
- Supported rapid-transit route alerts are normalized and deduplicated.
- Elevator and escalator outages are normalized and linked to resolved stations.
- Failed polls preserve previously active records.
- Changed route-alert state appends snapshots without duplicate snapshot churn.
- `/api/health/ingestion` exposes the latest poll outcome without overstating dashboard freshness.
- Seeded dashboard read paths remain stable until the next slice.
- Backend tests pass without public network access.
