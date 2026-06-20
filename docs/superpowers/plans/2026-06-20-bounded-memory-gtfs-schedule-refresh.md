# Bounded-Memory GTFS Schedule Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic TTC GTFS schedule refresh complete within a bounded Java heap, preserve the previously active schedule on every failed replacement, and expose the latest refresh outcome through `/api/health/schedule`.

**Architecture:** Keep small GTFS files and filtered rapid-transit metadata in memory, but stream the 4.2-million-row `stop_times.txt` twice. The first pass collects only stop IDs used by supported rapid-transit trips; after the required stops, trips, services, and routes are ready, a separate transactional writer streams the second pass into PostgreSQL in batches of 1,000 and atomically activates the candidate import. Reuse `ingestion_runs` with a new `gtfs-schedule` run type so refresh attempts and failures survive process restarts and can be reported by schedule health.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring JDBC transactions, PostgreSQL/PostGIS, Flyway, JUnit 5, AssertJ, Mockito, Maven.

---

## Scope And Operating Constraints

- Keep `JAVA_TOOL_OPTIONS=-Xmx4g` unchanged. The fix must work through bounded allocation rather than a larger heap.
- Keep production `LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=false` until the fixed image is deployed.
- Preserve the existing GTFS foreign keys and the unique active-import constraint.
- Do not insert surface-route stop times.
- Do not deactivate the current import until every replacement row has been inserted successfully.
- Do not add a new dependency.
- Do not expose scheduled arrivals as realtime predictions.
- The current public TTC package is approximately 78 MB compressed, 414 MB uncompressed, and contains approximately 4.2 million stop-time rows. Final verification must use the current public ZIP with a constrained heap.

## File Structure

### Create

- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsSchedulePreparedImport.java`
  - Immutable package-level data produced before database writes: filtered routes, trips, services, stops, station mappings, rapid-transit trip IDs, and service coverage.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriter.java`
  - Transactional replacement writer. Inserts metadata, streams the second stop-time pass in bounded batches, and activates the candidate.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunSnapshot.java`
  - Latest persisted schedule-refresh attempt.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunStore.java`
  - SQL operations for `ingestion_runs` rows with `run_type = 'gtfs-schedule'`.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunService.java`
  - `REQUIRES_NEW` lifecycle boundary for recording refresh start, success, and failure independently of the import transaction.
- `backend/src/main/resources/db/migration/V27__gtfs_schedule_refresh_runs.sql`
  - Extends the existing `ingestion_runs.run_type` check constraint with `gtfs-schedule`.
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriterTest.java`
  - Verifies bounded batch sizes, filtering, activation ordering, and failure behavior.
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunServiceTest.java`
  - Verifies persistent run lifecycle and bounded error messages.
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunMigrationTest.java`
  - Guards the Flyway run-type change.

### Modify

- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJob.java`
- `backend/src/main/java/com/calebhabesh/linewatch/health/ScheduleHealthController.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJobTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/health/ScheduleHealthControllerTest.java`
- `frontend/tests/scenario-scripts.test.mjs`
- `scripts/smoke-deploy.mjs`
- `README.md`
- `AGENTS.md`
- `GEMINI.md`

## Task 1: Add A Streaming CSV Row API

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java`

- [ ] **Step 1: Write the failing streaming-reader tests**

Add tests that prove rows are delivered incrementally and that the existing list API retains its behavior:

```java
@Test
void streamsRowsToTheConsumerWithoutReturningACollection() throws Exception {
    String csv = """
        trip_id,stop_id,stop_sequence
        L1_A,UNION_N,1
        L1_A,KING_N,2
        """;
    List<String> observed = new ArrayList<>();

    GtfsCsvReader.forEachRow(
        new StringReader(csv),
        row -> observed.add(row.value("trip_id") + ":" + row.value("stop_id"))
    );

    assertThat(observed).containsExactly("L1_A:UNION_N", "L1_A:KING_N");
}

@Test
void streamingReaderStripsTheByteOrderMark() throws Exception {
    String csv = "\uFEFFtrip_id,stop_id\nL1_A,UNION_N\n";
    List<String> observed = new ArrayList<>();

    GtfsCsvReader.forEachRow(
        new StringReader(csv),
        row -> observed.add(row.value("trip_id"))
    );

    assertThat(observed).containsExactly("L1_A");
}
```

Import `java.util.ArrayList`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsCsvReaderTest test
```

Expected: compilation fails because `GtfsCsvReader.forEachRow` does not exist.

- [ ] **Step 3: Implement the streaming API and retain `read` as a compatibility wrapper**

Refactor `GtfsCsvReader` so `forEachRow` owns line-by-line parsing and `read` only collects when callers explicitly need a list:

```java
public static void forEachRow(Reader reader, Consumer<Row> consumer) throws IOException {
    try (BufferedReader buffered = new BufferedReader(reader)) {
        String headerLine = buffered.readLine();
        if (headerLine == null || headerLine.isBlank()) {
            return;
        }
        List<String> headers = parseLine(headerLine);
        if (!headers.isEmpty()) {
            headers.set(0, stripByteOrderMark(headers.getFirst()));
        }
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
            consumer.accept(new Row(byHeader));
        }
    }
}

