# A — Reliability Analytics over any range

Owner request, 2026-11-24: Reliability Analytics should read as LineWatchTO's
data dashboard, with history over any range (a month, six months, the year, a
custom range) instead of a fixed rolling 30 days, within the 200 GB VPS
volume. The map and status dashboard stay first; analytics gets its own route.

Read first: the Reliability section and the cancellation line of
[domain invariants](../domain-invariants.md), the
[source launch gates](../source-licensing-launch-gates.md) before A2 or A10,
[production VPS](../production-vps.md) (Backups) and the
[operations guide](../operations-guide.md) before A4, and
[testing](../testing.md) before Playwright work.

## Status

| Phase | Owns | State |
| --- | --- | --- |
| A0 | Stop deleting polling evidence (production env) | Done (2026-11-24) |
| A1 | Preserve schedule coverage: schedule days and service spans | Deployed & verified (2026-11-24, `83812000`); watch next GO import |
| A2 | Backfill schedule history from archived GTFS | Done in code (2026-11-24, D2 approved); ready to backfill archived zips on deploy |
| A3 | Preserve polling coverage: observation windows | Deployed & verified on production & A4 restored copy (2026-11-24, 0 mismatched days across 90 days per network) |
| A4 | Off-host backups and a restore drill | Done & drilled (2026-11-24, R2 `linewatchto-backups` ENAM, 16.6 MB copy, 114 s restore drill, 7.5 GB storage alert added) |
| A5 | Derived read model, methodology v1 (today's rules) | Deployed & verified on restored copy (2026-11-24) |
| A6 | Methodology v2: disruption classes and station-weighted impact | Deployed & verified (2026-11-24, live v2 build in 931 ms total) |
| A7 | Range API | Deployed & verified (2026-11-24, WAF extended to `/api/reliability/`, D8 closed-range edge caching enabled) |
| A8 | Analytics page: route, controls, summary | Deployed & verified (2026-11-24, `/ttc/analytics` and `/go-up/analytics` live) |
| A9 | Charts, drill-down and export | Deployed & verified (2026-11-24, `test:analytics` green on desktop & mobile CI) |
| A10 | New sources, each gated separately | Done in code (2026-11-24, D5 GO/UP OTP, D6 TTC delay log, TTC performance history); deploy & enable next |
| A11 | Close: retention, fallbacks, docs and claims | Done & verified (2026-11-24: Grafana rules applied, D7 retention lowered to `P400D`) |

Order: A1 and A3, then A4, A5, A6, A7, A8, A9, A11. A2 can run any time after
A1; A10 items after A7. Preservation comes first because the loss is daily and
cannot be undone. Backups come before the read model because a restored
production copy is the parity fixture for A5. The metric revision precedes the
API so the range contracts are designed once.

## Findings

Measured read-only on production, 2026-11-24, unless noted.

### Storage

- The volume is 200 GB (`/dev/sda1`, 193 GB usable): 60 GB used, 134 GB free.
  CourtLens shares it, with a 23 GB Postgres volume and 20 GB under
  `~/apps/courtlens/data`. LineWatchTO uses 1.8 GB of Postgres volume (database
  1.6 GB), 49 MB of Redis, 92 MB of schedule assets and 4.9 GB of images. The
  Grafana "disk free < 20%" warning already exists
  ([observability](../observability.md)).
- The largest LineWatchTO tables are schedules, all re-importable:
  `ttc_surface_stop_times` 477 MB, `regional_gtfs_departures` 334 MB,
  `gtfs_stop_times` 168 MB, `ttc_surface_trips` 73 MB. Two TTC imports and two
  each of GO and UP are retained.
- Reliability's own inputs are small. `snapshots` is 3.4 MB (5,846 rows since
  2026-06-20), `regional_alert_snapshots` 0.9 MB (2,350 since 2026-07-31),
  `alerts` 5.7 MB (2,055) and `regional_train_cancellations` 311 rows since
  2026-08-26. Snapshots are written on change, not per poll. No code deletes
  alerts, snapshots or cancellations; `alert_active_periods` rows are replaced
  when their alert is updated (`TtcAlertStore`).
- Polling evidence is the bulky input: `ingestion_runs` is 111 MB (309,323
  rows) and `metrolinx_ingestion_source_runs` 122 MB (deleted with its run by
  cascade) for 90 days. That is about 2,795 TTC alert polls and 715 Metrolinx
  polls a day, roughly 1 GB a year together if kept.
- PostgreSQL is 17.12, so `tstzmultirange` and `range_agg` are available.

### Why the range cannot simply widen

1. **Polling coverage expires.** `ReliabilityRepository.observationWindows`
   builds coverage from successful `alerts` and `metrolinx-alerts` runs (each
   success covers the next 10 minutes). `MaintenanceCleanupService` deleted
   runs older than 90 days (`linewatch.maintenance.cleanup.ingestion-run-retention`,
   default `P90D`), so the oldest run left is 2026-08-26 00:46 UTC. Alert
   history from 2026-06-20 (TTC) and 2026-07-31 (GO/UP) through 2026-08-25 has
   no polling evidence and cannot be counted. A0 stopped further loss.
2. **Schedule coverage expires with GTFS imports.** `serviceWindows` and
   `scheduleCoveragePercentage` derive each date's span from whichever retained
   import covers it. `MaintenanceCleanupStore.deleteOldInactiveGtfsImports`
   keeps one inactive TTC import, and
   `RegionalGtfsScheduleRepository.pruneInactiveImports` keeps one per source
   system after every regional import. Retained imports cover TTC from
   2026-11-01 to 2026-12-21, GO from 2026-11-17 to 2027-01-01 (re-imported on
   2026-11-22 and 2026-11-23) and UP from 2026-11-17 to 2027-05-16. On today's
   page TTC has 77.4% schedule-date coverage (Oct 25–31 missing) and GO/UP
   25.8%: the GO/UP "30 days" covers 8 days, at low confidence. Every new GO
   feed that starts later shrinks it again.
3. **Keeping imports is not the fix.** A TTC import is about 350 MB and a GO
   import about 150 MB, and GO republishes often (twice in two days here):
   tens of GB a year. Reliability needs only each line's span per date.
4. **Every request recomputes from raw rows.** `rawTtcEpisodes` and
   `regionalEpisodes` read the whole snapshot history (no lower bound) with
   correlated subqueries; Java then intersects episodes with polling and
   service windows. The transaction timeout is 15 s and the Redis TTL one
   minute (`reliability:lines:{network}`, `reliability:station:{network}:{station}`).
   That is adequate for 30 days, not for years times custom ranges times
   stations.

### Metrics

5. **The headline percentage saturates.** TTC, 30 days to 2026-11-24: Line 1
   reads 100.0% (28,219 of 28,219 observed service minutes) and Line 2 76.8%.
   Reduced Speed Zones are 91.4% of TTC incident-minutes (284,293). Six Line 1
   slow-zone alerts have been active since dates from 2026-07-20 to 2026-10-28.
   A line counts as affected when there is an alert anywhere on it, so one
   two-station slow zone makes the line 100%.
6. **Dimensions we store but do not show.** TTC alerts carry a GTFS-RT cause
   (distinct alerts per cause since June: `MEDICAL_EMERGENCY` 556,
   `POLICE_ACTIVITY` 477, `TECHNICAL_PROBLEM` 410, `OTHER_CAUSE` 315,
   `MAINTENANCE` 269, `ACCIDENT` 60, `CONSTRUCTION` 2). Every TTC alert has
   `alert_stations` rows (2,055 of 2,055); `alert_segments` is empty.
   `station_lines.sort_order` orders TTC stations and
   `RegionalNetworkCatalog.Route.stationIds` orders corridors.
7. **Impact kinds** (distinct alerts in snapshots): TTC delay 987, suspension
   914, planned-closure 184, reduced-speed-zone 80, limited-service 21; GO/UP
   delay 557, advisory 211 (snapshotted inactive, so excluded), planned-closure
   73, suspension 20.
8. **GO/UP trip updates are read but not recorded.**
   `MetrolinxTripUpdateSnapshots` holds one briefly cached GO and UP snapshot
   for train markers and arrivals, fetched on demand, so it is no continuous
   record and cannot support an on-time measure as it stands.

### Operations and frontend

9. **Backups.** `scripts/prod-backup-postgres.sh` runs before each deploy and
   keeps only the latest local dump (production VPS, Backups); `~/backups` on
   the VPS holds only CourtLens. TTC and Metrolinx do not republish past
   alerts, so once history is the product it is, with accounts, the data that
   cannot be rebuilt.
10. **Frontend owners.** `ReliabilityPanel.tsx` is the sidebar panel
    ("Observed Disruptions · Rolling 30 Day Basis"), fed by `dashboard-client.ts`
    (`/api/reliability/lines?network=`) with the fixture fallback
    `reliabilitySnapshot` in `linewatch-data.ts`. The methodology pages are
    `/ttc/reliability` and `/go-up/reliability` (`ReliabilityGuidePage`). No
    frontend caller of `/api/reliability/stations/{id}` was found. There is no
    chart library (runtime dependencies are `lucide-react`, `maplibre-gl`,
    `motion`, Next and React); the breakdown bar is hand-built.
11. **Tests today.** `ReliabilityIntervalCalculatorTest`,
    `ReliabilityControllerTest`, `ReliabilityServiceTest` (mocked repository)
    and `LimitedServiceReliabilityTest` in the backend;
    `reliability-time.test.mjs` and `dashboard-client.test.mjs` in the
    frontend. `ReliabilityRepository` has no database integration test of its
    own.

### Storage budget

Projected per year from the measurements above.

| Data | Grain | Per year |
| --- | --- | --- |
| Schedule days and service spans (line and station) | network × line × station × date | ~10 MB |
| Observation windows | merged intervals per day | < 1 MB |
| Alerts, snapshots, periods (already kept) | per change | ~25 MB |
| Episodes | per counted disruption | < 10 MB |
| Line and station daily facts | per day × class | ~50 MB |
| Raw ingestion runs at `P3650D` (A0, until A11) | per poll | ~1 GB |
| GO/UP trip observations (A10, if approved) | trip × day | ~100 MB |
| TTC delay log (A10, if approved) | per incident | < 10 MB |

Ten years of everything except raw runs is about 2 GB. Things that would
balloon, and are therefore ruled out: retaining GTFS imports for history (tens
of GB a year), storing raw provider payloads (also barred by the invariants),
storing vehicle positions (the TTC surface fleet every 30 s is millions of rows
a day, on the order of 100 GB a year) and per-poll trip-update snapshots. Rule:
derive at ingest into the coarsest grain the dashboard reads, and keep raw
evidence only for a bounded operational window.

## Decisions

Proposed in this plan; owner decisions are listed separately below.

- **Preserve, derive, serve.** Preserve the inputs reliability needs in compact
  form: schedule days, service spans and observation windows, with alerts and
  snapshots kept as today. Derive episodes and daily facts with a job. Serve
  every range from the derived tables. No request reads raw GTFS stop times or
  ingestion runs.
