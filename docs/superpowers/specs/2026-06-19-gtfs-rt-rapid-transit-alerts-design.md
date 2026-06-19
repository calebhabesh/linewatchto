# GTFS-RT Rapid-Transit Alert Supplement Design

**Date:** 2026-06-19
**Status:** Approved for implementation planning

## Objective

Allow LineWatch TO to use TTC GTFS-RT service alerts as a supplemental
rapid-transit source when an incident is absent from TTC Live Alerts, while
continuing to prefer the richer Live Alerts record when both sources describe
the same incident.

The motivating case is GTFS-RT entity `70483`, whose `route_id: "2"` identifies
Line 2 and whose `NO_SERVICE` alert covers Jane to Islington. The current parser
classifies route `2` as a bus route, so rapid-transit normalization ignores it.
Its numeric GTFS stop IDs also cannot currently produce station or map impacts.

## Product Decisions

- TTC Live Alerts remains the preferred source because it generally has richer
  fields such as structured station bounds, shuttle details, and descriptions.
- GTFS-RT supplements rather than replaces TTC Live Alerts.
- GTFS-RT route IDs `1`, `2`, `4`, `5`, and `6` map to LineWatch rapid-transit
  Lines 1, 2, 4, 5, and 6.
- A GTFS-RT-only incident is dashboard-visible and participates in the same
  map, status, saved-commute, and notification paths as another normalized
  rapid-transit alert.
- A GTFS-RT-backed DTO is labeled `TTC GTFS-RT`; it must not be presented as a
  TTC Live Alert.
- If the line and impact are known but stations cannot be resolved, retain the
  alert as line-wide. Do not invent a segment or silently discard the incident.
- Raw records from both sources remain staged even when one normalized
  projection is suppressed as a duplicate.

## Scope

### Included

- Recognize supported rapid-transit route IDs in the existing combined GTFS-RT
  text parser.
- Preserve the existing bus, streetcar, and mixed-surface classification rules.
- Resolve numeric GTFS-RT stop IDs through the active merged static GTFS import.
- Derive map bounds from resolved stations using the seeded station order for
  the affected line.
- Fall back to explicit station bounds in rider-facing GTFS-RT header text.
- Preserve GTFS-RT epoch timestamps as UTC instants.
- Normalize supported GTFS-RT effects through the existing rapid-transit alert
  classifier.
- Suppress a GTFS-RT projection when a Live Alerts projection in the same poll
  conservatively matches the same incident.
- Prefer Live Alerts content and source attribution for a matched pair.
- Add source-aware dashboard DTO labels.
- Add focused parser, normalizer, resolver, application-service, and dashboard
  tests.

### Excluded

- Replacing the text-format GTFS-RT parser with generated protobuf classes.
- Adding new alert tables or a permanent cross-source incident entity.
- Supporting multi-line GTFS-RT entities in one normalized alert. Such records
  remain staged and unmatched until a separate split-projection design exists.
- Inferring affected segments from arbitrary natural-language descriptions.
- Changing surface-notice behavior.
- Frontend layout or styling changes.
- Claiming GTFS-RT alerts are more complete or authoritative than Live Alerts.

## Architecture

### Source Parsing

`GtfsRtServiceAlertTextParser` will classify a record as rapid transit when its
single route ID is one of the supported TTC line numbers. Lines 1, 2, and 4 use
the existing `Subway` route type; Lines 5 and 6 use `LRT`. All other route IDs
continue through the current surface classification.

The parser keeps the namespaced source ID (`gtfsrt-<entity-id>`), raw entity
payload, stop IDs, effect, cause, translated text, active period, and feed
timestamp. A rapid-transit record with multiple route IDs is not projected in
this slice because the current alert model has one `line_id`.

### Station Resolution

Add a focused GTFS-RT rapid-transit station resolver backed by
`GtfsScheduleReadRepository`.

For a supported line, the resolver:

1. Finds the active schedule import.
2. Maps each GTFS-RT `stop_id` through `gtfs_station_stops` using both
   `import_id` and `line_id`.
3. Deduplicates platform stop IDs that resolve to the same LineWatch station.
4. Orders resolved stations by `station_lines.sort_order`.
5. Uses the first and last ordered stations as map bounds.

The normalizer will use these internal station IDs directly rather than sending
numeric stop IDs through `StationAliasResolver`.

If no active import exists, no stop IDs match, or only part of the scope
resolves, a small bounds parser checks explicit phrases in the title or header,
including `between <station> and <station>` and `<station> to <station>`. Each
captured name still passes through `StationAliasResolver`; free-form text never
becomes a station ID by itself.

Resolution precedence is:

1. Complete static-GTFS stop resolution.
2. Text bounds to fill missing start or end stations.
3. Any remaining resolved station subset.
4. Line-wide alert with no station or segment scope.

### Time Handling

The Live Alerts JSON timestamps retain the existing Toronto wall-time
normalization. GTFS-RT parser timestamps originate as epoch seconds and are
already absolute instants, so rapid-transit normalization will preserve them in
UTC, matching the existing surface-notice behavior.

For entity `70483`:

- Feed timestamp `1781843332` is `2026-06-19T04:28:52Z`.
- Active-period start `1781885880` is `2026-06-19T16:18:00Z`
  (`12:18 PM` EDT).

### Canonical Projection Selection

`TtcAlertFeedApplicationService` will stage every fetched route record first,
normalize rapid-transit candidates in memory, then select the rider-visible
projections before upserting alerts.

All Live Alerts projections are selected. A GTFS-RT projection is selected
unless a selected Live Alerts projection matches it using the following
conservative rules:

1. The normalized line and impact kind are equal.
2. Their active periods overlap, their starts are within 60 minutes, or one
   source omits timing.
3. Their scope matches by either:
   - the same unordered non-null station bounds;
   - the same non-empty resolved station set; or
   - equal normalized rider-facing title/header text.

Normalization for text comparison is limited to case folding, whitespace
collapse, and punctuation removal. No fuzzy or AI matching is introduced.

When a pair matches:

- Persist or reactivate only the Live Alerts projection.
- Leave both raw source records active in `ttc_alert_source_records`.
- Exclude the GTFS-RT source ID from the selected alert IDs so a previously
  visible GTFS-RT projection is deactivated.

When the Live Alerts record later disappears but the GTFS-RT record remains in
a successful poll, the GTFS-RT projection becomes selected and visible. The
reverse transition works the same way. Absence from one source therefore does
not remove an independently present record from the other source.

The existing behavior remains for transport failures: a failed primary Live
Alerts request fails the ingestion run without deactivating records. The
optional GTFS-RT request continues to log and return no supplemental records;
this slice does not redesign ingestion health into separate per-source runs.

### Source Attribution

No schema migration is required. The persisted `source_alert_type` already
distinguishes `GTFS-RT` from Live Alerts values.

Add one source-label helper used by active alerts, delays, planned closures, and
Reduced Speed Zone DTO projection:

- `GTFS-RT` becomes `TTC GTFS-RT`.
- Other normalized rapid-transit alerts retain their existing Live Alerts or
  service-advisory labels.

This keeps API output truthful without changing frontend contracts.

## Error Handling

- Missing active GTFS schedule import: continue with text bounds or a line-wide
  alert.
- Unknown stop IDs: preserve the known station subset and count the normalized
  record as unresolved for ingestion health.
- Unsupported or multi-line route IDs: stage the raw record and do not create a
  rapid-transit projection.
- GTFS-RT parse or fetch failure: retain the existing warning and allow the
  primary Live Alerts poll to proceed.
- A duplicate matcher uncertainty resolves in favor of showing both records;
  false merging is more harmful than a temporary duplicate.

## Testing

### Parser

- Entity `70483` parses as Line 2 with route type `Subway`.
- Numeric stop IDs, effect, cause, text, and epoch timestamps are preserved.
- Bus and streetcar examples keep their existing route types.
- Multi-line rapid-transit entities are not misrepresented as one line.

### Station Resolution And Normalization

- Active static-GTFS mappings resolve platform stop IDs to unique stations in
  line order and derive Jane-to-Islington bounds.
- Header text resolves Jane and Islington when static GTFS is unavailable.
- An unresolved GTFS-RT alert persists as line-wide.
- `NO_SERVICE` becomes a suspension.
- GTFS-RT epoch times remain the same UTC instants after normalization.
- Live Alerts wall-time behavior remains unchanged.

### Feed Application

- A GTFS-RT-only rapid-transit alert is persisted.
- A Live Alerts-only alert is persisted.
- Matching records select Live Alerts and leave both raw records staged.
- A previously visible GTFS-RT alert is deactivated when its matching Live
  Alerts projection appears.
- GTFS-RT becomes visible when the matching Live Alerts projection disappears
  but GTFS-RT remains.
- Similar alerts on different lines, impacts, scopes, or times are not merged.

### Dashboard

- GTFS-RT-backed alert DTOs report `TTC GTFS-RT`.
- Live Alerts-backed DTOs retain their existing source labels.
- Resolved bounds produce the expected Line 2 segment IDs through the existing
  segment matcher.

## Verification

Run the required backend suite:

```bash
mvn -f backend/pom.xml test
```

No frontend verification is required because the API shape and frontend code do
not change.