public static List<Row> read(Reader reader) throws IOException {
    List<Row> rows = new ArrayList<>();
    forEachRow(reader, rows::add);
    return rows;
}
```

Import `java.util.function.Consumer`. Remove the old duplicate buffering loop from `read`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsCsvReaderTest test
```

Expected: all `GtfsCsvReaderTest` tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReader.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsCsvReaderTest.java
git commit -m "refactor: stream GTFS CSV rows"
```

## Task 2: Prepare Rapid-Transit Metadata Without Materializing Feed Rows

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsSchedulePreparedImport.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java`

- [ ] **Step 1: Rewrite the import-service test around a preparation/writer boundary**

Mock a new `GtfsScheduleImportWriter`, keep the existing miniature ZIP, and verify that preparation retains only rapid-transit records before delegation:

```java
GtfsScheduleImportWriter writer = mock(GtfsScheduleImportWriter.class);
when(writer.write(eq(zip), eq("test-source"), any()))
    .thenReturn(new GtfsScheduleImportService.ImportSummary(42L, 1, 3, 1, 1, 1, 2, 2));

GtfsScheduleImportService service = new GtfsScheduleImportService(writer);

GtfsScheduleImportService.ImportSummary summary = service.importZip(zip, "test-source");

ArgumentCaptor<GtfsSchedulePreparedImport> prepared =
    ArgumentCaptor.forClass(GtfsSchedulePreparedImport.class);
verify(writer).write(eq(zip), eq("test-source"), prepared.capture());

assertThat(prepared.getValue().routes())
    .extracting(GtfsImportModels.RouteRow::lineId)
    .containsExactly("line-1");
assertThat(prepared.getValue().trips())
    .extracting(GtfsImportModels.TripRow::tripId)
    .containsExactly("L1_N_1");
assertThat(prepared.getValue().rapidTransitTripIds()).containsExactly("L1_N_1");
assertThat(prepared.getValue().stops())
    .extracting(GtfsImportModels.StopRow::stopId)
    .containsExactlyInAnyOrder("UNION", "UNION_N", "UNION_S");
assertThat(summary.stopTimes()).isEqualTo(2);
```

Remove repository insertion assertions from this test; those move to `GtfsScheduleImportWriterTest`.

- [ ] **Step 2: Add a regression fixture proving the first pass ignores surface stop times**

Extend the miniature ZIP with at least one surface trip and surface stop-time row, then assert:

```java
assertThat(prepared.getValue().stops())
    .extracting(GtfsImportModels.StopRow::stopId)
    .doesNotContain("QUEEN_SURFACE");
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportServiceTest test
```

Expected: compilation fails because `GtfsSchedulePreparedImport`, `GtfsScheduleImportWriter`, and the new constructor do not exist.

- [ ] **Step 4: Add the prepared-import record**

Create:

```java
package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

record GtfsSchedulePreparedImport(
    List<GtfsImportModels.RouteRow> routes,
    List<GtfsImportModels.StopRow> stops,
    List<GtfsImportModels.ServiceRow> services,
    List<GtfsImportModels.ServiceExceptionRow> serviceExceptions,
    List<GtfsImportModels.TripRow> trips,
    List<GtfsImportModels.StationStopRow> stationStops,
    Set<String> rapidTransitTripIds,
    LocalDate serviceStart,
    LocalDate serviceEnd
) {
    GtfsSchedulePreparedImport {
        routes = List.copyOf(routes);
        stops = List.copyOf(stops);
        services = List.copyOf(services);
        serviceExceptions = List.copyOf(serviceExceptions);
        trips = List.copyOf(trips);
        stationStops = List.copyOf(stationStops);
        rapidTransitTripIds = Set.copyOf(rapidTransitTripIds);
    }
}
```

- [ ] **Step 5: Refactor `GtfsScheduleImportService` into preparation plus delegation**

Change the constructor to:

```java
public GtfsScheduleImportService(GtfsScheduleImportWriter writer) {
    this.writer = writer;
}
```

Make every GTFS entry use `GtfsCsvReader.forEachRow`. In particular, the first `stop_times.txt` pass must retain only stop IDs:

```java
Set<String> rapidTransitStopIds = new HashSet<>();
forEachRow(zipFile, "stop_times.txt", row -> {
    if (rapidTransitTripIds.contains(row.value("trip_id"))) {
        rapidTransitStopIds.add(row.value("stop_id"));
    }
});
```

Add this private helper so missing required entries fail clearly:

```java
private void forEachRow(
    ZipFile zipFile,
    String entryName,
    Consumer<GtfsCsvReader.Row> consumer
) throws IOException {
    ZipEntry entry = zipFile.getEntry(entryName);
    if (entry == null) {
        throw new IOException("TTC GTFS zip did not contain " + entryName);
    }
    try (InputStream input = zipFile.getInputStream(entry);
         InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
        GtfsCsvReader.forEachRow(reader, consumer);
    }
}
```

Use the required helper for `routes.txt`, `trips.txt`, `stop_times.txt`, `stops.txt`, and `calendar.txt`. Preserve `calendar_dates.txt` as optional with a second helper that returns without invoking the consumer when the entry is absent.

Continue resolving parent stops and station aliases exactly as the current importer does. Construct `GtfsSchedulePreparedImport` after the first pass, close the preparation `ZipFile`, then delegate:

```java
return writer.write(zipPath, sourceUrl, prepared);
```

Do not retain any `GtfsCsvReader.Row` collection.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsCsvReaderTest,GtfsScheduleImportServiceTest test
```

Expected: both test classes pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsSchedulePreparedImport.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportServiceTest.java
git commit -m "refactor: prepare GTFS imports with bounded memory"
```

## Task 3: Batch Stop Times Inside One Atomic Replacement Transaction

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriter.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriterTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java`

- [ ] **Step 1: Write a failing multi-batch writer test**

Generate a ZIP containing 2,501 rapid-transit stop-time rows plus surface rows. Prepare only the rapid trip ID and use a mocked repository:

```java
when(repository.beginReplacementImport(
    eq("TTC merged GTFS schedule"),
    eq("test-source"),
    any(),
    eq(LocalDate.parse("2026-06-01")),
    eq(LocalDate.parse("2026-12-31"))
)).thenReturn(42L);

GtfsScheduleImportWriter writer = new GtfsScheduleImportWriter(
    repository,
    Clock.fixed(Instant.parse("2026-06-04T12:00:00Z"), ZoneOffset.UTC)
);

GtfsScheduleImportService.ImportSummary summary =
    writer.write(zip, "test-source", preparedImport(Set.of("L1_N_1")));

ArgumentCaptor<List<GtfsImportModels.StopTimeRow>> batches =
    ArgumentCaptor.forClass(List.class);
verify(repository, times(3)).insertStopTimes(eq(42L), batches.capture());

assertThat(batches.getAllValues())
    .extracting(List::size)
    .containsExactly(1000, 1000, 501);
assertThat(batches.getAllValues())
    .allSatisfy(batch -> assertThat(batch).hasSizeLessThanOrEqualTo(1000));
assertThat(summary.stopTimes()).isEqualTo(2501);
```

Also use Mockito `InOrder` to prove activation occurs after the final stop-time batch and station-stop insert:

```java
InOrder order = inOrder(repository);
order.verify(repository).beginReplacementImport(any(), any(), any(), any(), any());
order.verify(repository).insertRoutes(eq(42L), any());
order.verify(repository).insertStops(eq(42L), any());
order.verify(repository).insertServices(eq(42L), any());
order.verify(repository).insertServiceExceptions(eq(42L), any());
order.verify(repository).insertTrips(eq(42L), any());
order.verify(repository, times(3)).insertStopTimes(eq(42L), any());
order.verify(repository).insertStationStops(eq(42L), any());
order.verify(repository).activateImport(42L);
```

- [ ] **Step 2: Add a failing test for replacement failure**

Make the second batch throw and prove activation is never attempted:

```java
doNothing()
    .doThrow(new IllegalStateException("database write failed"))
    .when(repository)
    .insertStopTimes(eq(42L), any());

assertThatThrownBy(() -> writer.write(zip, "test-source", prepared))
    .isInstanceOf(IllegalStateException.class)
    .hasMessage("database write failed");

verify(repository, never()).activateImport(anyLong());
```

Add a reflection assertion guarding the transaction contract:

```java
Transactional transactional = GtfsScheduleImportWriter.class
    .getMethod("write", Path.class, String.class, GtfsSchedulePreparedImport.class)
    .getAnnotation(Transactional.class);

assertThat(transactional).isNotNull();
assertThat(transactional.rollbackFor()).contains(Exception.class);
```

- [ ] **Step 3: Run the writer test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportWriterTest test
```

Expected: compilation fails because `GtfsScheduleImportWriter` does not exist.

- [ ] **Step 4: Create the transactional writer**

Create `GtfsScheduleImportWriter` with:

```java
@Service
public class GtfsScheduleImportWriter {
    static final int STOP_TIME_BATCH_SIZE = 1000;

    private final GtfsScheduleImportRepository repository;
    private final Clock clock;

    public GtfsScheduleImportWriter(GtfsScheduleImportRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(rollbackFor = Exception.class)
    public GtfsScheduleImportService.ImportSummary write(
        Path zipPath,
        String sourceUrl,
        GtfsSchedulePreparedImport prepared
    ) throws IOException {
        long importId = repository.beginReplacementImport(
            "TTC merged GTFS schedule",
            sourceUrl,
            OffsetDateTime.now(clock),
            prepared.serviceStart(),
            prepared.serviceEnd()
        );

        repository.insertRoutes(importId, prepared.routes());
        repository.insertStops(importId, prepared.stops());
        repository.insertServices(importId, prepared.services());
        repository.insertServiceExceptions(importId, prepared.serviceExceptions());
        repository.insertTrips(importId, prepared.trips());

        StopTimeBatcher batcher = new StopTimeBatcher(
            repository,
            importId,
            prepared.rapidTransitTripIds()
        );
        streamStopTimes(zipPath, batcher::accept);
        batcher.finish();

        repository.insertStationStops(importId, prepared.stationStops());
        repository.activateImport(importId);

        return new GtfsScheduleImportService.ImportSummary(
            importId,
            prepared.routes().size(),
            prepared.stops().size(),
            prepared.services().size(),
            prepared.serviceExceptions().size(),
            prepared.trips().size(),
            batcher.totalRows(),
            prepared.stationStops().size()
        );
    }
}
```

Implement `streamStopTimes` by reopening the ZIP and passing `stop_times.txt` to `GtfsCsvReader.forEachRow`.

Implement a private `StopTimeBatcher` that:

- Returns immediately when `trip_id` is not in `rapidTransitTripIds`.
- Converts matching rows directly to `GtfsImportModels.StopTimeRow`.
- Flushes at exactly 1,000 rows.
- Passes `List.copyOf(batch)` to the repository.
- Clears the mutable buffer after each flush.
- Flushes the final partial batch from `finish()`.
- Tracks the total number of matching rows.

The `accept` conversion is:

```java
batch.add(new GtfsImportModels.StopTimeRow(
    tripId,
    row.value("stop_id"),
    GtfsCsvReader.seconds(row.value("arrival_time")),
    GtfsCsvReader.seconds(row.value("departure_time")),
    Integer.parseInt(row.value("stop_sequence"))
));
```

- [ ] **Step 5: Remove the nested transaction from `activateImport`**

`GtfsScheduleImportWriter.write` now owns the complete replacement transaction. Remove `@Transactional` from `GtfsScheduleImportRepository.activateImport`; leave its two SQL updates unchanged:

```java
public void activateImport(long importId) {
    jdbc.update(
        "update gtfs_schedule_imports set active = false where active = true",
        Map.of()
    );
    jdbc.update(
        "update gtfs_schedule_imports set active = true where id = :importId",
        Map.of("importId", importId)
    );
}
```

- [ ] **Step 6: Run import tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=GtfsCsvReaderTest,GtfsScheduleImportServiceTest,GtfsScheduleImportWriterTest \
  test
```

Expected: all three test classes pass. The writer test reports three bounded batches and never activates after a simulated batch failure.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriter.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportRepository.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriterTest.java
git commit -m "fix: batch GTFS stop time imports atomically"
```

## Task 4: Persist Schedule Refresh Attempts

**Files:**

- Create: `backend/src/main/resources/db/migration/V27__gtfs_schedule_refresh_runs.sql`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunSnapshot.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunStore.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunMigrationTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunServiceTest.java`

- [ ] **Step 1: Write the failing migration test**

```java
@Test
void v27AllowsPersistedGtfsScheduleRefreshRuns() throws Exception {
    String sql = migrationSql("/db/migration/V27__gtfs_schedule_refresh_runs.sql");

    assertThat(sql).contains("drop constraint ingestion_runs_run_type_check");
    assertThat(sql).contains("'alerts', 'gtfs-static', 'gtfs-schedule'");
}
```

Use the same `migrationSql` helper pattern as `GtfsScheduleSchemaMigrationTest`.

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleRefreshRunMigrationTest test
```

Expected: failure because the V27 migration does not exist.

- [ ] **Step 3: Add the Flyway migration**

Create:

```sql
alter table ingestion_runs
    drop constraint ingestion_runs_run_type_check;

alter table ingestion_runs
    add constraint ingestion_runs_run_type_check
    check (run_type in ('alerts', 'gtfs-static', 'gtfs-schedule'));
```

- [ ] **Step 4: Write the failing run-service tests**

Test independent lifecycle writes using a mocked store and fixed clock:

```java
@Test
void startsAndCompletesScheduleRefreshRuns() {
    when(store.createRunning(OffsetDateTime.parse("2026-06-20T19:00:00Z")))
        .thenReturn(17L);

    long id = service.start();
    service.succeed(id, summary);

    assertThat(id).isEqualTo(17L);
    verify(store).markSuccess(
        17L,
        OffsetDateTime.parse("2026-06-20T19:00:00Z"),
        summary.stopTimes()
    );
}

@Test
void truncatesPersistedFailureMessagesToOneThousandCharacters() {
    service.fail(17L, new IllegalStateException("x".repeat(1200)));

    ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
    verify(store).markFailed(
        eq(17L),
        eq(OffsetDateTime.parse("2026-06-20T19:00:00Z")),
        message.capture()
    );
    assertThat(message.getValue()).hasSize(1000);
}
```

Also reflect on `start`, `succeed`, and `fail` to assert each uses:

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
```

- [ ] **Step 5: Implement the snapshot, store, and service**

Snapshot:

```java
public record GtfsScheduleRefreshRunSnapshot(
    long id,
    String status,
    OffsetDateTime startedAt,
    OffsetDateTime completedAt,
    int recordsProcessed,
    String errorMessage
) {}
```

Store SQL must always filter on `run_type = 'gtfs-schedule'`:

```sql
insert into ingestion_runs (run_type, status, started_at)
values ('gtfs-schedule', 'running', :startedAt)
returning id
```

```sql
update ingestion_runs set
    status = 'success',
    completed_at = :completedAt,
    records_processed = :recordsProcessed,
    error_message = null
where id = :id and run_type = 'gtfs-schedule'
```

```sql
update ingestion_runs set
    status = 'failed',
    completed_at = :completedAt,
    error_message = :errorMessage
where id = :id and run_type = 'gtfs-schedule'
```

```sql
select id, status, started_at, completed_at, records_processed, error_message
from ingestion_runs
where run_type = 'gtfs-schedule'
order by started_at desc
limit 1
```

The service should mirror `IngestionRunService`, use a maximum error length of 1,000, and expose:

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public long start()

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void succeed(long id, GtfsScheduleImportService.ImportSummary summary)

@Transactional(propagation = Propagation.REQUIRES_NEW)
public void fail(long id, Throwable failure)

public Optional<GtfsScheduleRefreshRunSnapshot> latest()
```

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=GtfsScheduleRefreshRunMigrationTest,GtfsScheduleRefreshRunServiceTest \
  test
```

Expected: both test classes pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V27__gtfs_schedule_refresh_runs.sql \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunSnapshot.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunStore.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunService.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunMigrationTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshRunServiceTest.java
git commit -m "feat: persist GTFS schedule refresh outcomes"
```

## Task 5: Wire Refresh Lifecycle And Error Handling

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJob.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJobTest.java`

- [ ] **Step 1: Add failing success and failure lifecycle assertions**

Add a mocked `GtfsScheduleRefreshRunService` to the job fixture:

```java
private final GtfsScheduleRefreshRunService runService =
    mock(GtfsScheduleRefreshRunService.class);
```

For a successful import:

```java
when(runService.start()).thenReturn(17L);
when(importService.importZip(Path.of("/tmp/ttc-gtfs.zip"), "https://example.test/gtfs.zip"))
    .thenReturn(summary);

job.refresh();

verify(runService).succeed(17L, summary);
verify(runService, never()).fail(anyLong(), any());
```

For an ordinary failure:

```java
when(runService.start()).thenReturn(17L);
when(downloadClient.downloadCurrentZip())
    .thenThrow(new IOException("CKAN unavailable"));

job.refresh();

verify(runService).fail(eq(17L), any(IOException.class));
verify(runService, never()).succeed(anyLong(), any());
```

For an `Error`, verify best-effort persistence and rethrow:

```java
OutOfMemoryError failure = new OutOfMemoryError("simulated");
when(runService.start()).thenReturn(17L);
when(downloadClient.downloadCurrentZip()).thenThrow(failure);

assertThatThrownBy(job::refresh).isSameAs(failure);
verify(runService).fail(17L, failure);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleRefreshJobTest test
```

Expected: compilation or verification failure because the job does not use the run service.

- [ ] **Step 3: Implement refresh lifecycle recording**

Inject `GtfsScheduleRefreshRunService`. Start a run only when `shouldRefresh` is true:

```java
long runId = runService.start();
GtfsScheduleDownloadClient.DownloadedGtfs download = null;
try {
    download = downloadClient.downloadCurrentZip();
    GtfsScheduleImportService.ImportSummary summary =
        importService.importZip(download.zipPath(), download.sourceUrl());
    runService.succeed(runId, summary);
    log.info(
        "Imported TTC GTFS schedule importId={} routes={} trips={} stopTimes={} stationStops={}",
        summary.importId(),
        summary.routes(),
        summary.trips(),
        summary.stopTimes(),
        summary.stationStops()
    );
} catch (Exception exception) {
    runService.fail(runId, exception);
    log.error("TTC GTFS schedule refresh failed", exception);
} catch (Error error) {
    try {
        runService.fail(runId, error);
    } catch (RuntimeException recordingFailure) {
        error.addSuppressed(recordingFailure);
    }
    log.error("TTC GTFS schedule refresh failed with an unrecoverable error", error);
    throw error;
} finally {
    // Retain the existing temp-file deletion behavior.
}
```

Do not create a run when refresh is disabled or the active import has more than the configured minimum days remaining.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleRefreshJobTest test
```