- **Toronto service dates are the unit.** Ranges are inclusive service dates.
  A span past midnight belongs to its service date. One line's daily spans are
  made disjoint when derived (a date's span starts no earlier than the previous
  date's end), so sums over days never double count.
- **Today stays live.** Completed days come from derived rows. The current
  service day is computed on request from raw rows bounded to that day, as now,
  and labelled "Today So Far". Active incidents come from current alerts.
- **Coverage stays honest at any range.** A day counts only with preserved
  polling coverage and a schedule day for the network (GO and UP both, for
  regional). Days missing either are excluded and drawn as gaps, never as zero
  disruption. Range confidence keeps today's rule over the whole range: the
  lower of polling and schedule-date coverage, high at 95% or more, medium at
  75% or more. A range that starts before a network's first analyzable date is
  clipped, and the response says so.
- **Counts come from episodes, minutes from days.** An incident spanning days
  counts once in a range (episodes overlapping it). Unique and weighted minutes
  are sums of daily facts. Medians and percentiles come from episodes.
- **Methodology version.** Derived rows carry `methodology_version`. A rule
  change builds the new version beside the old one from the preserved inputs,
  then switches reads in one step, so a page never mixes versions.
- **Existing endpoints stay.** `/api/reliability/lines` and
  `/api/reliability/stations/{id}` keep their shape and are served from the
  read model, so the panel, fixtures and any installed clients keep working.
  Their window becomes the last 30 service dates including today so far
  (previously `now − 30 days`); the panel label changes from "Rolling 30 Day
  Basis" to "Last 30 Days".
- **No chart dependency.** Charts are small SVG components on existing tokens,
  each with a data-table alternative.
- **Raw polling evidence** is kept for `P3650D` from A0 and lowered to a
  bounded audit window once A3 is verified (D7).
- **Cancellations, advisories and positions stay outside** reliability minutes
  and incidents, as the invariants require. Cancellations keep their own
  coverage-labelled series.

### Owner decisions

| ID | Decision | Recommendation |
| --- | --- | --- |
| D1 | Methodology v2 (A6): disruption classes and station-weighted impact as the headline, "Time With Any Alert" kept as a secondary column. Changes public claims. | Approve |
| D2 | Schedule backfill (A2) from archived TTC, GO and UP static GTFS. Without it, analyzable history starts 2026-11-01 (TTC) and 2026-11-17 (GO/UP); with it, 2026-08-26 for both, the polling-evidence limit. Needs a launch-gate entry. | Approve if archives cover the dates |
| D3 | Route: `/ttc/analytics` and `/go-up/analytics`, or a full-width shell panel. | Dedicated routes |
| D4 | Off-host backup target and encryption (A4), for example Cloudflare R2 or OCI Object Storage. | R2 with client-side encryption |
| D5 | GO/UP on-time performance (A10): scheduled trip-update polling under the Metrolinx agreement. | Approve after A7 |
| D6 | TTC delay log (A10): Open Data Toronto subway delay data under OGL–Toronto, for multi-year context. | Approve after A7 |
| D7 | Raw ingestion-run retention after A3. | `P400D` (a year of audit evidence, about 1 GB) |
| D8 | Edge caching of closed ranges (Caddy `s-maxage` with Cloudflare). | Optional; decide after A7 measurements |

## Phases

### A0 — Stop deleting polling evidence

**Done (2026-11-24),** with the owner's go-ahead.

- Appended `LINEWATCH_MAINTENANCE_INGESTION_RUN_RETENTION=P3650D` to the VPS
  `.env.production` (mode 600), with a comment naming this plan.
  `scripts/prod-compose.sh config` passed, and only the backend was recreated
  (`up -d --no-build --no-deps --wait --wait-timeout 240 backend`). It came up
  healthy at 05:20:00 UTC with the value in its environment. TTC and Metrolinx
  polls succeeded within 20 s, and `/api/reliability/lines` answered 200.
- The cascade keeps `metrolinx_ingestion_source_runs` too. Every
  `ingestion_runs` read is index-backed or time-bounded (`IngestionRunStore`,
  `RegionalIngestionRunStore`, `GtfsScheduleRefreshRunStore`,
  `TtcFeedAvailabilityService`'s 30-day window, `ReliabilityRepository`), so
  growth does not slow them. `retain-inactive-gtfs-imports` stays 1; after A1 it
  no longer affects reliability.
- Revert by deleting the two lines and recreating the backend the same way.

### A1 — Preserve schedule coverage

**Done in code (2026-11-24); not deployed.** The production check
below waits for the owner's deploy.

What changed:

- `V94__reliability_schedule_capture.sql` creates both tables as specified,
  except that `feed_version` is `text`, not `varchar(120)`: TTC's
  `source_version` is the CKAN URL plus a timestamp, about 170 characters.
  Check constraints limit `network_id`, `source_system` and `source_kind`. Two
  indexes, `(network_id, station_id, service_date)` and
  `(network_id, source_system, service_date)`, serve the reads and the per-date
  rewrite.
- `ReliabilityScheduleCapture` (package `reliability`) now holds all of
  reliability's schedule SQL. The span queries from `ttcServiceWindows`,
  `regionalServiceWindows`, `queryServiceWindows` and
  `scheduleCoveragePercentage` moved into it with their rules intact. They now
  take a target-date CTE and a station scope: whole line, one station, or
  each station, grouped through `gtfs_station_stops` for TTC and
  `regional_gtfs_departures.station_id` for regional.
  - `capture(source)` (TTC, GO or UP) runs under a per-source advisory
    transaction lock. Dates from yesterday (Toronto) onwards that a retained
    import covers are rewritten: the date's spans are deleted and reinserted,
    and its day is upserted with `import_id`, `feed_version`,
    `source_kind = 'import'`. Earlier dates are written only where no day row
    exists. That covers the first run, and it matches what the live fallback
    would read for such a date anyway. Days are never deleted, so a date stays
    covered after the import that held it is pruned. A covered date with no
    trips on a line gets a day and no span. GO and UP days are written
    separately.
  - Reads: `serviceSpans` returns captured spans for captured days and runs
    the live GTFS query only for (date, source) pairs with no captured day.
    Captured instants are returned in Toronto's offset, so both paths give
    equal values. `scheduleCoveragePercentage` counts a date when it has a
    captured day or a retained import covers it; for regional it takes the
    lower of GO and UP, as before.
- `ReliabilityRepository.serviceWindows` uses the capture class and still
  clips to the window. Response shapes and the coverage rule are unchanged.
- Triggers:
  - `GtfsScheduleImportWriter`, after `refreshPlannerStatistics`, inside the
    import transaction. If capture fails, the import rolls back and the active
    schedule stays.
  - `RegionalGtfsScheduleRepository.pruneInactiveImports` captures its source
    first. Both `replace` and `RegionalGtfsScheduleImportWriter` go through
    it, so nothing can prune without capturing, and this happens after
    activation in the same transaction.
  - Daily: `MaintenanceCleanupService.cleanup` captures TTC, GO and UP (each in
    its own transaction, failures logged) before
    `deleteOldInactiveGtfsImports`. If TTC capture fails, that deletion is
    skipped for the day; the rest of cleanup runs. Chosen over a separate
    `@Scheduled` because only the same method can guarantee that capture
    precedes the TTC delete. The daily run also picks up a deferred TTC
    activation (`GtfsScheduleActivationJob`), which changes the selection for
    dates already captured from yesterday onwards; the capture can lag that
    by up to a day, and the yesterday rewrite corrects it. It runs 10 minutes
    after start (`LINEWATCH_MAINTENANCE_CLEANUP_INITIAL_DELAY`), which is the
    first run on deploy. With `LINEWATCH_MAINTENANCE_CLEANUP_ENABLED=false`
    the daily capture stops too, but imports still capture. A5's derive job
    can take over the daily call.

Checks (2026-11-24, `mvn` in an rsync'd scratch copy):

- `ReliabilityScheduleCaptureIntegrationTest`, new, 5 cases against
  `127.0.0.1:5434/linewatch_test` (Flyway at 94, 0 skipped):
  - captured line and station spans equal the computed spans, and still do
    after the imports are deleted;
  - a later import leaves dates before yesterday unchanged;
  - a covered date with no trips writes a day and no span;
  - coverage from days equals coverage from imports across three ranges, and
    `ReliabilityRepository.aggregate` is equal before capture, after capture
    and after the imports are deleted (TTC, regional, one station);
  - capturing before a prune keeps the outgoing import's yesterday.

  Mutation checks: removing the freeze fails case 2; removing capture from
  `pruneInactiveImports` fails three cases.
- `RegionalGtfsScheduleImportIntegrationTest`: the zip-import (writer) case
  now asserts captured days per import (63 days, frozen before yesterday,
  newest import from yesterday on) and a calendar-removed date with no span.
  `MaintenanceCleanupServiceTest` covers capture before the TTC delete and the
  failure paths. `GtfsScheduleImportWriterTest` checks that capture follows
  `refreshPlannerStatistics` and is skipped when the import fails.
- Parity on real data, run once and not committed: HEAD's
  `ReliabilityRepository` against the new code on the dev database (TTC
  2026-11-01..12-21; GO 11-04..2027-01-01 and UP 10-30..2027-05-16 across two
  imports each). It ran in a rolled-back transaction with temp tables, so the
  dev schema is unchanged. Service windows for every TTC and regional station
  and whole line, schedule coverage and full aggregates agreed on all 555
  keys, both before and after capture, over three windows (the last 30 days,
  −10/+25 days, and 2026-10-20..2027-01-10). One aggregate moved by a minute
  between passes as the live dev backend polled. Capture of all three sources
  took about 0.5 s (TTC 51 days and 6,222 spans; GO 59 and 4,475; UP 199 and
  1,170).
- `mvn test` (full suite): 1,533 tests, 0 failures, 1 skipped
  (`MetrolinxDuplicateAuditTest`, opt-in). `BootRuntimeIntegrationTest` ran.

Production done check after deploy (read-only), once the first maintenance
run has passed (10 minutes after start):

```sql
select network_id, source_system, min(service_date), max(service_date),
       count(*) days, count(distinct import_id) imports
from reliability_schedule_days group by 1, 2 order by 1, 2;
-- expect ttc from 2026-11-01, go and up from 2026-11-17
select network_id, count(*) filter (where station_id = '') line_spans,
       count(*) filter (where station_id <> '') station_spans
from reliability_service_spans group by 1;
```

Then record `scheduleCoveragePercentage` from `/api/reliability/lines?network=regional`
daily. It must rise and must not drop at the first GO import whose feed starts
later; check that import.

Original plan:

Migration (V94 at the time of writing; recheck the next free number):

```sql
create table reliability_schedule_days (
    network_id varchar(16) not null,          -- ttc | regional
    source_system varchar(16) not null,       -- ttc | go | up
    service_date date not null,
    import_id bigint,                         -- no FK: imports are pruned
    feed_version varchar(120),
    source_kind varchar(16) not null,         -- import | archive (A2)
    captured_at timestamptz not null,
    primary key (network_id, source_system, service_date)
);

create table reliability_service_spans (
    network_id varchar(16) not null,
    line_id varchar(120) not null,
    station_id varchar(80) not null default '',   -- '' is the whole line
    service_date date not null,
    source_system varchar(16) not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    primary key (network_id, line_id, station_id, service_date),
    check (ends_at > starts_at)
);
```

- `ReliabilityScheduleCapture` (package `reliability`) runs the existing span
  queries, moved out of `ReliabilityRepository.ttcServiceWindows` and
  `regionalServiceWindows`, for line spans and per-station spans, and upserts
  days and spans. A date covered by an import with no trips on a line (a
  corridor without Sunday trains) writes the schedule day and no span. That
  line has zero scheduled minutes that day, which is not missing coverage.
- It runs after each successful TTC import (`GtfsScheduleImportWriter`, after
  the statistics refresh), after each regional import and before
  `pruneInactiveImports` (`RegionalGtfsScheduleRepository.replace`,
  `RegionalGtfsScheduleImportWriter`), and daily from the derive job.
- It writes dates from yesterday through the import's end. Dates before
  yesterday are frozen and never rewritten by a later import, so a replacement
  feed's calendar cannot rewrite history. The only writer of older dates is the
  A2 backfill, and only where no row exists.
- The per-date selection rule is unchanged: the import `selected_imports`
  picks (active first, then newest).
- The first run captures every date the retained imports cover: TTC from
  2026-11-01, GO and UP from 2026-11-17.
- `ReliabilityRepository` reads spans and schedule coverage from these tables
  and falls back to live GTFS only for dates not captured. A11 removes the
  fallback.

Tests, as integration tests against the local PostGIS test database on 5434:

- Captured line and station spans equal today's `serviceWindows` output for
  the same dates.
- A later import covering a past date leaves that date unchanged.
- A no-service date writes a day without a span.
- Coverage from schedule days equals `scheduleCoveragePercentage` for retained
  dates.
- Capturing before a prune keeps the outgoing import's yesterday.

Done when production has days and spans from 2026-11-01 (TTC) and 2026-11-17
(GO and UP). GO/UP 30-day schedule coverage must rise daily and must not drop
at the next GO import that starts later. Check the first such import.

### A2 — Backfill schedule history (D2)

- **Feeds needed:** TTC versions covering 2026-08-26 to 2026-10-31, and GO
  and UP versions covering 2026-08-26 to 2026-11-16. Both are needed for
  regional coverage. Earlier dates have no polling evidence and cannot count
  anyway.
- **Candidate archives:** the Mobility Database entry for the City's TTC feed
  ([mdb-732](https://mobilitydatabase.org/feeds/gtfs/mdb-732)) and Transitland's
  TTC archive ([f-dpz8-ttc](https://transit.land/feeds/f-dpz8-ttc)). GO and UP
  archives are still to be located. Where versions overlap, use the one
  published most recently before each date, which is what LineWatchTO would
  have imported then.
- **Runner:** a property-enabled backend runner (`ReliabilityScheduleBackfillRunner`,
  modelled on `GtfsScheduleImportRunner`) imports an archived zip through the
  normal bounded-memory importer as an inactive import. It captures spans only
  for dates with no row, then deletes the import. Archived feeds end before
  today, so `coversToday` and the activation job never activate them, and
  arrivals are unaffected.
- **Provenance:** rows get `source_kind = 'archive'` and the feed version. The
  archive URL and SHA-256 go in the launch-gate entry, which records archived
  copies of the same City and Metrolinx open-data feeds, read once, never
  served, with only derived spans kept.
- **Tests:** the runner on a fixture zip writes spans only for dates without
  rows, overwrites nothing, removes its import and never activates.
- **Done** when the coverage calendar shows TTC and GO/UP schedule days from
  2026-08-26.

### A3 — Preserve polling coverage

**Done in code (2026-11-24); not deployed.** The production check
below waits for the owner's deploy.

What changed:

- `V95__reliability_observation_windows.sql` creates the table as specified,
  with check constraints on `network_id` and `observed_minutes` (0 to 1,500).
  The primary key serves the reads (network, date range); no other index.
- `ReliabilityObservationRollup` (package `reliability`) now holds all of
  reliability's polling-coverage SQL. The raw rule moved from
  `ReliabilityRepository.observationWindows` intact (`rawWindows`: successful
  `alerts` or `metrolinx-alerts` runs, each covering `completed_at` to +10
  minutes, read from 10 minutes before the window, clipped and merged).
  - `rollUp(network)` writes one date per statement: `range_agg` of the runs'
    windows from 10 minutes before the date's start, intersected with the
    date's Toronto bounds (`date::timestamp at time zone 'America/Toronto'`,
    so 23 or 25 hours on DST days), upserted on the primary key. A date with
    no runs gets an empty multirange and 0 minutes. `observed_minutes` floors
    each window to whole seconds and rounds the sum, as
    `ReliabilityIntervalCalculator.minutes` does.
  - A row is **final** once `rolled_up_at` is at least 10 minutes after its
    date ended (run completions are written from the clock as polls finish;
    the margin covers their commit). Final rows are never rewritten: the
    roll-up skips them and the upsert refuses them. Today's row, and
    yesterday's until 00:10, are rewritten on every run.
  - Reads: `observationWindows` takes final rows for the window's dates
    (`unnest` of `covered` intersected with the window, read back with
    `lower`/`upper`) and raw runs bounded to every other date, one query per
    run of consecutive such dates. The pieces are merged with no gap, so
    windows split at midnight join back and every minute count and
    intersection runs over the same merged ranges as before.
- **Decision: which days come from where.** Completed dates with a final row
  come from the roll-up. Today, and any date without a final row (not yet
  rolled up, or rolled up before it ended), come from raw runs bounded to that
  date. The original plan below said raw runs are no longer read, while
  "Today stays live" computes today from raw rows; this follows the latter and
  is A1's fallback pattern, so raw runs go unread only for completed,
  rolled-up dates. A11 removes the fallback.
- **Rounding.** Coverage percentage, cancellation tracking minutes and every
  intersection use the merged windows, never per-day `observed_minutes`.
  Per-day minutes are rounded, so their sum can differ from the merged total
  by up to about a minute per day. A5 must sum seconds from `covered`, not
  `observed_minutes`.
- **Trigger.** `ReliabilityObservationRollupJob`, its own `@Scheduled`
  (initial delay `PT2M`, fixed delay `PT15M`; properties
  `linewatch.reliability.observation-rollup.{enabled,initial-delay,fixed-delay}`,
  env `LINEWATCH_RELIABILITY_OBSERVATION_ROLLUP_*`). Each run rolls up every
  date without a final row from the Toronto date of the first retained
  successful run (`min(completed_at)`, served by
  `idx_ingestion_runs_type_status_completed`) through today. On a normal run
  that is today and, until it is final, yesterday. On the first run after
  deploy it is the backfill (in production from 2026-08-26, about 91 dates per
  network), and after downtime it is the dates missed. Chosen over a
  property-enabled one-time runner: there is nothing to enable and later
  disable, rerunning is safe, it catches up after downtime, and each statement
  is bounded to one day of runs. Failures are logged per network and retried
  on the next run. With `enabled=false` nothing is preserved, but reads stay
  correct through the raw fallback.
- **Retention constraint (for D7 and A11).** Raw runs must be kept for every
  date without a final row, plus the 10 minutes before today's start (today's
  first windows come from yesterday's last polls). `MaintenanceCleanupService`
  does not consult the roll-up before deleting runs. At `P3650D` that does not
  matter; before D7 lowers retention, either add that guard or gate the change
  on the done check below.
- `ReliabilityRepository` takes the roll-up in its constructor and delegates
  `observationWindows` to it. `aggregate` and `regionalCancellations` are
  otherwise unchanged, and so are response shapes.

Checks (2026-11-24, `mvn` in an rsync'd scratch copy):

- `ReliabilityObservationRollupTest`, new, 4 unit cases: a 23:55 poll covers
  both dates and their per-date parts merge back to the unsplit window (18
  minutes); a gap of 11 minutes stays split while touching windows merge;
  Toronto dates are 24, 25 and 24 hours around 2026-11-01 and 23 hours on
  2026-03-08; a window splits at Toronto midnights and ends at its `until`.
- `ReliabilityObservationRollupIntegrationTest`, new, 5 cases against
  `127.0.0.1:5434/linewatch_test` (Flyway at 95, 0 skipped). The fixture has
  TTC polls every 127.123457 s and GO/UP every 11 min 0.4 s with a retry 0.9 s
  later, a 25-minute gap, a last poll at 23:55 before a day-long outage, and
  failed and unfinished runs:
  - each of 32 rows per network equals `rawWindows` for its date, ranges and
    minutes; the outage date holds exactly 00:00–00:05; `observationWindows`
    equals `rawWindows` over six windows (30 days, across the outage, three
    minutes, across the DST date, a whole day, part-day to now);
  - DST dates roll up to 1,380 (2026-03-08) and 1,500 (2026-11-01) minutes,
    and a date with no runs has an empty row;
  - a second roll-up rewrites only today and changes nothing; final rows stay
    after their raw runs are deleted;
  - a date rolled up at 00:05 the next day is read raw (including a poll the
    roll-up missed) until rolled up at 00:10 or later, then matches raw;
  - `ReliabilityRepository.aggregate` (TTC and GO/UP, whole network, one
    station each, 30 days and part-day bounds, with delays crossing midnight,
    on the DST date and one still active) is equal before roll-up, after a
    roll-up taken before the afternoon's polls (today's row is partial and
    ignored), and after deleting every raw run before today's start minus 10
    minutes.

  Mutation checks, each failing the test class: reads accepting non-final rows
  (2 cases fail), no 10-minute lookback in the roll-up (4), reads ignoring the
  roll-up (1), no finality margin (1), and rounding without flooring each
  window to seconds (1; it survived until the GO/UP retry polls were added).
- `ReliabilityScheduleCaptureIntegrationTest` (A1) now clears the new table and
  builds the repository with the roll-up; `LimitedService*` tests pass the new
  constructor argument.
- Parity on real data, run once and not committed: the pre-A3
  `ReliabilityRepository` (A1 code, renamed) against the new code on the dev
  database (runs from 2026-08-26 06:01 UTC, 303,594 alert and Metrolinx runs),
  in one rolled-back transaction with a temp `reliability_observation_windows`,
  so the dev schema is unchanged (still V94). 379 keys per pass: 190
  observation-window lists (both networks over the last 30 days, all retained
  history, a 7-day window with odd bounds, the DST weekend and each of the 91
  dates) and 189 aggregates (both networks over four windows, and 109 TTC and
  72 GO/UP stations over 30 days). Before roll-up, old and new agreed on all
  379; after roll-up, all 379 again, back to back; after deleting all 303,594
  raw runs before today's start minus 10 minutes, the new code agreed with
  itself before deletion on all 379. The roll-up of 91 dates per network took
  0.22 s. The done check below, run in the same transaction, found 90 final
  days per network and 0 mismatched (TTC 107,935 minutes, GO/UP 109,410) in
  1.2 s. A 30-day page's polling-coverage read is now one roll-up query plus
  one raw query for today.
- `mvn test` (full suite): 1,542 tests, 0 failures, 1 skipped
  (`MetrolinxDuplicateAuditTest`, opt-in). `BootRuntimeIntegrationTest` ran.

Production done check after deploy (read-only), once the first roll-up has run
(2 minutes after start). It recomputes each day's minutes from raw runs with
a gaps-and-islands merge (the SQL form of `ReliabilityIntervalCalculator.merge`),
independent of the roll-up's `range_agg`:

```sql
-- Plan 17 A3 done check (read-only). Per Toronto date from 2026-08-26 to yesterday: the
-- roll-up's observed minutes against minutes recomputed from raw runs by a gaps-and-islands
-- merge (the SQL form of ReliabilityIntervalCalculator.merge, independent of range_agg).
with networks(network_id, run_type) as (values ('ttc', 'alerts'), ('regional', 'metrolinx-alerts')),
days as (
    select n.network_id, n.run_type, d::date observation_date,
           d::date::timestamp at time zone 'America/Toronto' day_start,
           (d::date + 1)::timestamp at time zone 'America/Toronto' day_end
    from networks n,
         generate_series(date '2026-08-26', (now() at time zone 'America/Toronto')::date - 1, interval '1 day') d
),
windows as (
    select d.network_id, d.observation_date,
           greatest(r.completed_at, d.day_start) s,
           least(r.completed_at + interval '10 minutes', d.day_end) e
    from days d
    join ingestion_runs r
      on r.run_type = d.run_type and r.status = 'success' and r.completed_at is not null
     and r.completed_at >= d.day_start - interval '10 minutes' and r.completed_at < d.day_end
),
marked as (
    select *, case when s > max(e) over (partition by network_id, observation_date order by s, e
                                         rows between unbounded preceding and 1 preceding)
                   then 1 else 0 end new_island
    from windows where e > s
),
islands as (
    select network_id, observation_date, min(s) s, max(e) e
    from (select *, sum(new_island) over (partition by network_id, observation_date order by s, e
                                          rows unbounded preceding) island
          from marked) x
    group by network_id, observation_date, island
),
raw as (
    select network_id, observation_date,
           round(sum(floor(extract(epoch from e - s))) / 60.0)::integer raw_minutes
    from islands group by 1, 2
),
compared as (
    select d.network_id, d.observation_date, coalesce(raw.raw_minutes, 0) raw_minutes,
           rolled.observed_minutes rolled_minutes,
           rolled.rolled_up_at >= d.day_end + interval '10 minutes' final
    from days d
    left join raw using (network_id, observation_date)
    left join reliability_observation_windows rolled using (network_id, observation_date)
)
select network_id, min(observation_date) first_date, max(observation_date) last_date, count(*) days,
       count(*) filter (where final) final_days,
       count(*) filter (where rolled_minutes is distinct from raw_minutes) mismatched_days,
       sum(raw_minutes) raw_minutes, sum(rolled_minutes) rolled_minutes
from compared group by 1 order by 1;
-- expect final_days = days and mismatched_days = 0 for both networks. To list mismatches,
-- end with: select * from compared where rolled_minutes is distinct from raw_minutes or not final;
```

Expect, for both networks, `first_date` 2026-08-26, `final_days = days` and
`mismatched_days = 0`. Run it again on a later day, and on the A4 restored
copy, before D7.

Original plan:

```sql
create table reliability_observation_windows (
    network_id varchar(16) not null,
    observation_date date not null,           -- Toronto calendar date
    covered tstzmultirange not null,
    observed_minutes integer not null,
    rolled_up_at timestamptz not null,
    primary key (network_id, observation_date)
);
```

- `ReliabilityObservationRollup` applies the existing rule (each successful
  run covers 10 minutes after completion, merged) and clips the result to each
  Toronto calendar date. A run completing at 23:55 contributes to two dates.
  The date is only a partition key; intersection with service spans is by time.
- It runs every 15 minutes for today and yesterday (an idempotent upsert),
  and once as a backfill from 2026-08-26.
- `observationWindows` reads the multiranges for the range, and raw runs are
  no longer read by reliability.

Tests:

- Unit: merging across midnight, and a gap longer than 10 minutes.
- Integration: the roll-up equals `observationWindows` for fixture runs, and
  it is idempotent.

Done when observed minutes from the roll-up equal the raw computation for every
day from 2026-08-26 to the run date, checked by a read-only production query
and on the A4 restored copy. D7 then applies.

### A4 — Off-host backups and a restore drill (D4)

**Done in code (2026-11-24); not installed or drilled.** D4: R2 with
client-side `age` encryption. Owner setup, install and the drill are in
[production VPS, Backups](../production-vps.md#backups).

What changed:

- `scripts/prod-backup-offsite.sh`: `pg_dump -Fc` in the container's `/tmp`
  with `--exclude-table-data=public.<pattern>` for the five patterns (22
  tables on production, listed in production VPS). The archive is read back in
  full, its table list is checked against the live schema, it is streamed through
  `age -R` (only ciphertext on the host), uploaded with `rclone`, verified by
  listing and size, and then pruned. Every failure path removes temporary
  files and deletes nothing off-host.
- Owner decision (2026-11-24): `raw_payload` columns on alerts,
  accessibility_outages, surface_service_notices and ttc_announcements (TTC
  open data, about 17 MB) stay in the copy, encrypted. So the plan's "no provider
  payload leaves the host" now reads: no raw source-record table and no
  Metrolinx payload leaves the host.
- Retention is selected by the script (newest per day, ISO week and month that
  has copies), not by lifecycle rules. Production VPS records why.
- Staleness: a textfile metric (`linewatch_offsite_backup_last_success_timestamp_seconds`)
  read by Alloy's unix exporter (`textfile` block in `config.alloy`), plus the
  rule "Off-host backup stale" (over 36 h, or no data) in `linewatch-alerts.json`.
- `infra/systemd/linewatch-offsite-backup.{service,timer}`: oneshot as
  `ubuntu`, 07:15 UTC, `Persistent=true`.
- Docs: production VPS (Backups, and the "only the latest local dump"
  sentence), script inventory, observability, operations guide.

Checks (2026-11-24):

- `scripts/tests/prod-backup-offsite.test.sh`, new, 14 cases with stubbed
  docker, age and rclone: the exact exclusion flags, and the patterns resolving
  to exactly the 22 production tables and no kept table; a TOC check that
  rejects raw-record data, missing data, a pattern that matches nothing and a
  missing core table; encryption and container cleanup before upload, with no
  plaintext left; retention across the 2026-W53/New Year boundary, 420 nightly
  copies keeping 30, and gaps; and failed dump, check, encryption, upload,
  unlisted upload and prune each keeping the previous copies. A mutation
  check (dropping an exclusion, skipping upload verification, uploading before
  container cleanup, no weekly tier) fails the suite.
- Rehearsal: the script ran against the local dev database (PostgreSQL 18,
  Flyway 94) with real `pg_dump`/`pg_restore` and stand-ins for age and
  rclone. The dump was 13 MB in 1.5 s and the container copy was removed.
  `pg_restore --exit-on-error` into a throwaway `postgis/postgis:18-3.6`
  succeeded, with no invalid constraints and the excluded tables empty. The A1
  done check on the restored copy matched the source row for row.
- Alloy v1.17.0: `alloy fmt` accepts the config, and a probe container
  exported the metric from `/host/root/var/lib/linewatch/textfile-metrics`.
  `grafana-apply-alerts.mjs --dry-run` builds the rule; the rule test asserts
  no-data alerting. `systemd-analyze verify` passes, apart from the VPS-only
  script path.
- Read-only on production: PostgreSQL 17.12, PostGIS 3.6.4, 134 GB free;
  `age` 1.1.1 and `rclone` 1.60.1 are installable from apt; Alloy runs as root.
  V94/V95 are not deployed yet, so production has no `reliability_*` tables.
  The table-list check includes them automatically once they exist.

Remaining: owner setup and the first real upload, then the drill (A1 and A3
done checks on the restored copy; A5 parity once A5 lands). Record its result
here.

**Production setup & restore drill (2026-11-24):**

- Cloudflare R2 bucket `linewatchto-backups` (`ENAM`), bucket-scoped RW token on VPS (`~/.config/linewatch/offsite-backup.env`, mode 600) and RO restore token off-host (`~/.config/linewatch/offsite-restore.env`), off-host `age` key generated locally (only public key on VPS).
- Alloy recreated (`v1.17.0`), systemd timer installed and enabled (`07:15 UTC` daily), first copy uploaded and verified: `linewatch-postgres-20261124T190858Z.dump.age`, **17,384,589 bytes (16.6 MB)** (projected 34-copy full retention ~0.55 GB, <6% of R2's 10 GB free tier; added Grafana rule `linewatch-offsite-backup-storage-high` warning at 7.5 GB).
- **Restore drill:** downloaded with RO token, decrypted off-host, restored into throwaway `postgis/postgis:17-3.6` (`pg_restore` 11 s, total drill 114 s including live TTC/GO/UP schedule re-import with deployed commit `83812000`). Excluded schedule & raw-record tables all 0 rows; A1 check matched production row-for-row (`ttc` 51 days, `go` 46, `up` 181); A3 check reported **90/90 final days and 0 mismatched days** on both networks (`ttc` 129,281, `regional` 129,599); `/api/health/reliability` `status: "ok"` v2 and `/api/reliability/availability` clean. Throwaway containers and decrypted dumps deleted.
- Grafana Cloud: `node scripts/grafana-apply-alerts.mjs` applied 14 rules to `LineWatchTO/linewatch`.
- D7: lowered production `LINEWATCH_MAINTENANCE_INGESTION_RUN_RETENTION` from `P3650D` to `P400D` and recreated `backend` healthy (`status: "ok"`, v2).

Original plan:

- A nightly host timer, independent of the application, runs a new
  `scripts/prod-backup-offsite.sh`. It does `pg_dump -Fc` with
  `--exclude-table-data` for re-importable schedule tables (`gtfs_*`,
  `ttc_surface_*`, `regional_gtfs_*`) and for raw provider records
  (`ttc_alert_source_records`, `metrolinx_*_source_records`), so no provider
  payload leaves the host.
- The dump still holds accounts (emails, password hashes, push subscription
  keys). It is encrypted on the host to a public key (for example `age`)
  before upload, and the private key never lives on the VPS.
- Retention is 14 daily, 8 weekly and 12 monthly copies, enforced by the
  script or by bucket lifecycle rules.
- An alert fires when the newest off-host copy is older than 36 hours, through
  whichever mechanism [observability](../observability.md) supports.
- **Restore drill:** restore the latest copy into a scratch local PostGIS,
  re-import schedules, and run the A5 parity check on it. Document the restore
  in production VPS, Backups.
- **Tests:** script tests in the style of `scripts/tests/prod-release-tools.test.sh`
  (excluded tables, encryption step, retention selection, failure keeps the
  previous copy).

### A5 — Derived read model, methodology v1

**Done in code (2026-11-24); not deployed.** Production rebuild
and A4 restored-copy parity wait for deploy and A4 owner setup.

What changed:

- `V96__reliability_derived_read_model.sql` creates `reliability_episodes`
  (with `alert_id varchar(180)` to match `regional_alert_snapshots`, GiST index
  on `counted`, btree on `(methodology_version, network_id, line_id, opened_at)`
  and GIN on `station_ids`), `reliability_line_days`, `reliability_station_days`,
  `reliability_derivations` (including internal `last_error`, never exposed in
  public health) and `reliability_methodology` (seeded at version 1).
- `ReliabilityEpisodeSource` now owns all TTC and regional episode extraction,
  lifecycle stitching (`LIFECYCLE_STITCH_GAP = 5 min`), closure period
  resolution and disjoint service-span splitting (`disjointSpans`,
  `splitByServiceDate`). Reads are bounded to the window plus alerts active at
  its start and alerts with overlapping closure periods (eliminating
  full-history snapshot scans). Also fixed a regional station-filter bug found
  during real-data parity: filtering `regional_alert_snapshots` by `station_id`
  inside the lifecycle CTE dropped `active = false` snapshots when `station_ids`
  changed before clearing (e.g. `regional-go-522175-st` at `union`), leaving a
  zombie open alert; the full alert lifecycle is now read first and filtered by
  `station_id` after.
- `ReliabilityScheduleCapture` gained `capturedAllSpans`, `completeScheduleDays`
  and `firstCompleteScheduleDate` (requiring TTC for `ttc`, and both GO and UP
  for `regional`). `ReliabilityObservationRollup` gained `firstObservedDate`.
- `ReliabilityDerivationService` derives episodes and daily line/station rows
  under a per-network advisory transaction lock (`pg_advisory_xact_lock`),
  chunked by 31 days. Re-deriving a trailing window preserves earlier `counted`
  intervals on multi-day episodes (`(existing.counted - stripRange) + newCounted`)
  and strips/deletes obsolete closure occurrences. `rebuildAndSwitch(version)`
  builds the target version for every analyzable date through yesterday,
  switches `reliability_methodology` in one transaction, deletes obsolete
  versions' rows after the switch, and evicts the dashboard cache.
- `ReliabilityDerivationJob` (`linewatch.reliability.derivation.*`, enabled by
  default) runs nightly at `04:30` America/Toronto (capturing schedules,
  rolling up observations and re-deriving the trailing 14 days) plus a
  lightweight startup/catch-up check when `derived_through` is behind.
  `ReliabilityRebuildRunner` (`linewatch.reliability.rebuild.enabled=false`,
  `target-version=1`) provides the property-triggered full rebuild.
- `ReliabilityRepository.aggregateServiceDates` serves completed derived days
  from `reliability_line_days`/`reliability_station_days` and
  `reliability_episodes` combined with a bounded live tail for today (and
  yesterday before `04:30` Toronto so late-night past-midnight service is
  seamless), deduplicating episodes spanning derived days and today by
  `episode_key`, and summing polling coverage from `covered` multiranges rather
  than rounded daily `observed_minutes`. Falls back to `aggregate` only when
  `derived_through` is null.
- `ReliabilityService` switches `/api/reliability/lines` and
  `/api/reliability/stations/{id}` to the last 30 Toronto service dates
  including today so far (`today - 29 .. today`), keeping response DTO shapes
  unchanged. `ReliabilityPanel.tsx` updates its headers from "Rolling 30 Day
  Basis" to "Last 30 Days" (and `reliability-query-safety.test.mjs` now points
  at `ReliabilityScheduleCapture.java` where A1 moved the materialized CTE).
- `ReliabilityHealthController` (`GET /api/health/reliability`) exposes
  allowlisted derivation health fields only (`status`, `methodologyVersion`,
  `switchedAt`, `derivationEnabled`, per-network `state`, `lastRunStatus`,
  `derivedThrough`, timestamps, `lastDurationMs`, `consecutiveFailures`), never
  `last_error`.

Checks (2026-11-24):

- Unit: `ReliabilityEpisodeSourceTest` (4 cases: disjoint spans, swallowed
  spans, past-midnight vs multi-day splitting, multirange/JSON formatting),
  `ReliabilityHealthControllerTest` (3 cases: allowlisted JSON without error
  fields, 05:30 staleness cutoff, failing/pending/disabled states), updated
  `ReliabilityServiceTest` (4) and `LimitedServiceReliabilityTest` (1).
- Integration against `127.0.0.1:5434/linewatch_test` (Flyway at 96):
  `ReliabilityDerivationIntegrationTest` (8 cases: episode across midnight +
  overlapping spans without double counting, 14-day late clear preserving
  earlier `counted` ranges, revised closure period removing/updating episodes,
  live today slice + spanning-episode deduplication, atomic v1→v2 rebuild and
  switch, TTC/regional station days + interchange/branch station parity +
  outage gap exclusion, 01:00 AM late-night live tail, regional `station_ids`
  change before clear), plus `LimitedServicePersistenceIntegrationTest`,
  `ReliabilityScheduleCaptureIntegrationTest` and
  `ReliabilityObservationRollupIntegrationTest`.
- Real-data parity and budgets on a scratch clone (`linewatch_a5_parity`,
  dropped after) of the local dev DB (247,938 TTC runs, 54,055 Metrolinx runs,
  4,186 TTC snapshots, 2,038 regional snapshots; schedule tables empty as in an
  A4 restore, relying on `reliability_schedule_days`/`reliability_service_spans`):
  - Full v1 rebuild (`2026-11-01..11-23` TTC, `2026-11-04..11-23` regional):
    **354 ms** total (TTC 251 ms: 189 episodes, 205 line days, 2,802 station
    days; regional 88 ms: 36 episodes, 120 line days, 975 station days; budget
    < 5 min).
  - Single network-day derive (`2026-11-23`): TTC **41 ms**, regional **23 ms**
    (budget < 2 s).
  - Uncached `/lines` p95 (25 runs each): TTC **48.0 ms** (p50 37.9 ms),
    regional **42.1 ms** (p50 38.9 ms; budget < 200 ms).
  - Parity sweep across all 23 TTC dates (`11-01..11-23`), all 20 regional dates
    (`11-04..11-23`), live 30-day windows and 10 TTC/regional stations: 100%
    exact match on every incident count, every median and every live active
    count. Recorded boundary effects: (1) summing integer-rounded daily minutes
    vs rounding raw seconds once over 20–23 days differs by ±1–3 min out of
    8,000–15,000 min (~0.01%); (2) under the service-date model, UP's
    `2026-11-03` post-midnight tail (88 min after 00:00 on `11-04`) belongs to
    `11-03` rather than `11-04` (exact match when `since` starts at `11-04`'s
    span); (3) historical `endOfD` probe on two TTC planned closures whose
    parent alert left the feed before their period ended (`active` is live-only
    in serving).
- Full suites: `mvn -f backend/pom.xml test` passed (1,557 tests, 0 failures,
  0 errors, 1 opt-in skipped; `BootRuntimeIntegrationTest` ran); frontend
  `test:fast`, `typecheck` and `lint` passed (0 errors).

Original plan:

Version 1 is today's rules exactly, so its output can be compared with the
current calculator.

```sql
create table reliability_episodes (
    id bigserial primary key,
    methodology_version integer not null,
    network_id varchar(16) not null,
    episode_key varchar(240) not null,        -- alert id + occurrence start
    alert_id varchar(120) not null,
    line_id varchar(120) not null,
    impact_kind varchar(40) not null,
    cause varchar(40),
    station_ids jsonb not null default '[]'::jsonb,
    opened_at timestamptz not null,
    closed_at timestamptz,
    counted tstzmultirange not null,          -- ∩ polling ∩ service spans
    counted_minutes integer not null,
    completed boolean not null,
    unique (methodology_version, network_id, episode_key)
);
-- plus a GiST index on counted and (methodology_version, network_id, line_id, opened_at)

create table reliability_line_days (
    methodology_version integer not null,
    network_id varchar(16) not null,
    line_id varchar(120) not null,
    service_date date not null,
    impact_group varchar(40) not null,        -- 'all' or an impact kind
    scheduled_minutes integer not null,
    observed_minutes integer not null,        -- span ∩ polling
    impacted_minutes integer not null,        -- unique
    incident_minutes integer not null,        -- additive
    derived_at timestamptz not null,
    primary key (methodology_version, network_id, line_id, service_date, impact_group)
);

-- reliability_station_days: the same, keyed by station_id as well
-- reliability_derivations: per version and network, derived_through, status,
--   last success and failure times (no error text in public health)
-- reliability_methodology: the current version read by the API
```

**ReliabilityDerivationJob.** It holds an advisory lock so only one instance
runs, and has its own enable flag.

- Nightly at 04:30 Toronto, after service ends, it finalizes yesterday and
  re-derives the last 14 days. That catches late clears and revised closure
  periods, since `alert_active_periods` are replaced on update. It also
  captures schedule days (A1) and observation windows (A3).
- Reads are bounded to the window plus the alerts active at its start (the
  latest snapshot before the window is active). Full-history scans end.

**Episode extraction.** `ttcEpisodes`, `regionalEpisodes` and the
lifecycle-stitching move into one source class, using
`ReliabilityIntervalCalculator` unchanged. A counted range is split at
disjoint service-date spans for the daily rows.

**Rebuild.** A property-triggered runner builds version N for every day since
the network's first analyzable date. It then switches
`reliability_methodology` in one transaction and deletes the old version's
rows after the switch.

**Serving.** `/lines` and `/stations/{id}` combine derived days with the live
today slice, keep their response shape and use the 30-service-date window.

**Parity.** On the A4 restored copy, for each service date D since the first
analyzable date, the v1 tables over D−29..D must equal
`ReliabilityRepository.aggregate` with `since` = the start of D−29's span and
`until` = the end of D. Minutes, incident counts and medians must match. Record
any difference and resolve it as a bug or a documented boundary effect before
switching the endpoints.

**Budgets** on the VPS:

- One network-day derives in under 2 s.
- A full v1 rebuild from 2026-08-26 takes under 5 minutes.
- `/lines` uncached p95 is under 200 ms.
- The derivation state appears in the reliability health response
  (allowlisted fields).

**Tests:**

- Unit: day splitting and disjoint spans.
- Integration fixtures: an episode across midnight counted once with its
  minutes split; a late clear re-derived; a closure period revised within 14
  days; the today slice; an atomic version switch; station days; parity with
  `aggregate` on fixture data.

### A6 — Methodology v2: classes and station-weighted impact (D1)

**Done in code (2026-11-24); not deployed.** D1 approved by owner. Production v2 rebuild waits for deploy.

What changed:

- `V97__reliability_methodology_v2.sql` adds `disruption_class`, `planned` and `station_share` (0..1) to `reliability_episodes`, and `weighted_impacted_minutes` (`double precision`) to `reliability_line_days` and `reliability_station_days`. `reliability_methodology.current_version` is left untouched by Flyway so existing v1 deployments stay on v1 while v2 is built beside it and switched atomically.
- `AlertCategoryLabels` owns disruption class mapping and Title Case labels: `service-stopped` ("Service Stopped": `suspension`, `closure`, `planned-closure`), `delay` ("Delays": `delay`, `limited-service`), and `slow-zone` ("Slow Zones": `reduced-speed-zone`), plus `isPlannedImpactKind` (`planned-closure`).
- `ReliabilityIntervalCalculator.weightedMinutes` integrates instantaneous affected station share via a sweep-line over elementary intervals: at each instant, active partial alerts union their scheduled affected stations (`|union| / scheduledStationCount`), and any active whole-line alert (empty `station_ids`) yields share `1.0`.
- `ReliabilityDerivationService` computes `disruption_class`, `planned`, `station_share`, daily `weighted_impacted_minutes`, and `class:service-stopped` / `class:delay` / `class:slow-zone` rows (prefixed `class:` to avoid colliding with raw `impact_kind = 'delay'`) for `version >= 2`, while preserving v1 derivation behavior for `version == 1`. `ReliabilityScheduleCapture.allSpans` provides combined line + station spans for live-tail and fallback weighting. `ReliabilityRebuildRunner` and `application.yml` default `target-version` to `2`, and `ReliabilityDerivationJob.catchUpIfBehind` initializes fresh never-derived deployments straight onto v2 via `rebuildAndSwitch(2)`.
- `ReliabilityResponses`, `ReliabilityRepository` and `ReliabilityService` add additive v2 fields (`methodologyVersion`, per-line `weightedImpactMinutes`, `weightedImpactPercentage`, and `classes[]` with `uniqueMinutes`, `weightedMinutes`, `weightedSharePercentage`, `incidents`, `activeIncidents`, `incidentDisruptionMinutes`) while keeping every existing `/api/reliability/lines` and `/api/reliability/stations/{id}` field intact.
- `ReliabilityPanel.tsx` and `linewatch-data.ts` render station-weighted disruption class shares as the headline per line (hiding zero Slow Zones on GO/UP), **Service-Stopped Hours** (`uniqueMinutes` of `service-stopped`), and **Time With Any Alert** as a secondary continuity column, with a v1 payload fallback.
- Docs and copy updated: `ReliabilityGuidePage` and `/ttc/reliability` + `/go-up/reliability` metadata (service-date windows, disruption classes, station weighting, methodology versioning), `ReliabilityService` v2 preamble, `README.md` ("What has happened over time?"), `docs/feature-reference.md` (reliability, cancellations, caching), and `docs/domain-invariants.md` (Reliability section).

Before and after (v1 vs v2) for the last 30 service dates (`2026-10-26..2026-11-24`, measured on a scratch clone `linewatch_a6_compare` of the local dev DB, dropped after; TTC 63.6% polling / 80.0% schedule-date coverage; regional 64.0% polling / 70.0% minimum GO/UP schedule-date coverage):

| Line / Corridor | Incidents | Observed | v1 Headline (Time With Any Alert) | v2 Weighted All | v2 Service Stopped | v2 Stopped Hours | v2 Delays | v2 Slow Zones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Line 1 Yonge-University | 87 | 15,116 m | 100.0% | 44.3% | 1.6% | 1,078 m | 1.0% | 42.5% |
| Line 2 Bloor-Danforth | 66 | 14,765 m | 94.7% | 12.0% | 5.4% | 4,747 m | 0.1% | 8.1% |
| Line 4 Sheppard | 2 | 15,089 m | 0.1% | 0.0% | 0.0% | 0 m | 0.0% | 0.0% |
| Line 5 Eglinton Crosstown | 28 | 14,725 m | 3.8% | 0.9% | 0.3% | 178 m | 0.5% | 0.0% |
| Line 6 Finch West | 6 | 15,143 m | 1.1% | 0.6% | 0.4% | 128 m | 0.2% | 0.0% |
| Barrie | 6 | 8,612 m | 10.1% | 1.9% | 0.1% | 8 m | 1.8% | 0.0% |
| Kitchener | 9 | 10,370 m | 20.7% | 5.1% | 3.7% | 1,155 m | 1.4% | 0.0% |
| Lakeshore East | 4 | 9,198 m | 1.3% | 0.3% | 0.0% | 0 m | 0.3% | 0.0% |
| Lakeshore West | 12 | 11,275 m | 99.2% | 13.0% | 0.0% | 0 m | 13.0% | 0.0% |
| Milton | 1 | 5,352 m | 0.2% | 0.0% | 0.0% | 0 m | 0.0% | 0.0% |
| Richmond Hill | 0 | 5,254 m | 0.0% | 0.0% | 0.0% | 0 m | 0.0% | 0.0% |
| Stouffville | 2 | 7,442 m | 2.2% | 0.4% | 0.0% | 0 m | 0.4% | 0.0% |
| UP Express | 2 | 10,010 m | 11.5% | 11.5% | 11.5% | 1,152 m | 0.0% | 0.0% |

Scratch clone budgets: full v2 rebuild took **245 ms** (TTC 174 ms: 189 episodes, 314 line days, 3,713 station days; regional 63 ms: 36 episodes, 152 line days, 1,049 station days); uncached v2 `/lines` p95 (25 runs each): TTC **41.8 ms** (p50 38.7 ms), regional **40.9 ms** (p50 37.9 ms).

Checks (2026-11-24):

- Unit: `ReliabilityIntervalCalculatorTest` (+3 cases: overlapping station-set union, whole-line alert overriding partial overlap, `AlertCategoryLabels` disruption class & planned mapping), `ReliabilityServiceTest` (+1 case: v2 response classes, labels and preamble).
- Integration against `127.0.0.1:5434/linewatch_test` (Flyway at 97): `ReliabilityDerivationIntegrationTest` (+2 cases: overlapping station-set union + slow zones excluded from Service Stopped + planned flag; whole-line regional alert + interchange counted per line with distinct denominators + opening-date denominator change + v1→v2 atomic rebuild and switch).
- Frontend: `npm --prefix frontend run test:fast` (including updated `reliability-panel.test.mjs`), `run typecheck` and `run lint` passed (0 errors).

Original plan:

**Disruption classes**, from impact kinds, labelled through
`AlertCategoryLabels`:

- Service Stopped: `suspension`, `closure`, and `planned-closure` within its
  applicable window, as today.
- Delays: `delay`, `limited-service`.
- Slow Zones: `reduced-speed-zone`.
- Each episode is also flagged planned (`planned-closure`) or unplanned.
- GO/UP advisories stay excluded, and cancellations stay separate.

**Station-weighted impact.**

- An episode's affected stations are its `alert_stations` on that line (TTC)
  or its `station_ids` (GO/UP); an alert without stations covers the whole
  line.
- The denominator is the line's stations with scheduled service that date
  (station spans from A1), so stations that open or close change it
  correctly.
- At each instant, a class's weighted impact is the share of stations in the
  union of that class's counted episodes. "All" uses the union across
  classes.
- Weighted minutes integrate that share over observed service. An
  interchange station counts on each of its lines.
- Track length from PostGIS geometry would be more exact, but riders reason
  in stations. Revisit only if station spacing visibly skews results.

**Headline per line:** Service Stopped, Delay and Slow Zone shares (each
station-weighted), with Service-Stopped Hours as unique minutes of that class.
"Time With Any Alert", today's metric renamed, stays as a secondary column for
continuity.

**Migration:**

- Episodes gain `disruption_class`, `planned` and `station_share`.
- Day tables gain `disruption_class` groups and `weighted_impacted_minutes`.
- v2 is built beside v1 and switched.
- Record the v1 and v2 numbers for the 30 days to the switch date here, as
  the before and after.

**Docs and copy:**

- `ReliabilityGuidePage` methodology copy and its metadata, which say
  "30-day".
- The panel copy and the `ReliabilityService` preamble.
- The README "What has happened over time?" row.
- Feature reference lines on reliability, cancellations and caching.
- The domain invariants Reliability section, which gains the class,
  weighting, coverage-gap, frozen-span and methodology-version rules.

**Tests:** overlapping station sets union; a whole-line alert; an interchange
counted per line; slow zones never in Service Stopped; the denominator change
on an opening date; the v2 build and switch.

### A7 — Range API

**Done in code (2026-11-24); not deployed.** D8 (edge caching) stays open: the new paths carry no `Cache-Control` and are not in the Cloudflare or Caddy cache rules yet.

What changed:

- `ReliabilityRangeController` serves `/api/reliability/{availability,summary,series,patterns,hotspots,episodes,export}` beside the unchanged `/lines` and `/stations/{id}`. `ReliabilityRangeRequest` validates before any cache or database read: `network` is `ttc` (default) or `regional`, dates parse strictly as `uuuu-MM-dd`, `from` ≤ `to` ≤ today (Toronto), ids are lower-case `[a-z0-9_-]` up to 80 characters, `limit` is bounded, `granularity` is `day|week|month` with at most 400 buckets, and episode cursors are opaque and checked. Errors are `{error, message}` (`invalid_date`, `invalid_range`, `invalid_line`, `invalid_station`, `too_many_buckets`, `invalid_cursor`, `export_too_large`, `rate_limited`, …).
- `ReliabilityRangeService` resolves the range (clipping `from` to `firstAnalyzableDate` and reporting `clipped` and `clipReason`; a range wholly before history is empty with "Not enough history for this range"), checks that the line is on the network and the station on the network (and on the line), then:
  - **summary** reuses `ReliabilityRepository.aggregateServiceDates`, so its line rows equal `/lines` for the same dates, and adds P90 time to clear, network totals with per-class metrics, a kind breakdown, a TTC cause breakdown, filtered GO/UP cancellations, per-station rows when `line` is set, and the previous equal-length period when it starts on or after the first analyzable date (otherwise `previousUnavailableReason`). Coverage is per calendar date over the range: polling minutes over day minutes (today up to now) and the share of dates with a published schedule (`ReliabilityScheduleCapture.scheduledDates`, the per-date form of `scheduleCoveragePercentage`).
  - **series**, **patterns**, **hotspots**, **episodes** and **export** read `reliability_line_days`, `reliability_station_days` and `reliability_episodes` through `ReliabilityRangeRepository`, plus a live slice for the dates after `derived_through` (at most yesterday and today, as `/lines` does). The slice comes from `ReliabilityDerivationService.computeLiveSlice`: `deriveChunkInTransaction` is split into `computeChunk` (no writes; an optional cap ends spans, polling and episodes at now) and its persist step, so Today So Far uses the derive job's own rules. Episodes merge by `episode_key`, so one spanning the derived days and today counts once.
  - Series buckets carry their own coverage and have null values when no day in them is analyzable. Patterns are Toronto hour-of-week line-minutes (observed, any alert, per class) over the range's counted days. Hotspots rank (line, station) pairs by weighted minutes or incidents, optionally on one `class`; this was added after the dev-data check below, where long-running Line 1 slow zones put every Line 1 station near 100%. Episode titles are the alert's latest snapshot title at the episode's end, falling back to "Line 1 Delay" style labels as Alert History does; no description text is returned. Export pivots each line (or station) day into one CSV row with class minutes and a `today_so_far` flag, quotes per RFC 4180, prefixes formula-leading cells with an apostrophe, caps at 20,000 rows, and is sent as an attachment with `Cache-Control: no-store`.
- `ReliabilityRepository` carries each counted episode's cause into `ReliabilityAggregation.episodes()` (`EpisodeOutcome`), so the range summary can compute percentiles, totals and causes without a second read. Existing constructors and `/lines` fields are unchanged.
- Caching: keys are `reliability:v{version}:{endpoint}:{network}:{from}:{to}:{line}:{station}:{params}`. Ranges reaching yesterday or today use the dashboard prefix and its one-minute TTL, which ingestion success evicts. Ranges ending earlier, and `availability` (15 minutes), use `DashboardCacheService.getOrComputeClosedReliability` under `linewatch:reliability-closed:v1:{network}:` with a six-hour TTL; ingestion never evicts that prefix, each network's incremental derive or `deriveRange` evicts that network's keys, and `rebuildAndSwitch` evicts all of them. Redis failures fall back to computing.
- Rate limits: `ReliabilityRangeRateLimiter` (fixed windows per client address via `ClientAddressResolver`, like `FeedbackRateLimiter`) allows 120 range computations (cache misses) and 10 exports per 10 minutes by default (`linewatch.reliability.range.rate-limit.*`, `LINEWATCH_RELIABILITY_RANGE_*`). Exports are never cached.

Measured on a scratch clone `linewatch_a7_compare` of the local dev database (migrated to V97 there, v2 rebuilt in 404 ms, dropped after), uncached, 15 runs after a warm-up, in-process (no HTTP or Redis):

| Endpoint | TTC p50 / p95 | GO/UP p50 / p95 |
| --- | --- | --- |
| `/lines` (reference) | 71.8 / 91.0 ms | 54.2 / 65.1 ms |
| availability | 22.7 / 26.1 ms | 20.9 / 24.5 ms |
| summary, last 30 days | 93.9 / 103.6 ms | 83.0 / 130.1 ms |
| summary, all history | 91.9 / 114.2 ms | 90.2 / 100.9 ms |
| summary, closed range | 45.9 / 48.4 ms | 50.0 / 55.4 ms |
| summary by station, one line, 30 days | 161.0 / 181.5 ms | 119.8 / 162.6 ms |
| series, day, 30 days | 82.0 / 90.6 ms | 79.3 / 95.8 ms |
| series, week, all history | 79.1 / 87.6 ms | 70.6 / 89.6 ms |
| patterns, all history | 74.2 / 79.6 ms | 72.3 / 96.5 ms |
| hotspots, all history | 81.4 / 88.7 ms | 60.1 / 66.9 ms |
| episodes, first page, all history | 71.5 / 76.6 ms | 56.4 / 58.1 ms |
| export, all history | 69.5 / 77.0 ms | 54.5 / 58.5 ms |

Every endpoint is under the 200 ms budget with 24 (TTC) and 21 (GO/UP) days of history. The range summary's 13 line and corridor rows matched `/lines` exactly (incidents, observed minutes, Time With Any Alert and weighted share). D8 can be decided from these numbers and production's after deploy; closed ranges are already cached for six hours at the origin.

Checks (2026-11-24):

- Unit: `ReliabilityRangeRequestTest` (strict dates including Feb 30 and a leap day, range order and today bound, networks, ids, limits, Monday weeks and month buckets, the 400-bucket cap, CSV quoting and formula guard, cursor round trip and tampering, median and P90, cause labels, hour-of-week cells including the repeated hour on 2026-11-01), `DashboardCacheServiceTest` (+1: closed ranges sit outside the dashboard prefix and are evicted per network).
- Controller: `ReliabilityRangeControllerTest` (400s in the error shape before any cache read, closed vs open cache routing and key format, CSV headers, export and computation rate limits returning 429).
- Integration against `127.0.0.1:5434/linewatch_test`: `ReliabilityRangeIntegrationTest` (10 cases over a v2 derive plus today's live slice: clipping, a schedule gap day, `/lines` parity, the previous period, series sums equal to the summary, weekly buckets, station rows, hotspots with and without a class, paging with titles, station-filtered episodes, hour-of-week cells, line and station CSV, the availability calendar, and refused scopes). It removes its fixtures after each test, because the A5 integration tests extract every alert in their window.
- `mvn -f backend/pom.xml test`: 1,589 tests, 0 failures, 1 skipped (`MetrolinxDuplicateAuditTest`, opt-in).

Original plan:

Every endpoint is a GET taking `network=ttc|regional`, `from` and `to` as
`YYYY-MM-DD` Toronto service dates (inclusive), and optional `line` and
`station`.

| Endpoint | Returns |
| --- | --- |
| `/api/reliability/availability` | First analyzable date per network; per-day coverage calendar (polling %, schedule day, today flag); current methodology version; sources. Cached 15 min. |
| `/api/reliability/summary` | Requested and effective (clipped) range; coverage and confidence; per line, or per station when `line` is set: class shares, unique and weighted minutes, incident counts, median and P90 time to clear, active now; breakdown by kind and, for TTC, by cause; GO/UP cancellations with their own coverage; the previous equal-length period when fully analyzable, otherwise null with a reason. |
| `/api/reliability/series` | `granularity=day\|week\|month` (weeks start Monday); each bucket carries its own coverage; at most 400 buckets, otherwise 400. |
| `/api/reliability/patterns` | Hour-of-week (7 × 24) minutes per class from counted ranges. |
| `/api/reliability/hotspots` | Stations ranked by weighted minutes and incident counts; 20 by default, at most 100. |
| `/api/reliability/episodes` | Cursor pages of at most 100: line, class, kind, cause, normalized title as Alert History shows it, stations, opened, closed, counted minutes. No provider body text. |
| `/api/reliability/export` | CSV of line days (station days with `station`) for the range, with a row cap and `Content-Disposition`. |

**Validation:**

- Dates parse strictly, `from` must not be after `to`, and `to` must not be
  after today.
- `from` is clipped to the first analyzable date, and the response reports
  the clip.
- An unknown line, or a station not on the network, is a 400 in the existing
  error shape.
- Caps follow backend AGENTS (input caps, rate limits).

**Caching:**

- Keys are `reliability:v{version}:{endpoint}:{network}:{from}:{to}:{line}:{station}:{params}`.
- Ranges ending before yesterday get a 6 h TTL, and the network's
  closed-range keys are evicted after each nightly derive. Ranges reaching
  yesterday or today keep the one-minute TTL.
- Ingestion success keeps evicting only today's keys. A Redis outage falls
  back to computing from the derived tables.

**Rate limits:** a per-client limiter on `export` and uncached custom ranges,
following `FeedbackRateLimiter`. D8 is decided after measuring.

**Tests:**

- Controller: validation, clipping, caps, CSV headers and escaping.
- Repository integration per endpoint over fixture days.
- `/lines` and `/stations/{id}` response compatibility.

### A8 — Analytics page (D3)

**Done in code (2026-11-24); not deployed.** Built on D3's recommendation, dedicated routes.

What changed:

- `/ttc/analytics` and `/go-up/analytics` are prerendered pages in the guide shell (`analytics-page.tsx`), with metadata and sitemap entries. They hold no readings: `components/analytics/AnalyticsDashboard.tsx` reads `availability` and `summary` in the browser (`hooks/useReliabilityAnalytics.ts`). `next.config.ts` gives both `max-age=0, must-revalidate` in place of the guides' day at the edge, because the page is nothing without its build's scripts.
- `app/reliability-range.ts` owns presets, clipping, date text and the URL (`range`, `from`, `to`, `line`, `station`, `compare`). Presets resolve against the server's today and first analyzable date. Unknown values fall back to the default, a station needs its line, and the network switch keeps the range and comparison only. From and To always show the dates read; editing one makes the range custom.
- `app/reliability-analytics.ts` owns the KPIs, previous-period changes, empty states, coverage segments and table order. Change is shown while Compare is on, and where coverage differs by 10 points or more the page says to compare shares rather than counts and hours.
- The coverage strip draws the requested range: counted, partly observed (polling under 95%), excluded, before history and Today So Far. List Gaps names the dates.
- States: skeletons of the same dimensions; "Not enough history for this range" (also when no service in it was covered) apart from "No disruptions observed in this range"; partial coverage; a derive job behind the live slice; offline, rate limited and unavailable. A failed range never shows another range's numbers. Offline keeps the loaded numbers and says when they loaded.
- Demo numbers appear only behind "View Demo Data" during an outage, labelled in the heading and a banner. They are never an automatic fallback.
- Links: the panel ("Open Analytics"), both methodology pages, the guide header and footer, and an "Analytics by Date Range" row in the mobile More sheet. `DesktopNavRail`'s entry still opens the panel, which holds the link: the rail has no free slot and replacing the entry would orphan the 30-day panel.
- The service worker needed no change; tests now pin that analytics reads are never cached and that the page offline gets the offline page.

Checks (2026-11-24):

- `reliability-range.test.mjs` and `reliability-analytics.test.mjs`; the service worker, sitemap and CSS inventory tests extended. `test:fast` and typecheck pass and lint has no errors.
- `reliability-analytics.spec.ts` (in `test:e2e`) and `transit-guides.spec.ts` pass on desktop-chrome and mobile-chromium against a production build: both networks, clipping, both empty states, dates, keyboard sorting, offline, outage and demo, rate limit, and overflow at 360, 639, 641, 767, 768, 959, 961 and 1440 px in dark, light and high contrast.
- Viewed on the dev backend's derived data (TTC from Nov 1, GO/UP from Nov 4, with the real Nov 17–22 gap).

Original plan:

- **Route:** `/ttc/analytics` and `/go-up/analytics`, server pages with
  metadata and a client dashboard. Link them from the Reliability Analytics
  panel ("Open Analytics"), the methodology pages and the navigation entries
  that open Reliability today (`DesktopNavRail`, `MobileMoreSheet`). Switching
  network keeps the range.
- **URL state:** `?range=30d|90d|6m|ytd|12m|all|custom&from=&to=&line=&station=&compare=1`.
  Presets resolve to service dates on the client against the server's first
  analyzable date. The default is 30d.
- **Layout:**
  - A controls bar: presets as a segmented control, date inputs bounded by
    the first analyzable date and today, line and station selects, and a
    Compare toggle.
  - A coverage strip that marks excluded days and states "History Starts
    {date}".
  - KPI tiles: Service-Stopped Hours, Delay Incidents, Median Time to Clear,
    Line Share Affected, Coverage and Confidence. Each shows the previous
    period's change when available.
  - A sortable per-line table with authored line badges.
- **States:**
  - Loading keeps stable dimensions.
  - Empty separates "No disruptions observed in this range" from "Not enough
    history for this range".
  - A partial-coverage banner.
  - Offline shows a message; API responses are never cached by the service
    worker.
  - Fixture or demo mode is labelled "Demo Data".
- **Panel:** `ReliabilityPanel` stays the compact 30-day summary, on v2
  metrics, with the link.
- **Service worker:** confirm `sw.js` never caches `/api/reliability/*`, and
  that the page route follows the existing page policy.
- **Tests:**
  - `test:fast`: range resolution (each preset, clipping, YTD on Jan 1, DST
    change dates, a leap day) and the URL round trip.
  - A smoke spec on both networks, desktop and phone, with routed API
    fixtures, a clipped range and offline.
  - Responsive checks at 360, 767, 768 and 1440 px, high contrast, Reduced
    Motion and keyboard operation.

### A9 — Charts, drill-down and export

**Done in code (2026-11-24); not deployed.** Production check waits for deploy.

What changed:

- **Additive A7 range API extensions** (`ReliabilityRangeController`, `ReliabilityRangeService`, `ReliabilityRangeRepository`, `ReliabilityRangeResponses`), preserving existing fields, validation, cache keys when new params are omitted, rate limits and `{error, message}` errors:
  - **Summary time-to-clear distribution:** `summary` now returns `durations` (`all`, `unplanned`, `planned` cleared count, median and P90, plus 7 inclusive duration bins from `< 15 min` to `12+ hr`), computed in memory from the summary's already-fetched episodes with zero extra requests or queries.
  - **Drill-down filters and sorting on `/api/reliability/episodes`:** added optional validated `class`, `kind`, `cause`, `planned`, `completed`, `minMinutes`, `maxMinutes`, `dayOfWeek` (1–7 Toronto), `hour` (0–23 Toronto) and `sort=recent|longest` (`longest` sorts by counted minutes desc, then `openedAt` asc), plus `totalCount`, `sort` and `alertId` on responses and sort-matched cursors. Every new parameter is included in cache keys.
  - **Per-line series in one request:** `/api/reliability/series` gained optional `byLine=true` (when not station-scoped), populating `buckets[].lines[]` from already-loaded `lineDays` so the all-lines Calendar renders in one request instead of one per line.
  - **Independent GO/UP cancellation trend:** added `GET /api/reliability/cancellations` (`day|week|month`, 400-bucket cap, closed-range 6 h / open-range 1 min caching, same per-client rate limiter) backed by `regional_train_cancellations` and `regional_train_cancellation_tracking`, carrying its own per-bucket tracking coverage (`null` counts when untracked, never mixed into reliability minutes).
- **Shared SVG primitives** in `frontend/src/components/analytics/` with no chart dependency: `ChartFrame` (lazy loading via `IntersectionObserver`, `Show Table` / `Show Chart` toggle, live keyboard/pointer readout, skeleton/error/empty states), `StackedBarChart`, `RankedBarChart`, `HeatmapChart`, `HistogramChart` and `CalendarChart`. Every chart has an accessible name, focusable marks (`tabIndex=0`, Enter/Space activation), non-color encoding (SVG hatch/stripe/dot patterns, proportional inner markers, dashed `Today So Far` borders, hatched `null` coverage gaps never drawn as zero), local `.chartScroll` scrolling on phones, light/dark/high-contrast tokens in `analytics.module.css` and static behavior under `prefers-reduced-motion`.
- **All ten A9 modules** wired in `AnalyticsDashboard.tsx` with lazy loading (`useAnalyticsResource.ts`), strict key matching so one range's numbers never appear under another's dates, and opt-in demo generators in `reliability-analytics-fixture.ts`:
  1. **Trend** (`TrendModule`): stacked by class, `Day`/`Week`/`Month` granularity and `Minutes`/`Share %` toggles, hatched gaps, `Today So Far`, clicking drills down Episodes to that bucket's dates.
  2. **Breakdown** (`BreakdownModule`): by kind and (TTC) by Title Case GTFS-RT cause from `summary`, drilling down Episodes to `epKind`/`epCause`.
  3. **When** (`WhenModule`): lazy 7×24 Toronto hour-of-week heatmap with class filter, drilling down to `epDow`/`epHour`.
  4. **Where** (`WhereModule`): lazy station hotspots list defaulting TTC to `Service Stopped` (with class and minutes/incidents toggles) so Line 1 slow zones do not bury closures; drills down to `epLine`/`epStation`/`epClass`.
  5. **How Long** (`HowLongModule`): time-to-clear histogram split into Unplanned (solid) and Planned (hatched) with Median and P90 stats from `summary.durations`; drills down to `epPlanned`/`epCompleted`/`epMin`/`epMax`.
  6. **TTC Slow Zones** (`SlowZonesModule`, TTC only): active slow zones per day (honestly backed by `series` `classes[slow-zone].incidents`) plus longest-running slow zones (`episodes?class=slow-zone&sort=longest`).
  7. **GO & UP Train Cancellations** (`CancellationsModule`, regional only): lazy corridor-stacked trend with independent tracking coverage and hatched untracked gaps.
  8. **Daily Calendar** (`CalendarModule`): lazy per-line daily impact calendar in one request (`series?granularity=day&byLine=true`, capped at the last 366 days when a range exceeds a year), distinguishing coverage gaps, no-service days and `Today So Far`.
  9. **Counted Episodes** (`EpisodesModule`): lazy (or immediate when URL drill-down params are present), URL-persisted drill-down chips (`epFrom`, `epTo`, `epLine`, `epStation`, `epClass`, `epKind`, `epCause`, `epPlanned`, `epCompleted`, `epMin`, `epMax`, `epDow`, `epHour`, `epSort`) with remove/clear controls, `Newest First`/`Longest Counted` sort and cursor `Load More`.
  10. **CSV Export** (`ExportControl`): direct `/api/reliability/export` link whose click handler downloads the attachment and surfaces 429 rate limits (10 exports / 10 min) and the 20,000-row cap visibly in an inline alert.

Deviations and deferred items:

- **Alert History link omitted on historical episodes:** `/api/alert-history` only accepts `today`/`7d`/`30d` presets, `LineWatchShell` has no direct URL deep link to one historical alert, and active dashboard alert IDs use kind-prefixed formats (`reduced-speed-zone-<alertId>`). Rather than show a link that does not open the alert, episode rows show no Alert History link (while `EpisodeItem` exposes `alertId` for a future dedicated deep link).
- **Drawing hotspots on the System Maps** remains out of scope for plan 17 (belongs to the shared map overlay layer).

Checks (2026-11-24):

- Backend (scratch copy, PostGIS test DB on 5434): extended `ReliabilityRangeRequestTest` (13), `ReliabilityRangeControllerTest` (5) and `ReliabilityRangeIntegrationTest` (11); full `mvn test` passed: 1,593 tests, 0 failures, 0 errors, 1 opt-in skipped (`BootRuntimeIntegrationTest` ran).
- Frontend: extended `reliability-range.test.mjs`, `reliability-analytics.test.mjs`, added `reliability-charts.test.mjs`; `test:fast`, `typecheck` and `lint` passed (0 errors, 0 new warnings).
- Production build + Playwright (scratch copy, desktop-chrome and mobile-chromium): `reliability-analytics.spec.ts` (including chart mark → episode drill-down on both networks, `Show Table`, network-specific Slow Zones / Cancellations modules, CSV export 429 and 20,000-row cap, and overflow across 360–1440 px in dark, light and high contrast) and `transit-guides.spec.ts` passed (45 passed, 0 failed, 3 mobile-width-setting skipped).
- Visually inspected both TTC and GO/UP at 360, 767, 768 and 1440 px with zero horizontal overflow.

Original plan:

Shared SVG primitives live in `src/components/analytics/`: a bar and stacked-bar
series, a heatmap grid, a calendar strip, a histogram and a ranked bar list.

- Each has an accessible name and a "Show Table" alternative.
- Marks are focusable, with tooltips for keyboard and pointer.
- Colours come from tokens for light, dark and high contrast, and meaning is
  never carried by colour alone.
- Nothing animates under Reduced Motion.
- Long day series scroll inside the chart on phones, never the page.

Modules:

1. **Trend:** minutes by class per day, week or month, with coverage gaps
   hatched.
2. **Breakdown:** by kind and, for TTC, by cause, with Title Case cause labels
   from the GTFS-RT enum (Medical Emergency, Police Activity, Technical
   Problem).
3. **When:** an hour-of-week heatmap.
4. **Where:** a station hotspot list. Drawing hotspots on the System Maps
   belongs to the shared overlay layer and both maps
   ([map renderer parity](../map-renderer-parity.md)), so it is a follow-up
   rather than part of this plan.
5. **How long:** a time-to-clear histogram with median and P90, split into
   planned and unplanned.
6. **Slow Zones (TTC):** active zones per day and the longest-running zones.
7. **Cancellations (GO/UP):** a trend by corridor with its own coverage.
8. **Calendar:** a per-line year view of daily impact.
9. **Episode list:** filtered from any chart mark, linking to Alert History
   where the alert exists.
10. **Export:** CSV for the current filters.

Tests: primitive rendering and table alternatives in `test:fast`; the smoke
spec drives one filter from a chart mark to the episode list on each network.

### A10 — New sources, each gated separately

**Done in code (2026-11-24); D5, D6, and TTC performance history approved by owner.** Launch-gate entries added to [source launch gates](../source-licensing-launch-gates.md).

What changed:

- `V98__reliability_a10_sources.sql` creates `regional_scheduled_trip_counts`, `regional_trip_observations`, `ttc_official_delay_imports`, `ttc_official_delay_incidents`, and `ttc_performance_readings`.
- **D5 (GO/UP on-time performance):** `ReliabilityScheduleCapture` preserves daily scheduled trip counts per corridor; `GoTripUpdateFeed` captures cancelled trip IDs alongside running stop-time predictions; `RegionalTripObservationService` & `RegionalTripObservationPollingJob` (`LINEWATCH_RELIABILITY_REGIONAL_OTP_ENABLED`, default `false`) derive one upserted row per trip-day using Metrolinx's published 5-minute terminal arrival definition with honest observed/scheduled coverage; served at `GET /api/reliability/on-time` and rendered by `OnTimePerformanceModule` on `/go-up/analytics`.
- **D6 (TTC Delay Log):** `TtcOfficialDelayLogService` & `TtcOfficialDelayLogRefreshJob` (`LINEWATCH_RELIABILITY_TTC_DELAY_LOG_ENABLED`, default `false`) stream Open Data Toronto's `TTC Subway Delay Data since 2025.csv` and `Code Descriptions.csv` (OGL–Toronto) in 1,000-row batches; served at `GET /api/reliability/ttc-delay-log` with publication period and rendered by `TtcDelayLogModule` on `/ttc/analytics`, never merged into observed minutes.
- **Official TTC Performance History:** `TtcPerformanceHistoryRepository` persists each fresh `TtcPerformanceService` snapshot reading (`TTC.ca`); served at `GET /api/reliability/ttc-performance` and rendered by `TtcPerformanceHistoryModule` on `/ttc/analytics`.
- **A2 (Schedule backfill, D2):** `ReliabilityScheduleCapture.captureArchiveForImport`, `GtfsScheduleImportService.importZipForArchiveBackfill`, `RegionalGtfsScheduleImportService.importZipForArchiveBackfill`, and `ReliabilityScheduleBackfillRunner` (`LINEWATCH_RELIABILITY_SCHEDULE_BACKFILL_*`) import archived GTFS zips as temporary inactive imports, capture only missing dates (`source_kind = 'archive'`), and immediately delete the temporary import without activating.
- **D8 (Closed-range edge caching):** `ReliabilityRangeController` emits `Cache-Control: public, max-age=300, s-maxage=21600, stale-while-revalidate=3600` on closed ranges, `public, max-age=15, s-maxage=30, stale-while-revalidate=30` on open ranges, `public, max-age=60, s-maxage=900, stale-while-revalidate=300` on `/availability`, `public, max-age=300, s-maxage=3600, stale-while-revalidate=600` on daily context sources, and `no-store` on `/export` and errors. Cloudflare Cache Rule 3 (`ebe34059b28b4cd683cad60858a796a6`, `bypass_by_default`) updated to include all read-only range endpoints (excluding `/export`).

Original plan:

Each needs its own launch-gate entry, the owner's go-ahead and an A7 endpoint
of its own. None feeds LineWatchTO-observed minutes.

- **GO/UP on-time performance (D5).**
  - Poll GO and UP trip updates on a schedule (interval to be decided, for
    example 60 s) through `MetrolinxTripUpdateSnapshots` and the existing
    fetcher retries.
  - Derive at ingest into `regional_trip_observations`, one upserted row per
    trip-day: service date, trip, trip number, line, first and last seen,
    latest delay at the last observed stop, terminal arrival delay when
    observed, observed stop count, cancelled.
  - On-time uses Metrolinx's published definition, confirmed before building.
  - Coverage is the share of scheduled trips observed. An unobserved trip is
    unknown, never on time.
  - Estimated train markers stay schematic, and their claims are unchanged.
- **TTC delay log (D6).** Open Data Toronto publishes the TTC's subway delay
  data with a lag: incident-level date, time, station, code, minutes of delay,
  minutes of gap, bound and line, back several years. Import it into
  `ttc_official_delay_incidents` and show it as its own labelled series, "TTC
  Delay Log", with its publication period. It is never merged into observed
  minutes. It gives multi-year context.
- **Official TTC performance history.** Store each `TtcPerformanceService`
  reading in `ttc_performance_readings` so it can be charted over time. The
  source and terms are unchanged (TTC website monitoring); the owner confirms
  the stored history.

### A11 — Close

**Deployed & verified (2026-11-24, `83812000e06db083a052f0cca85d8223f5732622`, `Deploy Production` run `45464002811`).** Remaining production operations: A4 off-host backup setup/upload/restore drill (blocked on R2 enablement in the Cloudflare dashboard and off-host `age` key creation), Grafana alert rule apply (after first verified off-host backup so the no-data backup alert does not fire), and D7 retention lowering (`P3650D` → `P400D`, after repeating the A3 check on the A4 restored copy).

Production verification (2026-11-24 18:53–18:58 UTC, read-only):

- **CI & deploy:** PR #31 passed `CI/Backend` (1m26s) and `CI/Frontend` (26m58s, including `test:analytics` on `desktop-chrome` and `mobile-chromium`); `main` CI run `45458970697` passed and published ARM64 images; `Deploy Production` run `45464002811` deployed `83812000` with pre-deploy backup and passing `smoke-deploy.mjs`.
- **Cloudflare WAF:** Extended `Block Non-Read Methods on Public APIs` (zone `linewatchto.ca`, rule `3e77e955cc3f4f1daf1b49acf58fdb34`, version 3) to `starts_with(http.request.uri.path, "/api/reliability/")`. Verified `POST` returns `403` on both `linewatchto.ca` and `api.linewatchto.ca`.
- **Migrations:** Flyway V94–V97 applied cleanly (`2026-11-24 18:53:02 UTC`).
- **A1 check:** `reliability_schedule_days` has TTC `2026-11-01..2026-12-21` (51 days), GO `2026-11-17..2027-01-01` (46 days), UP `2026-11-17..2027-05-16` (181 days); `reliability_service_spans` has TTC 255 line / 5,967 station spans, regional 473 line / 4,158 station spans.
- **A3 check:** `reliability_observation_windows` for `2026-08-26..2026-11-23` has 90/90 final days and **0 mismatched days** on both networks (`ttc`: 129,281 raw = 129,281 rolled minutes; `regional`: 129,599 raw = 129,599 rolled minutes).
- **A5/A6 derivation & metrics:** Fresh startup catch-up built methodology v2 and switched at `2026-11-24T18:56:12Z` (TTC 828 ms: 322 episodes, 476 line days, 5,421 station days; regional 103 ms: 29 episodes, 88 line days, 615 station days). `/api/health/reliability` reports `status: "ok"`, `methodologyVersion: 2`, `derivedThrough: "2026-11-23"`, 0 failures. Prometheus gauges (`linewatch_reliability_derivation_*`, `linewatch_reliability_methodology_version`) report `0.0` failures, `0.0` stale, `0.828` s duration, version `2.0`.
- **A7/A8/A9 live endpoints:** `/ttc/analytics` and `/go-up/analytics` return `200`; `/api/reliability/{availability,lines,summary,series,patterns,hotspots,episodes,cancellations,export}` all return `200` in 74–208 ms (`firstAnalyzableDate` `2026-11-01` TTC / `2026-11-17` regional; regional `scheduleCoveragePercentage: 26.7` baseline for tracking the next GO import).

What changed:

- **Retention guard & D7 policy:** `MaintenanceCleanupProperties` keeps its `P90D` code default. `MaintenanceCleanupStore.deleteOldIngestionRuns` now preserves successful `alerts` and `metrolinx-alerts` runs until every Toronto calendar date touched by their 10-minute observation window (`completed_at` through `completed_at + 10 min - 1 us`) has a final row in `reliability_observation_windows`. Non-alert runs and failed alert runs prune normally while keeping the latest run per type. Production's `.env.production` remains at `P3650D` until plan 17 deploys and the A3 production done check passes; [production VPS, Reliability analytics](../production-vps.md#reliability-analytics) documents lowering it to `P400D`.
- **Fallback removal:**
  - `ReliabilityScheduleCapture`: removed the live-GTFS fallbacks from `serviceSpans`, `allSpans` (removed; callers use `capturedAllSpans`), `scheduleCoveragePercentage`, and `scheduledDates` (now delegates to `completeScheduleDays`), plus dead `StationScope.ONE_STATION` SQL branches. Only `capture(...)` reads `gtfs_*` / `regional_gtfs_*`.
  - `ReliabilityObservationRollup`: `observationWindows` now reads final rows from `reliability_observation_windows` for completed dates and queries raw `ingestion_runs` only for today and unfinalized yesterday (`date >= today - 1`), never falling back to raw runs for earlier completed dates.
  - `ReliabilityRepository` & `ReliabilityRangeService`: removed `ReliabilityRepository.aggregate(...)`, `aggregateLine(...)`, `serviceWindows(...)`, and the `derivedThrough == null` fallback. `ReliabilityRepository` now takes `Clock`, and both `aggregateServiceDates` and `ReliabilityRangeService.facts` bound live-tail computation strictly to `[today - 1 .. today]` (filtering live spans by complete schedule days).
- **Observability & deploy smoke:** added `ReliabilityHealthMetrics` (`linewatch_reliability_derivation_consecutive_failures`, `linewatch_reliability_derivation_stale`, `linewatch_reliability_derivation_last_duration_seconds`, `linewatch_reliability_methodology_version`), added two Grafana alert rules (`linewatch-reliability-derivation-failing`, `linewatch-reliability-derivation-stale`) to `infra/observability/grafana/linewatch-alerts.json`, and extended `scripts/smoke-deploy.mjs` to check `/api/health/reliability` and `/api/reliability/availability?network=ttc`.
- **Docs & methodology sweep:** updated `docs/domain-invariants.md`, `docs/feature-reference.md`, `README.md`, `ReliabilityGuidePage` (`/ttc/reliability` and `/go-up/reliability`), `docs/operations-guide.md`, `docs/production-vps.md` (added Reliability analytics section, updated Backups table, health checks, and restore drill), `docs/observability.md`, `docs/script-inventory.md`, and `docs/testing.md`.
- **Release note (`1.4.0`):** added `1.4.0` ("Reliability Analytics over any range", `announceOnLaunch: true`, `releasedAt: "2026-11-24"`) to `frontend/src/app/release-notes.ts`, turned off `announceOnLaunch` on `1.3.0`, and bumped version references in `frontend/package.json`, `frontend/package-lock.json`, `frontend/next.config.ts`, `frontend/src/app/app-build.ts`, and the release-note/smoke/onboarding specs.

Checks (2026-11-24):

- Backend (scratch copy, PostGIS test DB on 5434): added `MaintenanceCleanupStoreIntegrationTest` (1), `ReliabilityHealthMetricsTest` (3), and `historicalRangeWithoutDerivationDoesNotRecomputeCompletedDaysOnRequest` in `ReliabilityDerivationIntegrationTest`; updated `MaintenanceCleanupStoreTest`, `ReliabilityScheduleCaptureIntegrationTest`, `ReliabilityObservationRollupIntegrationTest`, `ReliabilityDerivationIntegrationTest`, and `ReliabilityRangeIntegrationTest`; full `mvn test` passed: 1,598 tests, 0 failures, 0 errors, 1 opt-in skipped (`BootRuntimeIntegrationTest` ran).
- Frontend & scripts: `test:fast`, `typecheck`, `lint` (0 errors), `test:scripts:all` (63 Node script tests including `grafana-apply-alerts.test.mjs`, 30 prod-release, deploy gate, 14 off-host backup, 8 staging, 7 aws lab), and `node scripts/grafana-apply-alerts.mjs --dry-run` all passed.
- Production build + Playwright (scratch copy, `desktop-chrome`): `npm run build` succeeded (214 static pages); `opening-experience.spec.ts`, `transit-guides.spec.ts`, and `reliability-analytics.spec.ts` passed (26 passed, 0 failed on `desktop-chrome`; `mobile-chromium` could not run because Playwright's bundled Chromium binary is absent from `~/.cache/ms-playwright`).

Original plan:

- **Retention:** set D7's ingestion-run retention in production. The code
  default stays `P90D`, since other deployments no longer depend on it.
- **Fallbacks:** remove the live-GTFS and raw-run fallbacks, and what remains
  of the request-time calculation outside the today slice, from
  `ReliabilityRepository`.
- **Docs:**
  - Domain invariants and the feature reference.
  - The README claims and the methodology pages.
  - The operations guide and production VPS: derive job, rebuild runner,
    backups, restore.
  - The script inventory and observability: derive and backup metrics.
  - Testing: the new specs.
- **Release:** a release note through the usual release process.

## Verification for this plan

- **Backend:** run targeted `mvn -f backend/pom.xml -Dtest=ClassName test`
  while editing. Integration tests need the local PostGIS test database on
  5434 ([testing](../testing.md)). Run `mvn -f backend/pom.xml test` once per
  phase when stable.
- **Frontend:** `test:fast`, `typecheck` and `lint` per phase, plus `build`
  and the analytics smoke spec for A8 and A9.
- **Production:** checks are read-only queries and public endpoints. Every
  production change (environment, deploy, backfill, backup timer) needs the
  owner's go-ahead; A0's was given on 2026-11-24.

## Risks

- **The 30-day window shifts.** Moving from an instant (`now − 30 days`) to
  service dates moves the 30-day numbers slightly (A5). This is documented in
  the methodology and release note.
- **Frozen spans ignore corrections.** A feed that corrects already-past dates
  is ignored. This is rare and accepted.
- **Archived feeds may differ.** A2's archives may not match what LineWatchTO
  would have imported. They are labelled `archive`, and confidence rules apply
  unchanged.
- **The derive job can fail.** The page then shows data through
  `derived_through` and says so, and health reports the failure.
- **Disk growth comes from CourtLens,** not reliability. The existing
  free-disk warning covers it.
