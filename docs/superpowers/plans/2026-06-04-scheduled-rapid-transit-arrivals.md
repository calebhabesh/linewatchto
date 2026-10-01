# Scheduled Rapid-Transit Arrivals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace station-panel demo arrivals with source-labeled scheduled arrivals for every mapped rapid-transit station on Lines 1, 2, 4, 5, and 6, while greying the arrivals section when active service impacts make the schedule unreliable.

**Architecture:** Use the public TTC merged GTFS schedule as the default rapid-transit arrival source. Import only rapid-transit schedule rows into backend-owned tables, compute upcoming departures from Toronto local time, expose them through the existing station detail API, and keep the provider boundary ready for a future official subway/LRT GTFS-realtime feed. The frontend remains a typed consumer with fixture fallback, and it renders scheduled arrivals as timetable estimates rather than live predictions.

**Tech Stack:** Java 21, Spring Boot, Spring JDBC/JPA, Flyway, PostgreSQL, Maven, Next.js App Router, React, TypeScript, Node test runner, Playwright Chromium.

---

## Gemini 3.5 Flash High Prompt

Use this prompt in a fresh Gemini session:

```text
You are working in . on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md, and docs/superpowers/plans/2026-06-04-scheduled-rapid-transit-arrivals.md before editing.

Implement scheduled rapid-transit arrivals for every mapped Line 1, 2, 4, 5, and 6 station. Use the public TTC merged GTFS schedule as the source of scheduled arrivals. Do not use TTC BusTime GTFS-RT for subway/LRT arrivals. Do not add surface bus/streetcar connections in this slice. Do not claim live subway/LRT predictions. Preserve user changes, run git status before edits, write the smallest meaningful failing test before each behavior change, and commit after each completed task group.

When a station has active service impacts, keep the Arrivals section visible but grey it out and show "Schedule may be disrupted" with the relevant alert reason. Accessibility outages alone must not grey out arrivals.
```

## Current State Summary

Confirmed from this checkout on 2026-06-04:

- `backend/src/main/java/com/calebhabesh/linewatch/arrival/` already contains `ArrivalService`, `ArrivalProvider`, `ArrivalPrediction`, `ArrivalProperties`, and `PublicArrivalClient`.
- `PublicArrivalClient` is a placeholder JSON client, not a valid TTC GTFS-realtime or GTFS schedule client.
- `ArrivalProperties.url` currently defaults to `https://bustime.ttc.ca/gtfsrt`, but BusTime GTFS-RT is for surface transit and must not be used for rapid-transit station arrivals.
- `StationResponses.StationArrivalResponse` already includes `lineId`, `direction`, `minutes`, `predictedAt`, `label`, `source`, and `status`.
- `StationService` already injects `ArrivalService` and passes arrival rows into station details.
- `frontend/src/app/station-data.ts` already has `StationArrival` and `arrivalsSource`.
- `frontend/src/components/StationDetailPanel.tsx` already renders an arrivals section, but it labels non-live rows as demo arrivals and does not grey the section when service impacts exist.
- Dirty local files may exist. Run `git status --short` and preserve all user changes.

## Source Decision

Use the City/TTC public merged GTFS schedule dataset:

```text
https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/merged-gtfs-ttc-routes-and-schedules
```

Do not use this surface-vehicle feed for rapid-transit arrivals:

```text
https://bustime.ttc.ca/gtfsrt
```

User-facing wording:

```text
Arrivals
TTC scheduled service
Schedule may be disrupted
Scheduled arrivals use TTC timetable data and are not live train predictions.
```

Out of scope for this plan:

- Surface bus/streetcar connections.
- Undocumented TTC station-screen endpoints.
- Live subway/LRT GTFS-realtime predictions.
- GTFS shapes or PostGIS geometry import.
- Redis caching.

## File Structure

Create:

- `backend/src/main/resources/db/migration/V16__gtfs_schedule_arrivals.sql`: rapid-transit GTFS schedule tables and indexes.
- `backend/src/main/resources/arrival/rapid-transit-station-aliases.csv`: one station-line alias row for every mapped station-line pair.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java`: small quoted CSV reader for GTFS text files.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsImportModels.java`: internal import records.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java`: JDBC writes for replacing active rapid-transit schedule imports.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java`: reads a GTFS zip, filters Lines 1/2/4/5/6, resolves station aliases, and stores rows.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java`: JDBC reads for active services and upcoming station departures.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProvider.java`: converts scheduled departures into `ArrivalPrediction` rows.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRunner.java`: optional startup/import runner controlled by properties.
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProviderTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/RapidTransitStationAliasCoverageTest.java`
- `scripts/download-ttc-gtfs.mjs`: downloads the current merged TTC GTFS zip through the City CKAN package API.
- `scripts/import-ttc-gtfs-schedule.sh`: wrapper for importing a downloaded GTFS zip into the local backend database.

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalProperties.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalPrediction.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/PublicArrivalClient.java`
- `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/ArrivalServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/PublicArrivalClientTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`
- `frontend/src/app/station-data.ts`
- `frontend/src/components/StationDetailPanel.tsx`
- `frontend/tests/station-data.test.mjs`
- `frontend/tests/station-panel-layout.test.mjs`
- `frontend/tests/smoke/api-stub-data.mjs`
- `frontend/tests/smoke/dashboard.spec.ts`
- `README.md`
- `AGENTS.md`
- `GEMINI.md`
- `docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md`

## Task 0: Baseline And Source Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Confirm baseline and preserve local changes**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: note the current branch, latest commit, and dirty files. Do not reset, checkout, or delete local work.

- [ ] **Step 2: Update the existing arrivals design spec**

Replace the old "Live Station Arrivals Design" content with:

```markdown
# Scheduled Rapid-Transit Arrivals Design

## Source

LineWatchTO uses the public TTC merged GTFS schedule dataset for station arrival estimates on mapped rapid-transit Lines 1, 2, 4, 5, and 6:

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
```

- [ ] **Step 3: Update public claims in docs**

In `README.md`, `AGENTS.md`, and `GEMINI.md`, replace statements that say arrivals default to demo estimates with wording equivalent to:

```markdown
Station arrivals use source-labeled TTC scheduled service when a merged GTFS schedule import is active. They are timetable-based estimates, not live subway/LRT predictions. If no schedule import is active, the station detail API returns an unavailable scheduled-source state and the frontend fallback remains clearly labeled as demo data.
```

Keep the project disclaimer that LineWatchTO is unofficial and must not be relied on as the sole source of truth.

- [ ] **Step 4: Verify documentation diff**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md README.md AGENTS.md GEMINI.md
git commit -m "docs: define scheduled rapid-transit arrivals"
```

## Task 1: GTFS Schedule Schema