Expected: all refresh-job tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJob.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleRefreshJobTest.java
git commit -m "fix: track GTFS schedule refresh lifecycle"
```

## Task 6: Expose Refresh State Through Schedule Health

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/health/ScheduleHealthController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/health/ScheduleHealthControllerTest.java`
- Modify: `scripts/smoke-deploy.mjs`
- Modify: `frontend/tests/scenario-scripts.test.mjs`

- [ ] **Step 1: Add failing schedule-health tests**

Inject a mocked `GtfsScheduleRefreshRunService` into the controller.

Test no import plus failed refresh:

```java
when(repository.findActiveImport()).thenReturn(Optional.empty());
when(refreshRunService.latest()).thenReturn(Optional.of(new GtfsScheduleRefreshRunSnapshot(
    19L,
    "failed",
    OffsetDateTime.parse("2026-06-20T19:04:20Z"),
    OffsetDateTime.parse("2026-06-20T19:05:15Z"),
    0,
    "Java heap space"
)));

ScheduleHealthResponse response = controller.schedule();

assertThat(response.status()).isEqualTo("not-imported");
assertThat(response.scheduleActive()).isFalse();
assertThat(response.refreshStatus()).isEqualTo("failed");
assertThat(response.refreshErrorMessage()).isEqualTo("Java heap space");
assertThat(response.refreshCompletedAt())
    .isEqualTo(OffsetDateTime.parse("2026-06-20T19:05:15Z"));
```

Test active import plus a newer failed refresh:

```java
assertThat(response.status()).isEqualTo("active");
assertThat(response.scheduleActive()).isTrue();
assertThat(response.refreshStatus()).isEqualTo("failed");
```

This proves a failed replacement does not hide a still-valid previous schedule.

Test no run:

```java
when(refreshRunService.latest()).thenReturn(Optional.empty());
assertThat(controller.schedule().refreshStatus()).isEqualTo("never-run");
```

- [ ] **Step 2: Run the controller test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ScheduleHealthControllerTest test
```

Expected: compilation fails because refresh fields and dependency do not exist.

- [ ] **Step 3: Extend the response without changing existing schedule semantics**

Add these fields after `serviceDaysRemaining`:

```java
String refreshStatus,
OffsetDateTime refreshStartedAt,
OffsetDateTime refreshCompletedAt,
Integer refreshRecordsProcessed,
String refreshErrorMessage,
String message
```

Map no refresh row to:

```java
new RefreshHealth("never-run", null, null, null, null)
```

Map a persisted row directly. Keep `status` and `scheduleActive` based only on the active import and its service date coverage. This distinction is required:

- `status`: availability of currently imported schedule data.
- `refreshStatus`: outcome of the latest replacement attempt.

When no active import exists and the latest refresh failed, use:

```text
No TTC GTFS schedule import is active; the latest refresh failed.
```

- [ ] **Step 4: Strengthen deployment smoke response-shape checks**

Change `scripts/smoke-deploy.mjs` so schedule health also requires:

```javascript
Object.hasOwn(body, "refreshStatus") &&
Object.hasOwn(body, "refreshStartedAt") &&
Object.hasOwn(body, "refreshCompletedAt") &&
Object.hasOwn(body, "refreshErrorMessage")
```

Do not require `scheduleActive === true`; deployment must remain operable when an external TTC refresh is temporarily unavailable.

Update `frontend/tests/scenario-scripts.test.mjs` to assert that the smoke script contains `refreshStatus` and `refreshErrorMessage`.

- [ ] **Step 5: Run focused backend and frontend tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ScheduleHealthControllerTest test
npm --prefix frontend run test:fixtures
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/health/ScheduleHealthController.java \
  backend/src/test/java/com/calebhabesh/linewatch/health/ScheduleHealthControllerTest.java \
  scripts/smoke-deploy.mjs \
  frontend/tests/scenario-scripts.test.mjs
git commit -m "feat: expose GTFS refresh health"
```

## Task 7: Verify The Current TTC Feed Under A Constrained Heap

**Files:**

- No production source changes.
- Runtime artifacts only under `/tmp`.

- [ ] **Step 1: Start local infrastructure**

Run:

```bash
docker compose up -d postgres redis
docker compose ps
```

Expected: `postgres` and `redis` report healthy.

- [ ] **Step 2: Download the current public merged TTC GTFS ZIP**

Run:

