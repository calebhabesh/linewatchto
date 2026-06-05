# Scheduled Rapid-Transit Arrivals Design

## Source

LineWatch TO uses the public TTC merged GTFS schedule dataset for station arrival estimates on mapped rapid-transit Lines 1, 2, 4, 5, and 6:

https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/merged-gtfs-ttc-routes-and-schedules

TTC BusTime GTFS-realtime is a surface-vehicle feed and is not used for subway/LRT station arrivals. Subway/LRT arrivals are timetable-based until TTC publishes an official rapid-transit realtime feed.

## Contract

`GET /api/stations/{id}` returns scheduled arrival rows with:

- `lineId`
- `direction`
- `minutes`
- `predictedAt`
- `label`
- `source`
- `status`

Allowed arrival `status` values are:

- `scheduled`
- `live`
- `unavailable`
- `demo`

The default backend provider is `scheduled`. The `live` status is reserved for a future official rapid-transit realtime source.

## Disruption Context

Station detail also returns `arrivalContext`:

- `scheduleMayBeDisrupted`
- `message`
- `reason`
- `severity`
- `source`

The frontend greys the arrivals section when `scheduleMayBeDisrupted` is true and shows "Schedule may be disrupted" with the impact reason. Accessibility outages alone do not set this flag.

## Failure Behavior

- If no GTFS schedule import is active, station detail returns unavailable arrival rows with source `TTC scheduled service unavailable`.
- If no trips are scheduled in the configured horizon, station detail returns source-labeled scheduled rows with label `No scheduled service`.
- If fixture fallback is used, arrivals remain explicitly labeled as demo estimates.
- Scheduled rows are never described as live train predictions.

## Station Mapping

`backend/src/main/resources/arrival/rapid-transit-station-aliases.csv` maps every LineWatch station-line pair on the SVG map to TTC GTFS station-name aliases. The importer resolves aliases to GTFS stop IDs from the current merged schedule zip and stores only rapid-transit stop mappings.

## Testing

Coverage includes GTFS CSV parsing, schedule import filtering, station-alias coverage, scheduled-arrival time calculation, service-calendar exceptions, station API disruption context, frontend fixture typing, greyed arrivals UI, smoke coverage, and documentation claim alignment.