**Files:**
- Create: `backend/src/main/resources/db/migration/V16__gtfs_schedule_arrivals.sql`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleSchemaMigrationTest.java`

- [ ] **Step 1: Write the migration text test**

Create `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleSchemaMigrationTest.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class GtfsScheduleSchemaMigrationTest {

    @Test
    void v16CreatesRapidTransitScheduleTablesAndIndexes() throws IOException {
        String sql = migrationSql("/db/migration/V16__gtfs_schedule_arrivals.sql");

        assertThat(sql).contains("create table gtfs_schedule_imports");
        assertThat(sql).contains("create table gtfs_routes");
        assertThat(sql).contains("create table gtfs_stops");
        assertThat(sql).contains("create table gtfs_services");
        assertThat(sql).contains("create table gtfs_service_exceptions");
        assertThat(sql).contains("create table gtfs_trips");
        assertThat(sql).contains("create table gtfs_stop_times");
        assertThat(sql).contains("create table gtfs_station_stops");
        assertThat(sql).contains("idx_gtfs_stop_times_station_lookup");
        assertThat(sql).contains("idx_gtfs_trips_service_lookup");
        assertThat(sql).contains("idx_gtfs_station_stops_station_line");
        assertThat(sql).contains("route_short_name in ('1', '2', '4', '5', '6')");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
```

- [ ] **Step 2: Run the failing migration test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleSchemaMigrationTest test
```

Expected: FAIL because `V16__gtfs_schedule_arrivals.sql` does not exist.

- [ ] **Step 3: Add the migration**

Create `backend/src/main/resources/db/migration/V16__gtfs_schedule_arrivals.sql`:

```sql
create table gtfs_schedule_imports (
    id bigserial primary key,
    source_name varchar(120) not null,
    source_url text not null,
    imported_at timestamptz not null,
    service_start date,
    service_end date,
    active boolean not null default true
);

create unique index idx_gtfs_schedule_imports_one_active
    on gtfs_schedule_imports(active)
    where active = true;

create table gtfs_routes (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    route_id varchar(120) not null,
    line_id varchar(20) not null,
    route_short_name varchar(20) not null,
    route_long_name text,
    primary key (import_id, route_id),
    constraint chk_gtfs_routes_rapid_transit
        check (route_short_name in ('1', '2', '4', '5', '6'))
);

create table gtfs_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    stop_id varchar(120) not null,
    stop_name text not null,
    parent_station varchar(120),
    primary key (import_id, stop_id)
);

create table gtfs_services (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(120) not null,
    monday boolean not null,
    tuesday boolean not null,
    wednesday boolean not null,
    thursday boolean not null,
    friday boolean not null,
    saturday boolean not null,
    sunday boolean not null,
    start_date date not null,
    end_date date not null,
    primary key (import_id, service_id)
);

create table gtfs_service_exceptions (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    service_id varchar(120) not null,
    service_date date not null,
    exception_type integer not null,
    primary key (import_id, service_id, service_date)
);

create table gtfs_trips (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    trip_id varchar(160) not null,
    route_id varchar(120) not null,
    service_id varchar(120) not null,
    trip_headsign text,
    direction_id integer,
    primary key (import_id, trip_id),
    foreign key (import_id, route_id) references gtfs_routes(import_id, route_id) on delete cascade,
    foreign key (import_id, service_id) references gtfs_services(import_id, service_id) on delete cascade
);

create table gtfs_stop_times (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    trip_id varchar(160) not null,
    stop_id varchar(120) not null,
    arrival_seconds integer not null,
    departure_seconds integer not null,
    stop_sequence integer not null,
    primary key (import_id, trip_id, stop_sequence),
    foreign key (import_id, trip_id) references gtfs_trips(import_id, trip_id) on delete cascade,
    foreign key (import_id, stop_id) references gtfs_stops(import_id, stop_id) on delete cascade
);

create table gtfs_station_stops (
    import_id bigint not null references gtfs_schedule_imports(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    line_id varchar(20) not null references transit_lines(id),
    stop_id varchar(120) not null,
    primary key (import_id, station_id, line_id, stop_id),
    foreign key (import_id, stop_id) references gtfs_stops(import_id, stop_id) on delete cascade
);

create index idx_gtfs_trips_service_lookup
    on gtfs_trips(import_id, service_id, route_id);

create index idx_gtfs_stop_times_station_lookup
    on gtfs_stop_times(import_id, stop_id, departure_seconds);

create index idx_gtfs_station_stops_station_line
    on gtfs_station_stops(import_id, station_id, line_id);
```

- [ ] **Step 4: Run the migration test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleSchemaMigrationTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/main/resources/db/migration/V16__gtfs_schedule_arrivals.sql backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleSchemaMigrationTest.java
git commit -m "feat: add gtfs schedule arrival schema"
```

## Task 2: Station Alias Coverage

**Files:**
- Create: `backend/src/main/resources/arrival/rapid-transit-station-aliases.csv`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/RapidTransitStationAliasCoverageTest.java`
- Inspect: `backend/src/main/resources/db/migration/V10__station_line_accessibility.sql`
- Inspect: `frontend/src/app/station-data.ts`

- [ ] **Step 1: Write the alias coverage test**

Create `RapidTransitStationAliasCoverageTest.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RapidTransitStationAliasCoverageTest {

    @Test
    void aliasesCoverEveryMappedStationLinePair() throws IOException {
        Set<String> keys = new HashSet<>();
        try (var input = getClass().getResourceAsStream("/arrival/rapid-transit-station-aliases.csv")) {
            assertThat(input).isNotNull();
            try (var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String header = reader.readLine();
                assertThat(header).isEqualTo("station_id,line_id,aliases");
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split(",", 3);
                    assertThat(parts).hasSize(3);
                    assertThat(parts[2]).isNotBlank();
                    keys.add(parts[0] + "|" + parts[1]);
                }
            }
        }

        assertThat(keys).hasSize(117);
        assertThat(keys).contains(
            "vaughan-metropolitan-centre|line-1",
            "spadina|line-1",
            "spadina|line-2",
            "st-george|line-1",
            "st-george|line-2",
            "union|line-1",
            "bloor-yonge|line-1",
            "bloor-yonge|line-2",
            "sheppard-yonge|line-1",
            "sheppard-yonge|line-4",
            "kennedy|line-2",
            "kennedy|line-5",
            "mount-dennis|line-5",
            "humber-college|line-6",
            "finch-west|line-6"
        );
    }
}
```

- [ ] **Step 2: Run the failing alias test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=RapidTransitStationAliasCoverageTest test
```

Expected: FAIL because `rapid-transit-station-aliases.csv` does not exist.

- [ ] **Step 3: Create the alias CSV**

Create `backend/src/main/resources/arrival/rapid-transit-station-aliases.csv` with this header:

```csv
station_id,line_id,aliases
```

Add one row for every station-line pair in `V10__station_line_accessibility.sql`. The `aliases` field is pipe-separated and must include the LineWatch display station name plus common GTFS spellings. Examples:

```csv
vaughan-metropolitan-centre,line-1,Vaughan Metropolitan Centre|Vaughan Metropolitan Centre Station
spadina,line-1,Spadina|Spadina Station
spadina,line-2,Spadina|Spadina Station
st-george,line-1,St George|St George Station|St. George|St. George Station
st-george,line-2,St George|St George Station|St. George|St. George Station
union,line-1,Union|Union Station
bloor-yonge,line-1,Bloor-Yonge|Bloor-Yonge Station|Bloor Yonge|Bloor Yonge Station
bloor-yonge,line-2,Bloor-Yonge|Bloor-Yonge Station|Bloor Yonge|Bloor Yonge Station
sheppard-yonge,line-1,Sheppard-Yonge|Sheppard-Yonge Station|Sheppard Yonge|Sheppard Yonge Station
sheppard-yonge,line-4,Sheppard-Yonge|Sheppard-Yonge Station|Sheppard Yonge|Sheppard Yonge Station
kennedy,line-2,Kennedy|Kennedy Station
kennedy,line-5,Kennedy|Kennedy Station
mount-dennis,line-5,Mount Dennis|Mount Dennis Station
humber-college,line-6,Humber College|Humber College Station
finch-west,line-6,Finch West|Finch West Station
```

For all other mapped stations, follow the same format. Use ASCII apostrophes and hyphens. Keep the total data rows at 117.

- [ ] **Step 4: Run the alias test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=RapidTransitStationAliasCoverageTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/main/resources/arrival/rapid-transit-station-aliases.csv backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/RapidTransitStationAliasCoverageTest.java
git commit -m "feat: map rapid-transit stations to gtfs aliases"
```

## Task 3: GTFS CSV Reader And Import Models

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsImportModels.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java`

- [ ] **Step 1: Write CSV reader tests**

Create `GtfsCsvReaderTest.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.StringReader;
import java.util.List;
import org.junit.jupiter.api.Test;

class GtfsCsvReaderTest {

    @Test
    void readsRowsByHeaderNameAndHandlesQuotedCommas() throws Exception {
        String csv = """
            route_id,route_short_name,route_long_name
            1,1,"Yonge-University, Subway"
            """;

        List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(new StringReader(csv));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().value("route_id")).isEqualTo("1");
        assertThat(rows.getFirst().value("route_short_name")).isEqualTo("1");
        assertThat(rows.getFirst().value("route_long_name")).isEqualTo("Yonge-University, Subway");
    }

    @Test
    void parsesGtfsTimesBeyondMidnight() {
        assertThat(GtfsCsvReader.seconds("00:05:00")).isEqualTo(300);
        assertThat(GtfsCsvReader.seconds("24:10:00")).isEqualTo(87000);
        assertThat(GtfsCsvReader.seconds("25:30:15")).isEqualTo(91815);
    }

    @Test
    void normalizesStationNamesForAliasMatching() {
        assertThat(GtfsCsvReader.normalizeStationName("St. George Station")).isEqualTo("st george");
        assertThat(GtfsCsvReader.normalizeStationName("Bloor-Yonge")).isEqualTo("bloor yonge");
        assertThat(GtfsCsvReader.normalizeStationName("  Vaughan Metropolitan Centre Station  ")).isEqualTo("vaughan metropolitan centre");
    }
}
```

- [ ] **Step 2: Run the failing reader tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsCsvReaderTest test
```

Expected: FAIL because `GtfsCsvReader` does not exist.

- [ ] **Step 3: Implement the CSV reader**

Create `GtfsCsvReader.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class GtfsCsvReader {
    private GtfsCsvReader() {
    }

    public static List<Row> read(Reader reader) throws IOException {
        try (BufferedReader buffered = new BufferedReader(reader)) {
            String headerLine = buffered.readLine();
            if (headerLine == null || headerLine.isBlank()) {
                return List.of();
            }
            List<String> headers = parseLine(headerLine);
            List<Row> rows = new ArrayList<>();
            String line;
            while ((line = buffered.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                List<String> values = parseLine(line);
                Map<String, String> byHeader = new LinkedHashMap<>();
                for (int index = 0; index < headers.size(); index++) {
                    String value = index < values.size() ? values.get(index) : "";
                    byHeader.put(headers.get(index), value);
                }
                rows.add(new Row(byHeader));
            }
            return rows;
        }
    }

    static List<String> parseLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char ch = line.charAt(index);
            if (ch == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append('"');
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                values.add(current.toString());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        values.add(current.toString());
        return values;
    }

    public static int seconds(String gtfsTime) {
        String[] parts = gtfsTime.split(":");
        if (parts.length != 3) {
            throw new IllegalArgumentException("Invalid GTFS time: " + gtfsTime);
        }
        return Integer.parseInt(parts[0]) * 3600
            + Integer.parseInt(parts[1]) * 60
            + Integer.parseInt(parts[2]);
    }

    public static String normalizeStationName(String value) {
        return value == null ? "" : value
            .toLowerCase(Locale.ROOT)
            .replace(".", "")
            .replace("-", " ")
            .replaceAll("\\bstation\\b", "")
            .replaceAll("[^a-z0-9 ]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    public record Row(Map<String, String> values) {
        public String value(String key) {
            return values.getOrDefault(key, "");
        }
    }
}
```

- [ ] **Step 4: Add import model records**

Create `GtfsImportModels.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;

public final class GtfsImportModels {
    private GtfsImportModels() {
    }

    public record RouteRow(String routeId, String lineId, String shortName, String longName) {
    }

    public record StopRow(String stopId, String stopName, String parentStation) {
    }

    public record ServiceRow(
        String serviceId,
        boolean monday,
        boolean tuesday,
        boolean wednesday,
        boolean thursday,
        boolean friday,
        boolean saturday,
        boolean sunday,
        LocalDate startDate,
        LocalDate endDate
    ) {
    }

    public record ServiceExceptionRow(String serviceId, LocalDate serviceDate, int exceptionType) {
    }

    public record TripRow(
        String tripId,
        String routeId,
        String serviceId,
        String tripHeadsign,
        Integer directionId
    ) {
    }

    public record StopTimeRow(
        String tripId,
        String stopId,
        int arrivalSeconds,
        int departureSeconds,
        int stopSequence
    ) {
    }

    public record StationStopRow(String stationId, String lineId, String stopId) {
    }
}
```

- [ ] **Step 5: Run reader tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsCsvReaderTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsImportModels.java backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java
git commit -m "feat: add gtfs csv parsing helpers"
```

## Task 4: GTFS Import Repository And Service

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java`

- [ ] **Step 1: Write importer service tests**

Create `GtfsScheduleImportServiceTest.java`. Use a temporary GTFS zip with `routes.txt`, `stops.txt`, `calendar.txt`, `calendar_dates.txt`, `trips.txt`, and `stop_times.txt`.

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

class GtfsScheduleImportServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void importsOnlyRapidTransitRoutesAndResolvesStationAliases() throws Exception {
        Path zip = tempDir.resolve("gtfs.zip");
        writeZip(zip);

        GtfsScheduleImportRepository repository = mock(GtfsScheduleImportRepository.class);
        when(repository.beginReplacementImport(
            eq("TTC merged GTFS schedule"),
            eq("test-source"),
            any(),
            any(),
            any()
        )).thenReturn(42L);

        GtfsScheduleImportService service = new GtfsScheduleImportService(
            repository,
            Clock.fixed(Instant.parse("2026-06-04T12:00:00Z"), ZoneId.of("UTC"))
        );

        GtfsScheduleImportService.ImportSummary summary = service.importZip(zip, "test-source");

        assertThat(summary.importId()).isEqualTo(42L);
        assertThat(summary.routes()).isEqualTo(1);
        assertThat(summary.trips()).isEqualTo(1);
        assertThat(summary.stopTimes()).isEqualTo(2);
        assertThat(summary.stationStops()).isGreaterThanOrEqualTo(1);

        ArgumentCaptor<List<GtfsImportModels.RouteRow>> routes = ArgumentCaptor.forClass(List.class);
        verify(repository).insertRoutes(eq(42L), routes.capture());
        assertThat(routes.getValue()).extracting(GtfsImportModels.RouteRow::lineId).containsExactly("line-1");

        ArgumentCaptor<List<GtfsImportModels.StopTimeRow>> stopTimes = ArgumentCaptor.forClass(List.class);
        verify(repository).insertStopTimes(eq(42L), stopTimes.capture());
        assertThat(stopTimes.getValue()).extracting(GtfsImportModels.StopTimeRow::departureSeconds)
            .contains(32400, 32700);

        verify(repository).activateImport(42L);
    }

    private void writeZip(Path zip) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,agency_id,route_short_name,route_long_name,route_type
                1,TTC,1,Yonge-University,1
                501,TTC,501,Queen,0
                """);
            entry(output, "stops.txt", """
                stop_id,stop_name,parent_station
                UNION,Union Station,
                UNION_N,Union Station,UNION
                UNION_S,Union Station,UNION
                QUEEN_SURFACE,Queen St West,
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WEEKDAY,1,1,1,1,1,0,0,20260601,20261231
                """);
            entry(output, "calendar_dates.txt", """
                service_id,date,exception_type
                WEEKDAY,20260701,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id
                1,WEEKDAY,L1_N_1,Northbound to Finch,0
                501,WEEKDAY,QUEEN_1,Eastbound to Neville Park,0
                """);
            entry(output, "stop_times.txt", """
                trip_id,arrival_time,departure_time,stop_id,stop_sequence
                L1_N_1,09:00:00,09:00:00,UNION_N,10
                L1_N_1,09:05:00,09:05:00,UNION_S,11
                QUEEN_1,09:01:00,09:01:00,QUEEN_SURFACE,1
                """);
        }
    }

    private void entry(ZipOutputStream output, String name, String body) throws IOException {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
    }
}
```

- [ ] **Step 2: Run the failing importer test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportServiceTest test
```

Expected: FAIL because importer classes do not exist.

- [ ] **Step 3: Implement import repository**

Create `GtfsScheduleImportRepository.java` using `NamedParameterJdbcTemplate`. Include these public methods:

```java
long beginReplacementImport(String sourceName, String sourceUrl, OffsetDateTime importedAt, LocalDate serviceStart, LocalDate serviceEnd);
void insertRoutes(long importId, List<GtfsImportModels.RouteRow> rows);
void insertStops(long importId, List<GtfsImportModels.StopRow> rows);
void insertServices(long importId, List<GtfsImportModels.ServiceRow> rows);
void insertServiceExceptions(long importId, List<GtfsImportModels.ServiceExceptionRow> rows);
void insertTrips(long importId, List<GtfsImportModels.TripRow> rows);
void insertStopTimes(long importId, List<GtfsImportModels.StopTimeRow> rows);
void insertStationStops(long importId, List<GtfsImportModels.StationStopRow> rows);
void activateImport(long importId);
```

Implementation rules:

- `beginReplacementImport` inserts the new import with `active=false`.
- `activateImport` runs in this order inside a transaction:
  - `update gtfs_schedule_imports set active = false where active = true`
  - `update gtfs_schedule_imports set active = true where id = :importId`
- Batch insert rows with `SqlParameterSourceUtils.createBatch`.
- Do not delete historical imports in this task.

- [ ] **Step 4: Implement import service**

Create `GtfsScheduleImportService.java` with:

```java
public ImportSummary importZip(Path zipPath, String sourceUrl)
```

Required behavior:

- Read only these GTFS files: `routes.txt`, `stops.txt`, `calendar.txt`, `calendar_dates.txt`, `trips.txt`, `stop_times.txt`.
- Filter routes by `route_short_name` values `1`, `2`, `4`, `5`, and `6`.
- Map route short names to LineWatch IDs:
  - `1` -> `line-1`
  - `2` -> `line-2`
  - `4` -> `line-4`
  - `5` -> `line-5`
  - `6` -> `line-6`
- Keep only trips whose `route_id` belongs to a retained route.
- Keep only stop times whose `trip_id` belongs to a retained trip.
- Keep only stops referenced by retained stop times, plus their parent stations if present.
- Parse GTFS dates from `yyyyMMdd`.
- Parse GTFS times with `GtfsCsvReader.seconds`.
- Resolve `gtfs_station_stops` by loading `rapid-transit-station-aliases.csv`, normalizing aliases with `GtfsCsvReader.normalizeStationName`, and matching aliases against retained stop names and parent station names.
- Insert rows through `GtfsScheduleImportRepository`.
- Return an `ImportSummary` record with counts:

```java
public record ImportSummary(
    long importId,
    int routes,
    int stops,
    int services,
    int serviceExceptions,
    int trips,
    int stopTimes,
    int stationStops
) {}
```

- [ ] **Step 5: Run importer test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportServiceTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java
git commit -m "feat: import rapid-transit gtfs schedules"
```

## Task 5: Schedule Import Scripts

**Files:**
- Create: `scripts/download-ttc-gtfs.mjs`
- Create: `scripts/import-ttc-gtfs-schedule.sh`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRunner.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRunnerTest.java`

- [ ] **Step 1: Extend arrival properties**

Change `ArrivalProperties` to include:

```java
public enum ProviderMode {
    SCHEDULED,
    DEMO,
    UNAVAILABLE,
    LIVE
}

private ProviderMode provider = ProviderMode.SCHEDULED;
private String scheduledSourceName = "TTC scheduled service";
private URI scheduledSourceUrl = URI.create("https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/merged-gtfs-ttc-routes-and-schedules");
private Duration scheduleHorizon = Duration.ofMinutes(90);
private int maxArrivalsPerLine = 4;
private boolean gtfsImportEnabled = false;
private String gtfsZipPath = "";
```

Keep `connectTimeout`, `readTimeout`, and live URL properties only for the future `LIVE` mode. Do not default live URL to BusTime.

- [ ] **Step 2: Add import runner test**

Create `GtfsScheduleImportRunnerTest.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class GtfsScheduleImportRunnerTest {

    @Test
    void doesNotImportWhenDisabled() throws Exception {
        ArrivalProperties properties = new ArrivalProperties();
        properties.setGtfsImportEnabled(false);
        GtfsScheduleImportService service = mock(GtfsScheduleImportService.class);

        new GtfsScheduleImportRunner(properties, service).run();

        verify(service, never()).importZip(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void importsConfiguredZipWhenEnabled() throws Exception {
        ArrivalProperties properties = new ArrivalProperties();
        properties.setGtfsImportEnabled(true);
        properties.setGtfsZipPath("/tmp/ttc-gtfs.zip");
        GtfsScheduleImportService service = mock(GtfsScheduleImportService.class);

        new GtfsScheduleImportRunner(properties, service).run();

        verify(service).importZip(Path.of("/tmp/ttc-gtfs.zip"), properties.getScheduledSourceUrl().toString());
    }
}
```

- [ ] **Step 3: Implement import runner**

Create `GtfsScheduleImportRunner.java` as an `ApplicationRunner` bean. It must:

- return immediately when `linewatch.arrivals.gtfs-import-enabled=false`;
- throw an `IllegalStateException` when import is enabled and `gtfsZipPath` is blank;
- call `GtfsScheduleImportService.importZip(Path.of(gtfsZipPath), scheduledSourceUrl.toString())`.

- [ ] **Step 4: Add downloader script**

Create `scripts/download-ttc-gtfs.mjs`:

```javascript
#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const output = resolve(process.argv[2] ?? "/tmp/ttc-merged-gtfs.zip");
const packageUrl = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules";

const packageResponse = await fetch(packageUrl);
if (!packageResponse.ok) {
  throw new Error(`CKAN package request failed: ${packageResponse.status}`);
}

const payload = await packageResponse.json();
const resources = payload?.result?.resources ?? [];
const zipResource = resources.find((resource) => {
  const url = String(resource.url ?? "");
  const format = String(resource.format ?? "").toLowerCase();
  return url.endsWith(".zip") || format.includes("zip");
});

if (!zipResource?.url) {
  throw new Error("No GTFS zip resource found in CKAN package.");
}

await mkdir(dirname(output), { recursive: true });
const gtfsResponse = await fetch(zipResource.url);
if (!gtfsResponse.ok || !gtfsResponse.body) {
  throw new Error(`GTFS download failed: ${gtfsResponse.status}`);
}

await pipeline(gtfsResponse.body, createWriteStream(output));
console.log(output);
```

- [ ] **Step 5: Add import wrapper**

Create `scripts/import-ttc-gtfs-schedule.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-/tmp/ttc-merged-gtfs.zip}"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "GTFS zip not found: $ZIP_PATH" >&2
  echo "Run: node scripts/download-ttc-gtfs.mjs $ZIP_PATH" >&2
  exit 1
fi

mvn -f backend/pom.xml spring-boot:run \
  -Dspring-boot.run.arguments="--linewatch.arrivals.gtfs-import-enabled=true --linewatch.arrivals.gtfs-zip-path=$ZIP_PATH"
```

Make the scripts executable:

```bash
chmod +x scripts/download-ttc-gtfs.mjs scripts/import-ttc-gtfs-schedule.sh
```

- [ ] **Step 6: Run tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportRunnerTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalProperties.java backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRunner.java backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRunnerTest.java scripts/download-ttc-gtfs.mjs scripts/import-ttc-gtfs-schedule.sh
git commit -m "feat: add gtfs schedule import workflow"
```

## Task 6: Scheduled Arrival Read Provider

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProvider.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProviderTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalPrediction.java`

- [ ] **Step 1: Write scheduled provider tests**

Create `ScheduledArrivalProviderTest.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ScheduledArrivalProviderTest {
    private GtfsScheduleReadRepository repository;
    private ArrivalProperties properties;
    private ScheduledArrivalProvider provider;

    private final StationResponses.StationLineResponse line1 =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#F8C300", "Northbound / Southbound", true, true);

    @BeforeEach
    void setUp() {
        repository = mock(GtfsScheduleReadRepository.class);
        properties = new ArrivalProperties();
        provider = new ScheduledArrivalProvider(
            repository,
            properties,
            Clock.fixed(Instant.parse("2026-06-04T13:00:00Z"), ZoneId.of("America/Toronto"))
        );
    }

    @Test
    void returnsScheduledRowsFromActiveImport() {
        when(repository.findActiveImportId()).thenReturn(Optional.of(7L));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-03"))).thenReturn(List.of());
        when(repository.findUpcomingDepartures(
            7L,
            "union",
            List.of("line-1"),
            List.of("WKD"),
            32400,
            37800,
            properties.getMaxArrivalsPerLine()
        )).thenReturn(List.of(
            new GtfsScheduleReadRepository.ScheduledDeparture("line-1", "Northbound to Finch", 32700, LocalDate.parse("2026-06-04"))
        ));

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().lineId()).isEqualTo("line-1");
        assertThat(arrivals.getFirst().direction()).isEqualTo("Northbound to Finch");
        assertThat(arrivals.getFirst().minutes()).isEqualTo(5);
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service");
        assertThat(arrivals.getFirst().status()).isEqualTo("scheduled");
        assertThat(arrivals.getFirst().predictedAt()).isEqualTo(OffsetDateTime.parse("2026-06-04T09:05:00-04:00"));
    }

    @Test
    void returnsUnavailableRowsWhenNoImportIsActive() {
        when(repository.findActiveImportId()).thenReturn(Optional.empty());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("unavailable");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service unavailable");
        assertThat(arrivals.getFirst().label()).isEqualTo("Unavailable");
    }

    @Test
    void returnsNoScheduledServiceRowWhenNoTripsExistInHorizon() {
        when(repository.findActiveImportId()).thenReturn(Optional.of(7L));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-04"))).thenReturn(List.of("WKD"));
        when(repository.findActiveServiceIds(7L, LocalDate.parse("2026-06-03"))).thenReturn(List.of());

        List<ArrivalPrediction> arrivals = provider.arrivalsFor("union", List.of(line1));

        assertThat(arrivals).hasSize(1);
        assertThat(arrivals.getFirst().status()).isEqualTo("scheduled");
        assertThat(arrivals.getFirst().source()).isEqualTo("TTC scheduled service");
        assertThat(arrivals.getFirst().label()).isEqualTo("No scheduled service");
    }
}
```

- [ ] **Step 2: Run failing scheduled provider tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ScheduledArrivalProviderTest test
```

Expected: FAIL because scheduled provider classes do not exist and `ArrivalPrediction.label()` does not exist.

- [ ] **Step 3: Update `ArrivalPrediction`**

Change `ArrivalPrediction` to:

```java
package com.calebhabesh.linewatch.arrival;

import java.time.OffsetDateTime;

public record ArrivalPrediction(
    String lineId,
    String direction,
    Integer minutes,
    OffsetDateTime predictedAt,
    String source,
    String status,
    String label
) {
    public static ArrivalPrediction scheduled(
        String lineId,
        String direction,
        Integer minutes,
        OffsetDateTime predictedAt,
        String source
    ) {
        String label = minutes == null ? "No scheduled service" : minutes <= 0 ? "Due" : minutes + " min";
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, source, "scheduled", label);
    }

    public static ArrivalPrediction unavailable(String lineId, String direction) {
        return new ArrivalPrediction(lineId, direction, null, null, "TTC scheduled service unavailable", "unavailable", "Unavailable");
    }

    public static ArrivalPrediction demo(String lineId, String direction, int minutes, OffsetDateTime predictedAt) {
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, "Demo estimates", "demo", minutes + " min");
    }
}
```

Update existing tests and constructors to pass the new `label` field or use the static factories.

- [ ] **Step 4: Implement read repository**

Create `GtfsScheduleReadRepository.java`:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class GtfsScheduleReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public GtfsScheduleReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Long> findActiveImportId() {
        List<Long> ids = jdbc.query("""
            select id
            from gtfs_schedule_imports
            where active = true
            order by imported_at desc
            limit 1
            """, (rs, rowNum) -> rs.getLong("id"));
        return ids.stream().findFirst();
    }

    public List<String> findActiveServiceIds(long importId, LocalDate serviceDate) {
        return jdbc.query("""
            select service_id
            from gtfs_services
            where import_id = :importId
              and start_date <= :serviceDate
              and end_date >= :serviceDate
              and case extract(isodow from cast(:serviceDate as date))
                    when 1 then monday
                    when 2 then tuesday
                    when 3 then wednesday
                    when 4 then thursday
                    when 5 then friday
                    when 6 then saturday
                    when 7 then sunday
                  end = true
              and service_id not in (
                    select service_id
                    from gtfs_service_exceptions
                    where import_id = :importId
                      and service_date = :serviceDate
                      and exception_type = 2
              )
            union
            select service_id
            from gtfs_service_exceptions
            where import_id = :importId
              and service_date = :serviceDate
              and exception_type = 1
            order by service_id
            """, new MapSqlParameterSource(Map.of(
                "importId", importId,
                "serviceDate", serviceDate
            )), (rs, rowNum) -> rs.getString("service_id"));
    }

    public List<ScheduledDeparture> findUpcomingDepartures(
        long importId,
        String stationId,
        List<String> lineIds,
        List<String> activeServiceIds,
        int minDepartureSeconds,
        int maxDepartureSeconds,
        int limitPerLine
    ) {
        if (lineIds.isEmpty() || activeServiceIds.isEmpty()) {
            return List.of();
        }
        return jdbc.query("""
            select route.line_id,
                   coalesce(nullif(trip.trip_headsign, ''), route.route_long_name) as direction,
                   stop_time.departure_seconds
            from gtfs_station_stops station_stop
            join gtfs_stop_times stop_time
              on stop_time.import_id = station_stop.import_id
             and stop_time.stop_id = station_stop.stop_id
            join gtfs_trips trip
              on trip.import_id = stop_time.import_id
             and trip.trip_id = stop_time.trip_id
            join gtfs_routes route
              on route.import_id = trip.import_id
             and route.route_id = trip.route_id
            where station_stop.import_id = :importId
              and station_stop.station_id = :stationId
              and route.line_id in (:lineIds)
              and trip.service_id in (:activeServiceIds)
              and stop_time.departure_seconds >= :minDepartureSeconds
              and stop_time.departure_seconds <= :maxDepartureSeconds
            order by route.line_id asc, stop_time.departure_seconds asc
            """, new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("stationId", stationId)
                .addValue("lineIds", lineIds)
                .addValue("activeServiceIds", activeServiceIds)
                .addValue("minDepartureSeconds", minDepartureSeconds)
                .addValue("maxDepartureSeconds", maxDepartureSeconds),
            (rs, rowNum) -> new ScheduledDeparture(
                rs.getString("line_id"),
                rs.getString("direction"),
                rs.getInt("departure_seconds"),
                null
            )).stream()
            .collect(java.util.stream.Collectors.groupingBy(ScheduledDeparture::lineId, java.util.LinkedHashMap::new, java.util.stream.Collectors.toList()))
            .values()
            .stream()
            .flatMap(rows -> rows.stream().limit(limitPerLine))
            .toList();
    }

    public record ScheduledDeparture(String lineId, String direction, int departureSeconds, LocalDate serviceDate) {
        public ScheduledDeparture withServiceDate(LocalDate date) {
            return new ScheduledDeparture(lineId, direction, departureSeconds, date);
        }
    }
}
```

If the Java compiler rejects the text-block SQL because of PostgreSQL date casting in tests, keep the SQL in this repository and validate through Maven compilation first; no database integration test is required in this task.

- [ ] **Step 5: Implement scheduled provider**

Create `ScheduledArrivalProvider.java`. Required behavior:

- Use `ZoneId.of("America/Toronto")`.
- Query current local service date and previous service date because GTFS times can exceed 24 hours after midnight.
- Use `properties.scheduleHorizon` to build the max departure window.
- Convert GTFS departure seconds to `OffsetDateTime`.
- Drop rows whose predicted time is before `now.minusSeconds(30)`.
- Sort by `lineId`, then `predictedAt`.
- If no import exists, return one unavailable row per station line.
- If no trips exist within the horizon, return one scheduled row per station line with label `No scheduled service`.

- [ ] **Step 6: Run scheduled provider tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ScheduledArrivalProviderTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalPrediction.java backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProvider.java backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/ScheduledArrivalProviderTest.java
git commit -m "feat: compute scheduled station arrivals"
```

## Task 7: Arrival Service Orchestration

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/PublicArrivalClient.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/ArrivalServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/PublicArrivalClientTest.java`

- [ ] **Step 1: Update `ArrivalServiceTest` for scheduled default**

Replace the disabled-provider default test with:

```java
@Test
void arrivalsForUsesScheduledProviderByDefault() {
    when(scheduledArrivalProvider.arrivalsFor("spadina", List.of(line1Response))).thenReturn(List.of(
        ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(clock).plusMinutes(3), "TTC scheduled service")
    ));

    List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

    assertThat(predictions).hasSize(1);
    assertThat(predictions.getFirst().status()).isEqualTo("scheduled");
    assertThat(predictions.getFirst().source()).isEqualTo("TTC scheduled service");
}
```

Add explicit tests for:

```java
properties.setProvider(ArrivalProperties.ProviderMode.DEMO);
```

and:

```java
properties.setProvider(ArrivalProperties.ProviderMode.UNAVAILABLE);
```

Expected behavior:

- `DEMO` returns demo rows.
- `UNAVAILABLE` returns unavailable rows.
- `LIVE` returns unavailable rows until a real official rapid-transit live provider is added.

- [ ] **Step 2: Refactor `ArrivalService`**

Constructor dependencies:

```java
public ArrivalService(
    ScheduledArrivalProvider scheduledArrivalProvider,
    ArrivalProperties properties,
    Clock clock
)
```

Behavior:

```java
return switch (properties.getProvider()) {
    case SCHEDULED -> scheduledArrivalProvider.arrivalsFor(stationId, lines);
    case DEMO -> getDemoPredictions(lines);
    case UNAVAILABLE -> getUnavailablePredictions(lines);
    case LIVE -> getUnavailablePredictions(lines);
};
```

Use the new `ArrivalPrediction.demo` and `ArrivalPrediction.unavailable` factories.

- [ ] **Step 3: Park `PublicArrivalClient` behind future live mode**

Do not delete `PublicArrivalClient`. Change its default property wiring so it does not target BusTime. Tests should assert that:

- the client still parses the existing placeholder JSON contract;
- the default live URL is not `https://bustime.ttc.ca/gtfsrt`;
- no production code calls it in `SCHEDULED` mode.

- [ ] **Step 4: Run arrival tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ArrivalServiceTest,PublicArrivalClientTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival backend/src/test/java/com/calebhabesh/linewatch/arrival
git commit -m "feat: default station arrivals to scheduled provider"
```

## Task 8: Station API Disruption Context

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`

- [ ] **Step 1: Write station API tests**

In `StationServiceTest`, add:

```java
@Test
void stationDetailMarksArrivalsDisruptedWhenServiceImpactExists() {
    when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
        ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(), "TTC scheduled service")
    ));
    when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
    when(impactRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(
        stationImpact("union-delay", "union", "active-alert", "delay", "Line 1 delay", "Longer travel times near Union.", "TTC Live Alerts")
    ));

    StationResponses.StationDetailResponse response = stationService.stationDetail("union");

    assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isTrue();
    assertThat(response.arrivalContext().message()).isEqualTo("Schedule may be disrupted");
    assertThat(response.arrivalContext().reason()).contains("Line 1 delay");
    assertThat(response.arrivalContext().severity()).isEqualTo("delay");
}
```

Add:

```java
@Test
void stationDetailDoesNotMarkArrivalsDisruptedForAccessibilityOutageOnly() {
    when(arrivalService.arrivalsFor(any(), any())).thenReturn(List.of(
        ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(), "TTC scheduled service")
    ));
    when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
    when(liveReadRepository.findActiveAlertsByStationId("union")).thenReturn(List.of());
    when(liveReadRepository.findActiveOutagesByStationId("union")).thenReturn(List.of(
        new StationLiveReadRepository.FacilityOutage(
            "outage-1",
            "elevator",
            "Elevator outage",
            "Elevator unavailable.",
            "Mechanical",
            OffsetDateTime.now()
        )
    ));

    StationResponses.StationDetailResponse response = stationService.stationDetail("union");

    assertThat(response.arrivalContext().scheduleMayBeDisrupted()).isFalse();
    assertThat(response.arrivalContext().message()).isEqualTo("Schedule active");
}
```

- [ ] **Step 2: Run failing station tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StationServiceTest,StationControllerTest test
```

Expected: FAIL because `arrivalContext` does not exist.

- [ ] **Step 3: Add response record**

In `StationResponses`, add:

```java
public record StationArrivalContextResponse(
    boolean scheduleMayBeDisrupted,
    String message,
    String reason,
    String severity,
    String source
) {
}
```

Add `StationArrivalContextResponse arrivalContext` to `StationDetailResponse` immediately after `arrivalsSource`.

- [ ] **Step 4: Update `StationService`**

Use `ArrivalPrediction.label()` instead of recomputing labels:

```java
pred.label()
```

Add:

```java
private StationResponses.StationArrivalContextResponse toArrivalContext(
    List<StationResponses.StationImpactResponse> impacts
) {
    return impacts.stream()
        .filter(impact -> impact.type().equals("active-alert") || impact.type().equals("planned-closure"))
        .findFirst()
        .map(impact -> new StationResponses.StationArrivalContextResponse(
            true,
            "Schedule may be disrupted",
            impact.title(),
            impact.severity(),
            impact.source()
        ))
        .orElse(new StationResponses.StationArrivalContextResponse(
            false,
            "Schedule active",
            "No active service impacts linked to this station.",
            "normal",
            "LineWatchTO"
        ));
}
```

Pass this into `StationDetailResponse`.

- [ ] **Step 5: Update controller test fixtures**

Every `new StationResponses.StationDetailResponse(...)` call in tests must include:

```java
new StationResponses.StationArrivalContextResponse(
    false,
    "Schedule active",
    "No active service impacts linked to this station.",
    "normal",
    "LineWatchTO"
)
```

- [ ] **Step 6: Run station tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StationServiceTest,StationControllerTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/station backend/src/test/java/com/calebhabesh/linewatch/station
git commit -m "feat: expose station arrival disruption context"
```

## Task 9: Frontend Types And Fallback Data

**Files:**
- Modify: `frontend/src/app/station-data.ts`
- Modify: `frontend/tests/station-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`

- [ ] **Step 1: Update frontend data tests**

In `frontend/tests/station-data.test.mjs`, add:

```javascript
it("labels fallback arrivals as demo and backend contract as schedule-aware", () => {
  const union = fallbackStationDetails.union;

  assert.equal(union.arrivalsSource, "Demo estimates");
  assert.ok(union.arrivals.every((arrival) => arrival.status === "demo"));
  assert.equal(union.arrivalContext.scheduleMayBeDisrupted, false);
  assert.equal(union.arrivalContext.message, "Schedule active");
});
```

- [ ] **Step 2: Run failing fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because `arrivalContext` is not present in frontend fallback details.

- [ ] **Step 3: Update frontend types**

In `frontend/src/app/station-data.ts`, change:

```ts
export type StationArrival = {
  lineId: string;
  direction: string;
  minutes: number | null;
  predictedAt: string | null;
  label: string;
  source: string;
  status: "scheduled" | "live" | "unavailable" | "demo";
};

export type StationArrivalContext = {
  scheduleMayBeDisrupted: boolean;
  message: string;
  reason: string;
  severity: "normal" | StationImpactSeverity;
  source: string;
};
```

Add `arrivalContext: StationArrivalContext` to `StationDetail`.

- [ ] **Step 4: Update fallback detail builder**

In `toFallbackStationDetail`, add:

```ts
arrivalContext: {
  scheduleMayBeDisrupted: false,
  message: "Schedule active",
  reason: "No active service impacts linked to this station.",
  severity: "normal",
  source: "LineWatchTO",
},
```

Keep fallback arrivals as `status: "demo"` and `arrivalsSource: "Demo estimates"` until backend data is available.

- [ ] **Step 5: Update smoke API stub data**

In `frontend/tests/smoke/api-stub-data.mjs`, change station detail arrivals to scheduled rows:

```javascript
arrivals: [
  {
    lineId: "line-1",
    direction: "Northbound to Finch",
    minutes: 3,
    predictedAt: "2026-06-04T09:03:00-04:00",
    label: "3 min",
    source: "TTC scheduled service",
    status: "scheduled",
  },
],
arrivalsSource: "TTC scheduled service",
arrivalContext: {
  scheduleMayBeDisrupted: true,
  message: "Schedule may be disrupted",
  reason: "Line 1 delay near Stub Station",
  severity: "delay",
  source: "TTC Live Alerts",
},
disclaimer: "Scheduled arrivals use TTC timetable data and are not live train predictions.",
```

- [ ] **Step 6: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/app/station-data.ts frontend/tests/station-data.test.mjs frontend/tests/smoke/api-stub-data.mjs
git commit -m "feat: add schedule-aware station arrival data"
```

## Task 10: Frontend Arrivals UI

**Files:**
- Modify: `frontend/src/components/StationDetailPanel.tsx`
- Modify: `frontend/tests/station-panel-layout.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Update layout source tests**

In `frontend/tests/station-panel-layout.test.mjs`, replace the old demo-arrival assertion with:

```javascript
it("renders schedule-aware arrivals and disruption warning", () => {
  assert.match(panelSource, /Schedule may be disrupted/);
  assert.match(panelSource, /data-arrivals-disrupted/);
  assert.match(panelSource, /arrivalContext\.scheduleMayBeDisrupted/);
  assert.match(panelSource, /Line \{arrivalLine\?\.number/);
});
```

- [ ] **Step 2: Run failing layout test**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the UI still labels non-live rows as demo arrivals and has no disruption state.

- [ ] **Step 3: Update arrivals section UI**

In `StationDetailPanel.tsx`, derive:

```tsx
const arrivalsDisrupted = station.arrivalContext.scheduleMayBeDisrupted;
const arrivalSectionClassName = [
  "rounded-lg border p-3 transition-colors",
  arrivalsDisrupted
    ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300"
    : "border-black/10 bg-slate-50 dark:border-white/10 dark:bg-white/5",
].join(" ");
```

Render the heading as:

```tsx
{station.arrivals.every((arrival) => arrival.status === "demo") ? "Demo Arrivals" : "Arrivals"}
```

Render the disruption callout inside the section when `arrivalsDisrupted`:

```tsx
{arrivalsDisrupted && (
  <div className="mt-2 rounded-md border border-slate-300 bg-slate-200/70 p-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
    <p>{station.arrivalContext.message}</p>
    <p className="mt-1 font-medium">{station.arrivalContext.reason}</p>
  </div>
)}
```

Add a line badge to each row:

```tsx
const arrivalLine = station.lines.find((line) => line.id === arrival.lineId);
```

Use:

```tsx
<span
  className="inline-flex h-6 min-w-12 shrink-0 items-center justify-center rounded-md px-2 text-[11px] font-black text-black"
  style={{ backgroundColor: arrivalLine?.color ?? "#cbd5e1" }}
>
  Line {arrivalLine?.number ?? arrival.lineId.replace("line-", "")}
</span>
```

Keep rows stable and readable:

```tsx
<div className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-white p-2 text-sm dark:bg-[#12151c]">
  <div className="flex min-w-0 items-center gap-2">
    ...
    <span className="min-w-0 break-words">{arrival.direction}</span>
  </div>
  <strong className="shrink-0">{arrival.label}</strong>
</div>
```

For unavailable rows, keep:

```tsx
Arrival predictions are currently unavailable.
```

For scheduled rows, show this disclaimer:

```tsx
Scheduled arrivals use TTC timetable data and are not live train predictions.
```

- [ ] **Step 4: Update smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, add assertions to the station detail test:

```ts
await expect(page.getByText("Arrivals")).toBeVisible();
await expect(page.getByText("TTC scheduled service")).toBeVisible();
await expect(page.getByText("Schedule may be disrupted")).toBeVisible();
await expect(page.getByText("Line 1")).toBeVisible();
await expect(page.getByText("Northbound to Finch")).toBeVisible();
await expect(page.getByText("3 min")).toBeVisible();
await expect(page.locator('[data-arrivals-disrupted="true"]')).toBeVisible();
```

- [ ] **Step 5: Run frontend checks for this slice**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/components/StationDetailPanel.tsx frontend/tests/station-panel-layout.test.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "feat: render disrupted scheduled arrivals"
```

## Task 11: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`
- Modify: `docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md`

- [ ] **Step 1: Update README setup docs**

Add a local schedule import section:

````markdown
### Optional Scheduled Arrival Import

Station arrivals use TTC scheduled service when a merged GTFS schedule import is active. Download the public TTC merged GTFS zip and import the rapid-transit subset:

```bash
node scripts/download-ttc-gtfs.mjs /tmp/ttc-merged-gtfs.zip
docker compose up -d postgres redis
scripts/import-ttc-gtfs-schedule.sh /tmp/ttc-merged-gtfs.zip
```

These arrivals are timetable-based estimates, not live train predictions. If no import is active, the station detail API returns a schedule-unavailable state and the frontend fallback remains demo-labeled.
````

- [ ] **Step 2: Update agent instructions**

In `AGENTS.md` and `GEMINI.md`, state:

```markdown
Station arrivals are scheduled rapid-transit estimates when a merged TTC GTFS schedule import is active. They are not live TTC subway/LRT predictions. Surface connections are outside this slice. Do not claim live station arrivals until an official rapid-transit realtime source exists and is integrated with passing verification.
```

- [ ] **Step 3: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run substantial frontend verification**

Run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: PASS. If Playwright cannot run because browsers or services are missing, report the exact failure and keep the commit scoped to verified checks.

- [ ] **Step 6: Run diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. `git status --short` should show only files intended for the final docs commit.

- [ ] **Step 7: Commit**

Run:

```bash
git add README.md AGENTS.md GEMINI.md docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md
git commit -m "docs: document scheduled station arrivals"
```

## Final Verification Checklist

Run these commands before claiming the feature is complete:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git diff --check
git status --short
```

Expected final behavior:

- Station details show `Arrivals` with `TTC scheduled service` when a GTFS import is active.
- Arrival rows show a line badge, direction/headsign, and minutes.
- Scheduled rows are never labeled as live.
- If no schedule import is active, rows show `Unavailable` with scheduled-source unavailable wording.
- Fallback fixture data remains demo-labeled.
- When station service impacts exist, the Arrivals section remains visible, is greyed out, and shows `Schedule may be disrupted`.
- Accessibility outages alone do not grey out arrivals.
- Surface connections are not added.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-scheduled-rapid-transit-arrivals.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Ask the user which approach they want before implementation starts.