```bash
node scripts/download-ttc-gtfs.mjs /tmp/linewatch-current-ttc-gtfs.zip
ls -lh /tmp/linewatch-current-ttc-gtfs.zip
unzip -l /tmp/linewatch-current-ttc-gtfs.zip | grep -E 'routes.txt|trips.txt|stops.txt|stop_times.txt|calendar.txt'
```

Expected: a non-empty ZIP containing all required GTFS entries.

- [ ] **Step 3: Create an isolated verification database**

Run:

```bash
if ! docker compose exec -T postgres psql -U linewatch -d postgres -Atc \
  "select 1 from pg_database where datname = 'linewatch_gtfs_verify'" | grep -q 1; then
  docker compose exec -T postgres psql -U linewatch -d postgres \
    -c "create database linewatch_gtfs_verify"
fi
```

Expected: `CREATE DATABASE`, or no-op if the dedicated verification database already exists.

- [ ] **Step 4: Run the real import with a 1 GB heap**

Run the backend against the isolated database:

```bash
JAVA_TOOL_OPTIONS=-Xmx1g \
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5434/linewatch_gtfs_verify \
SPRING_DATASOURCE_USERNAME=linewatch \
SPRING_DATASOURCE_PASSWORD=linewatch_dev_password \
SPRING_DATA_REDIS_HOST=127.0.0.1 \
SPRING_DATA_REDIS_PORT=6380 \
SERVER_PORT=8088 \
LINEWATCH_ARRIVALS_ENABLED=true \
LINEWATCH_ARRIVALS_PROVIDER=scheduled \
LINEWATCH_ARRIVALS_GTFS_IMPORT_ENABLED=true \
LINEWATCH_ARRIVALS_GTFS_ZIP_PATH=/tmp/linewatch-current-ttc-gtfs.zip \
mvn -f backend/pom.xml spring-boot:run
```

Expected log:

```text
Imported TTC GTFS schedule
```

The process remains running after import. In another terminal, continue with the next steps, then stop it with `Ctrl-C`.

- [ ] **Step 5: Verify schedule health and imported row scope**

Run:

```bash
curl -fsS http://127.0.0.1:8088/api/health/schedule
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -c \
  "select active, service_start, service_end from gtfs_schedule_imports order by id desc limit 1"
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -c \
  "select count(*) as routes from gtfs_routes"
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -c \
  "select count(*) as trips from gtfs_trips"
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -c \
  "select count(*) as stop_times from gtfs_stop_times"
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -c \
  "select distinct route_short_name from gtfs_routes order by route_short_name"
```

Expected:

- The import is active.
- Route short names contain only `1`, `2`, `4`, `5`, and `6`.
- Trip and stop-time counts are non-zero.
- The backend completed under `-Xmx1g` without `OutOfMemoryError`.

- [ ] **Step 6: Verify failure preserves an active import**

Record the active import ID:

```bash
docker compose exec -T postgres psql -U linewatch -d linewatch_gtfs_verify -Atc \
  "select id from gtfs_schedule_imports where active = true"
```

Run the focused failure unit test again:

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportWriterTest test
```

Expected: the simulated second-batch failure passes its assertion that activation is never called. The transaction annotation test confirms checked and runtime failures roll back the candidate.

- [ ] **Step 7: Stop the verification backend and remove only the dedicated test database**

Stop the Maven process with `Ctrl-C`, then run:

```bash
docker compose exec -T postgres psql -U linewatch -d postgres \
  -c "drop database if exists linewatch_gtfs_verify with (force)"
```

Expected: only `linewatch_gtfs_verify` is removed.

## Task 8: Documentation And Full Verification

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update operational documentation**

Document these facts in `README.md`:

- Automatic GTFS refresh uses a two-pass streaming import.
- `stop_times.txt` rows are inserted in bounded batches.
- The old active schedule remains available until the candidate transaction commits.
- `/api/health/schedule` reports both active schedule availability and latest refresh outcome.
- `JAVA_TOOL_OPTIONS=-Xmx4g` is acceptable production headroom but is not the correctness mechanism.
- Refresh should remain disabled after an OOM until a bounded-memory release is deployed.

- [ ] **Step 2: Update agent guidance consistently**

Add the bounded-memory and health behavior to the Current Reality and Backend Direction sections of `AGENTS.md`, then copy the same guidance into `GEMINI.md`. Keep the existing warning that scheduled arrivals are timetable estimates rather than realtime predictions.

- [ ] **Step 3: Run the complete backend suite**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [ ] **Step 4: Run required frontend checks affected by the smoke-contract change**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all three commands pass.

- [ ] **Step 5: Run release-tool and shell checks**

Run:

```bash
bash -n scripts/prod-build-push.sh scripts/prod-deploy.sh scripts/prod-compose.sh
bash scripts/tests/prod-release-tools.test.sh
```

Expected: shell syntax and production release tests pass.

- [ ] **Step 6: Review the final diff for scope and consistency**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff -- backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule \
  backend/src/main/java/com/calebhabesh/linewatch/health/ScheduleHealthController.java \
  backend/src/main/resources/db/migration \
  backend/src/test \
  scripts/smoke-deploy.mjs \
  frontend/tests/scenario-scripts.test.mjs \
  README.md AGENTS.md GEMINI.md
```

Expected:

- No whitespace errors.
- No unrelated files changed.
- `AGENTS.md` and `GEMINI.md` contain matching project guidance.
- No production secret or downloaded GTFS ZIP is tracked.

- [ ] **Step 7: Commit documentation and verification contract**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document bounded GTFS schedule refresh"
```

## Task 9: Production Rollout And Recovery Verification

**Files:**

- Production server `.env.production` remains server-local and untracked.

- [ ] **Step 1: Build and publish the verified release from a clean development-server worktree**

Run:

```bash
git status --short
scripts/prod-build-push.sh
```

Expected: the worktree is clean and the script publishes frontend, backend, and PostGIS images under one full Git SHA.

- [ ] **Step 2: Back up production before deployment**

On the Oracle VPS:

```bash
git pull --ff-only
scripts/prod-backup-postgres.sh
```

Expected: a timestamped compressed PostgreSQL dump is created.

- [ ] **Step 3: Deploy the immutable release while refresh remains disabled**

Keep:

```dotenv
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=false
JAVA_TOOL_OPTIONS=-Xmx4g
```

Deploy:

```bash
RELEASE_SHA="$(git rev-parse HEAD)"
scripts/prod-deploy.sh "$RELEASE_SHA"
```

Verify `RELEASE_SHA` equals the exact SHA printed by `scripts/prod-build-push.sh` before running the deployment command.

Expected: all Compose services become healthy.

- [ ] **Step 4: Re-enable automatic schedule refresh and recreate only the backend**

Edit the server-local `.env.production`:

```dotenv
LINEWATCH_ARRIVALS_GTFS_REFRESH_ENABLED=true
LINEWATCH_ARRIVALS_GTFS_REFRESH_INITIAL_DELAY=PT30S
LINEWATCH_ARRIVALS_GTFS_REFRESH_FIXED_DELAY=PT24H
JAVA_TOOL_OPTIONS=-Xmx4g
```

Then run:

```bash
scripts/prod-compose.sh up -d --no-build --force-recreate --wait backend
```

Expected: backend becomes healthy and starts one refresh after approximately 30 seconds.

- [ ] **Step 5: Observe the first production refresh**

Run:

```bash
scripts/prod-compose.sh logs -f backend
```

Expected:

- One successful `Imported TTC GTFS schedule` log.
- No `OutOfMemoryError`.
- No backend restart.

In another terminal:

```bash
watch -n 10 'curl -fsS https://linewatchto.ca/api/health/schedule'
```

Expected transition:

```text
refreshStatus: running
```

then:

```text
status: active
scheduleActive: true
refreshStatus: success
refreshErrorMessage: null
```

- [ ] **Step 6: Verify container and application stability**

Run:

```bash
docker inspect \
  --format 'restarts={{.RestartCount}} oom={{.State.OOMKilled}} status={{.State.Status}}' \
  "$(scripts/prod-compose.sh ps -q backend)"
docker stats --no-stream \
  "$(scripts/prod-compose.sh ps -q backend)"
LINEWATCH_DEPLOY_FRONTEND_URL=https://linewatchto.ca \
LINEWATCH_DEPLOY_BACKEND_URL=https://api.linewatchto.ca \
node scripts/smoke-deploy.mjs
```

Expected:

- `restarts=0`
- `oom=false`
- `status=running`
- Public smoke checks pass.

- [ ] **Step 7: Verify a station returns source-labeled scheduled estimates**

Open a mapped station after the imported GTFS service-start date and verify:

- The source is TTC scheduled service.
- The UI describes arrivals as scheduled estimates.
- No copy claims live train predictions.

If the imported service starts on a future date, schedule health may be active while current-day station departures remain unavailable until that date. Treat that as correct behavior.

## Completion Criteria

The work is complete only when all of the following are true:

- No code path materializes the complete `stop_times.txt`.
- The current public TTC merged GTFS ZIP imports successfully with `JAVA_TOOL_OPTIONS=-Xmx1g` on the development server.
- Every stop-time repository call contains at most 1,000 rows.
- Only Lines 1, 2, 4, 5, and 6 are persisted.
- A failed candidate never replaces the previously active import.
- Refresh start, success, and failure survive backend restarts in `ingestion_runs`.
- `/api/health/schedule` distinguishes schedule availability from latest refresh outcome.
- Backend tests, frontend fixture tests, typecheck, lint, release-tool tests, and public deployment smoke checks pass.
- Production backend reports no OOM kill, no restart, an active schedule, and a successful latest refresh.
