# GTFS-RT Source Policy And Alert Lifecycle History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TTC GTFS-RT service alerts an explicit opt-in diagnostic supplement, and add an in-app alert lifecycle history showing alert openings, meaningful updates, and clearances for Today, 7 days, and 30 days.

**Architecture:** Keep TTC Live Alerts as the normal dashboard source and keep GTFS-RT disabled by default unless an environment flag enables the supplement. Build alert history from the existing `snapshots` lifecycle stream, enriching future snapshot rows with enough normalized alert facts to render a useful timeline without replaying raw feeds or creating a separate push-notification-history table. Expose `GET /api/alert-history`, then render the history inside the existing Notifications panel above push settings.

**Tech Stack:** Java 21, Spring Boot, Spring JDBC, Flyway, PostgreSQL, Next.js App Router, React, TypeScript, Node built-in tests, Maven.

---

## Product Contract

### GTFS-RT source policy

- TTC Live Alerts remains the primary source for subway/LRT alert cards and notifications.
- GTFS-RT service-alert ingestion remains available only when explicitly enabled with `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=true`.
- When disabled, the backend must not fetch `https://gtfsrt.ttc.ca/alerts/all?format=text`.
- Existing GTFS-RT parser, normalizer, and duplicate-matcher tests should remain because this path is still useful for controlled diagnostics.
- README must state that GTFS-RT service alerts are opt-in and may be less structured than Live Alerts.

### Alert lifecycle history

- The history is app-wide alert history, not per-user push-delivery history.
- The history includes:
  - `opened`: first visible normalized alert snapshot, or reactivation after a prior clearance;
  - `updated`: normalized fingerprint changed while the alert remained active;
  - `cleared`: LineWatch detected the normalized alert disappeared from a successful fresh poll.
- The default view is `Today`.
- Additional periods are `7 days` and `30 days`.
- Clearances are included by default. The user can filter the local view to all events, alerts/updates only, or clearances only.
- Each history item includes details when available:
  - line number/name;
  - event type;
  - affected location;
  - direction;
  - cause/reason;
  - source label;
  - time;
  - cleared time and duration for grouped incidents when both open and cleared times are known.
- Do not log every poll. Use the existing snapshot behavior: new alert, meaningful normalized change, reactivation, and deactivation only.
- Do not claim history is complete before the app existed. Existing snapshot rows can be backfilled from current `alerts` rows where possible, but rich history starts once enriched snapshots are deployed.

## File Map

### Create

- `backend/src/main/resources/db/migration/V30__alert_history_snapshot_context.sql`
  - Adds renderable context columns and indexes to `snapshots`.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryResponses.java`
  - API response records for lifecycle history.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryRepository.java`
  - Reads classified snapshot lifecycle events from PostgreSQL.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryService.java`
  - Period handling, source labels, location labels, grouping, and DTO mapping.
- `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryServiceTest.java`
  - Unit tests for period handling, event classification inputs, labels, grouping, and duration.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionPropertiesTest.java`
  - Guard that GTFS-RT service-alert supplement is off by default. If this file already exists from prior work, update it rather than creating a duplicate.
- `frontend/src/app/alert-history-data.ts`
  - API adapter, types, and empty fallback for `/api/alert-history`.
- `frontend/src/components/AlertHistoryTimeline.tsx`
  - Client component rendering period/filter controls and timeline/grouped incidents.
- `frontend/tests/alert-history-data.test.mjs`
  - Adapter tests.
- `frontend/tests/alert-history-ui.test.mjs`
  - Source/contract tests for UI integration.

### Modify

- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java`
  - Default `surfaceGtfsRtEnabled` to `false`.
- `backend/src/main/resources/application.yml`
  - Expose `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED` and URL env vars.
- `.env.example`
- `.env.production.example`
- `.env.staging.example`
  - Document the explicit GTFS-RT opt-in switch.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java`
  - Assert the GTFS-RT request is skipped by default and only appended when enabled.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
  - Persist enriched snapshot context for active and cleared lifecycle events.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`
  - Test snapshot parameter mapping.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryController.java`
  - Add `GET /api/alert-history`.
- `frontend/src/components/NotificationSettingsPanel.tsx`
  - Render `AlertHistoryTimeline` above auth prompt/settings.
- `frontend/src/app/globals.css`
  - Add scoped styles for timeline rows, chips, and states.
- `README.md`
  - Describe GTFS-RT opt-in policy and alert history limits.
- `AGENTS.md`
- `GEMINI.md`
  - Update only if the implementation changes standing agent guidance. For this work, add one short line only if the repository guidance still says GTFS-RT is normally ingested.

---

## Task 1: Baseline And Source-Policy Tests

**Files:**

- Create or modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionPropertiesTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `.env.staging.example`
- Modify: `README.md`

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short
```

Expected: existing unrelated user changes may be present. Do not reset or edit unrelated files. If `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionPropertiesTest.java` already exists, reuse it.

- [ ] **Step 2: Write the failing GTFS-RT default test**

Create or update `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionPropertiesTest.java`:

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AlertIngestionPropertiesTest {
    @Test
    void gtfsRtServiceAlertSupplementIsOptInByDefault() {
        AlertIngestionProperties properties = new AlertIngestionProperties();

        assertThat(properties.isSurfaceGtfsRtEnabled()).isFalse();
    }
}
```

- [ ] **Step 3: Add a client regression for skipping GTFS-RT by default**

In `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java`, add this test after `fetchParsesRouteAndAccessibilityRecordsWhilePreservingRawJson`:

```java
@Test
void fetchDoesNotRequestGtfsRtSupplementByDefault() throws Exception {
    RestClient.Builder builder = RestClient.builder();
    MockRestServiceServer defaultServer = MockRestServiceServer.bindTo(builder).build();
    AlertIngestionProperties properties = new AlertIngestionProperties();
    properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
    properties.setSurfaceGtfsRtUrl(URI.create("https://gtfsrt.ttc.ca/alerts/all?format=text"));
    TtcAlertClient defaultClient = new TtcAlertClient(
        builder.build(),
        new ObjectMapper().findAndRegisterModules(),
        properties,
        new GtfsRtServiceAlertTextParser()
    );

    String body = new String(
        getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
        StandardCharsets.UTF_8
    );
    defaultServer.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
        .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

    TtcAlertFeed feed = defaultClient.fetch();

    assertThat(feed.routes()).hasSize(2);
    assertThat(feed.routes())
        .noneSatisfy(route -> assertThat(route.record().id()).startsWith("gtfsrt-"));
    defaultServer.verify();
}
```

- [ ] **Step 4: Run the focused source-policy tests and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=AlertIngestionPropertiesTest,TtcAlertClientTest
```

Expected before implementation: FAIL if `surfaceGtfsRtEnabled` still defaults true or config is missing. If the test already passes because prior work landed, record that and continue with docs/config verification.

- [ ] **Step 5: Implement default-off GTFS-RT supplement**

In `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java`, set:

```java
private boolean surfaceGtfsRtEnabled = false;
```

In `backend/src/main/resources/application.yml`, under `linewatch.ingestion.alerts`, add:

```yaml
      surface-gtfs-rt-enabled: ${LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED:false}
      surface-gtfs-rt-url: ${LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_URL:https://gtfsrt.ttc.ca/alerts/all?format=text}
```

- [ ] **Step 6: Add env-example documentation**

Add this block near the existing ingestion alert variables in `.env.example`, `.env.production.example`, and `.env.staging.example`:

```dotenv
# Optional diagnostic TTC GTFS-RT service-alert supplement.
# Disabled by default because TTC Live Alerts provides richer subway/LRT structure.
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=false
LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_URL=https://gtfsrt.ttc.ca/alerts/all?format=text
```

- [ ] **Step 7: Update README source policy**

In `README.md`, add this bullet to the implemented backend ingestion section:

```markdown
- TTC GTFS-RT service-alert ingestion is available as an explicit diagnostic supplement with `LINEWATCH_INGESTION_ALERTS_SURFACE_GTFS_RT_ENABLED=true`, but remains disabled by default because TTC Live Alerts usually provides richer subway/LRT structure and better affected-location fields.
```

In the data limitation section, add:

```markdown
- GTFS-RT service alerts can be less structured than TTC Live Alerts and may lack usable subway/LRT affected-segment detail.
```

- [ ] **Step 8: Run focused tests and commit**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=AlertIngestionPropertiesTest,TtcAlertClientTest
```

Expected: PASS.

Commit:

```bash
git add backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionPropertiesTest.java backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java backend/src/main/resources/application.yml .env.example .env.production.example .env.staging.example README.md
git commit -m "fix: keep GTFS-RT alerts opt-in"
```

---

## Task 2: Enrich Snapshot Storage For History Rendering

**Files:**

- Create: `backend/src/main/resources/db/migration/V30__alert_history_snapshot_context.sql`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`

- [ ] **Step 1: Add the Flyway migration**

Create `backend/src/main/resources/db/migration/V30__alert_history_snapshot_context.sql`:

```sql
alter table snapshots
    add column source_id varchar(120),
    add column line_id varchar(32) references transit_lines(id),
    add column title varchar(500),
    add column event_type varchar(48),
    add column source_alert_type varchar(32),
    add column impact_kind varchar(40),
    add column start_station_id varchar(80) references stations(id),
    add column end_station_id varchar(80) references stations(id),
    add column direction varchar(160),
    add column cause varchar(80),
    add column cause_description varchar(160);

update snapshots s
set source_id = a.source_id,
    line_id = a.line_id,
    title = a.title,
    event_type =
        case
            when a.impact_kind = 'suspension' then 'suspension'
            when a.impact_kind = 'delay' then 'delay'
            when a.impact_kind = 'reduced-speed-zone' then 'reduced-speed-zone'
            when a.impact_kind = 'planned-closure' then 'planned-closure'
            else 'service-alert'
        end,
    source_alert_type = a.source_alert_type,
    impact_kind = a.impact_kind,
    start_station_id = a.start_station_id,
    end_station_id = a.end_station_id,
    direction = a.direction,
    cause = a.cause,
    cause_description = a.cause_description
from alerts a
where a.id = s.alert_id;

create index idx_snapshots_time_id
    on snapshots(snapshot_time desc, id desc);

create index idx_snapshots_alert_time
    on snapshots(alert_id, snapshot_time desc, id desc);

create index idx_snapshots_line_time
    on snapshots(line_id, snapshot_time desc);
```

If `V30` already exists in the target branch, use the next unused number and update all plan references before continuing.

- [ ] **Step 2: Write the failing snapshot-params test**

In `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`, add:

```java
@Test
void snapshotParamsIncludeRenderableAlertHistoryContext() {
    NormalizedRouteAlert alert = TestAlertRecords.normalizedRoute(
        "route-source",
        AlertDirection.SOUTHBOUND
    );

    MapSqlParameterSource params = ReflectionTestUtils.invokeMethod(
        new TtcAlertStore(null),
        "routeSnapshotParams",
        alert,
        true,
        OffsetDateTime.parse("2026-06-01T12:00:00Z")
    );

    assertThat(params.getValue("alertId")).isEqualTo(alert.id());
    assertThat(params.getValue("sourceId")).isEqualTo(alert.sourceId());
    assertThat(params.getValue("lineId")).isEqualTo(alert.lineId());
    assertThat(params.getValue("title")).isEqualTo(alert.title());
    assertThat(params.getValue("eventType")).isEqualTo(alert.impactKind().wireValue());
    assertThat(params.getValue("sourceAlertType")).isEqualTo(alert.sourceAlertType());
    assertThat(params.getValue("impactKind")).isEqualTo(alert.impactKind().wireValue());
    assertThat(params.getValue("startStationId")).isEqualTo(alert.startStationId());
    assertThat(params.getValue("endStationId")).isEqualTo(alert.endStationId());
    assertThat(params.getValue("direction")).isEqualTo("southbound");
    assertThat(params.getValue("cause")).isEqualTo(alert.cause());
    assertThat(params.getValue("causeDescription")).isEqualTo(alert.causeDescription());
    assertThat(params.getValue("active")).isEqualTo(true);
    assertThat(params.getValue("sourceUpdatedAt")).isEqualTo(alert.sourceUpdatedAt());
}
```

- [ ] **Step 3: Run the store test and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=TtcAlertStoreTest
```

Expected: FAIL because `routeSnapshotParams` does not exist.

- [ ] **Step 4: Add snapshot parameter helper and active snapshot insert**

In `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`, replace the active snapshot call inside `upsertRouteAlert`:

```java
appendSnapshot(alert, true, now);
```

Add this helper:

```java
private MapSqlParameterSource routeSnapshotParams(
    NormalizedRouteAlert alert,
    boolean active,
    OffsetDateTime now
) {
    return new MapSqlParameterSource()
        .addValue("alertId", alert.id())
        .addValue("severity", alert.severity())
        .addValue("description", alert.description())
        .addValue("now", now)
        .addValue("active", active)
        .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
        .addValue("sourceId", alert.sourceId())
        .addValue("lineId", alert.lineId())
        .addValue("title", alert.title())
        .addValue("eventType", alert.impactKind().wireValue())
        .addValue("sourceAlertType", alert.sourceAlertType())
        .addValue("impactKind", alert.impactKind().wireValue())
        .addValue("startStationId", alert.startStationId())
        .addValue("endStationId", alert.endStationId())
        .addValue("direction", alert.direction().wireValue())
        .addValue("cause", alert.cause())
        .addValue("causeDescription", alert.causeDescription());
}
```

Replace the existing `appendSnapshot(String alertId, String severity, String description, boolean active, OffsetDateTime now, OffsetDateTime sourceUpdatedAt)` method with:

```java
private void appendSnapshot(
    NormalizedRouteAlert alert,
    boolean active,
    OffsetDateTime now
) {
    jdbc.update("""
        insert into snapshots (
            alert_id, severity, description, snapshot_time, active,
            source_updated_at, source_id, line_id, title, event_type,
            source_alert_type, impact_kind, start_station_id, end_station_id,
            direction, cause, cause_description
        ) values (
            :alertId, :severity, :description, :now, :active,
            :sourceUpdatedAt, :sourceId, :lineId, :title, :eventType,
            :sourceAlertType, :impactKind, :startStationId, :endStationId,
            :direction, :cause, :causeDescription
        )
        """, routeSnapshotParams(alert, active, now));
}
```

- [ ] **Step 5: Add deactivation context record**

In `TtcAlertStore.java`, replace the current `ActiveAlert` record with:

```java
private record ActiveAlert(
    String id,
    String sourceId,
    String lineId,
    String severity,
    String title,
    String description,
    String sourceAlertType,
    String impactKind,
    String startStationId,
    String endStationId,
    String direction,
    String cause,
    String causeDescription,
    OffsetDateTime sourceUpdatedAt
) {}
```

Update the query in `deactivateMissingAlerts` to select the additional columns:

```java
select id, source_id, line_id, severity, title, description, source_alert_type,
       impact_kind, start_station_id, end_station_id, direction, cause,
       cause_description, source_updated_at
from alerts
where active = true and id like 'ttc-route-%'
```

Update its row mapper:

```java
(resultSet, rowNumber) -> new ActiveAlert(
    resultSet.getString("id"),
    resultSet.getString("source_id"),
    resultSet.getString("line_id"),
    resultSet.getString("severity"),
    resultSet.getString("title"),
    resultSet.getString("description"),
    resultSet.getString("source_alert_type"),
    resultSet.getString("impact_kind"),
    resultSet.getString("start_station_id"),
    resultSet.getString("end_station_id"),
    resultSet.getString("direction"),
    resultSet.getString("cause"),
    resultSet.getString("cause_description"),
    resultSet.getObject("source_updated_at", OffsetDateTime.class)
)
```

Add:

```java
private void appendSnapshot(
    ActiveAlert alert,
    boolean active,
    OffsetDateTime now
) {
    jdbc.update("""
        insert into snapshots (
            alert_id, severity, description, snapshot_time, active,
            source_updated_at, source_id, line_id, title, event_type,
            source_alert_type, impact_kind, start_station_id, end_station_id,
            direction, cause, cause_description
        ) values (
            :alertId, :severity, :description, :now, :active,
            :sourceUpdatedAt, :sourceId, :lineId, :title, :eventType,
            :sourceAlertType, :impactKind, :startStationId, :endStationId,
            :direction, :cause, :causeDescription
        )
        """, new MapSqlParameterSource()
            .addValue("alertId", alert.id())
            .addValue("severity", alert.severity())
            .addValue("description", alert.description())
            .addValue("now", now)
            .addValue("active", active)
            .addValue("sourceUpdatedAt", alert.sourceUpdatedAt())
            .addValue("sourceId", alert.sourceId())
            .addValue("lineId", alert.lineId())
            .addValue("title", alert.title())
            .addValue("eventType", alert.impactKind() == null ? "service-alert" : alert.impactKind())
            .addValue("sourceAlertType", alert.sourceAlertType())
            .addValue("impactKind", alert.impactKind())
            .addValue("startStationId", alert.startStationId())
            .addValue("endStationId", alert.endStationId())
            .addValue("direction", alert.direction())
            .addValue("cause", alert.cause())
            .addValue("causeDescription", alert.causeDescription()));
}
```

In `deactivateMissingAlerts`, replace the old deactivation snapshot call with:

```java
appendSnapshot(alert, false, now);
```

- [ ] **Step 6: Run focused backend tests and commit**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=TtcAlertStoreTest,AlertIngestionSchemaMigrationTest
```

Expected: PASS.

Commit:

```bash
git add backend/src/main/resources/db/migration/V30__alert_history_snapshot_context.sql backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java
git commit -m "feat: persist alert history snapshot context"
```

---

## Task 3: Backend Alert History API

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryController.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryServiceTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryControllerTest.java`

- [ ] **Step 1: Create response records**

Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryResponses.java`:

```java
package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.List;

public final class AlertHistoryResponses {
    private AlertHistoryResponses() {}

    public record AlertHistoryResponse(
        OffsetDateTime generatedAt,
        String period,
        OffsetDateTime since,
        OffsetDateTime until,
        List<AlertHistoryIncidentDto> incidents
    ) {}

    public record AlertHistoryIncidentDto(
        String alertId,
        String sourceId,
        String lineId,
        String lineNumber,
        String lineName,
        String eventType,
        String title,
        String location,
        String displayDirection,
        String source,
        String cause,
        String status,
        OffsetDateTime firstSeenAt,
        OffsetDateTime lastUpdatedAt,
        OffsetDateTime clearedAt,
        Long durationMinutes,
        List<AlertHistoryEventDto> events
    ) {}

    public record AlertHistoryEventDto(
        Long id,
        String state,
        String label,
        OffsetDateTime happenedAt,
        String title,
        String description,
        String location,
        String displayDirection,
        String cause,
        String source
    ) {}
}
```

- [ ] **Step 2: Create repository with classified lifecycle rows**

Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryRepository.java`:

```java
package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AlertHistoryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AlertHistoryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AlertHistoryRow> findLifecycleRows(
        OffsetDateTime since,
        OffsetDateTime until,
        int limit
    ) {
        return jdbc.query("""
            with classified as (
                select s.id,
                       s.alert_id,
                       s.source_id,
                       s.line_id,
                       l.number as line_number,
                       l.name as line_name,
                       s.title,
                       s.description,
                       s.snapshot_time,
                       s.active,
                       s.source_updated_at,
                       s.event_type,
                       s.source_alert_type,
                       s.impact_kind,
                       s.start_station_id,
                       s.end_station_id,
                       s.direction,
                       s.cause,
                       s.cause_description,
                       lag(s.active) over (
                           partition by s.alert_id
                           order by s.snapshot_time asc, s.id asc
                       ) as previous_active
                from snapshots s
                left join transit_lines l on l.id = s.line_id
            )
            select id, alert_id, source_id, line_id, line_number, line_name,
                   title, description, snapshot_time, active, source_updated_at,
                   event_type, source_alert_type, impact_kind, start_station_id,
                   end_station_id, direction, cause, cause_description,
                   case
                       when active = false then 'cleared'
                       when previous_active is null or previous_active = false then 'opened'
                       else 'updated'
                   end as lifecycle_state
            from classified
            where snapshot_time >= :since and snapshot_time < :until
            order by snapshot_time desc, id desc
            limit :limit
            """, new MapSqlParameterSource()
                .addValue("since", since)
                .addValue("until", until)
                .addValue("limit", limit),
            (rs, rowNum) -> new AlertHistoryRow(
                rs.getLong("id"),
                rs.getString("alert_id"),
                rs.getString("source_id"),
                rs.getString("line_id"),
                rs.getString("line_number"),
                rs.getString("line_name"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getObject("snapshot_time", OffsetDateTime.class),
                rs.getBoolean("active"),
                rs.getObject("source_updated_at", OffsetDateTime.class),
                rs.getString("event_type"),
                rs.getString("source_alert_type"),
                rs.getString("impact_kind"),
                rs.getString("start_station_id"),
                rs.getString("end_station_id"),
                rs.getString("direction"),
                rs.getString("cause"),
                rs.getString("cause_description"),
                rs.getString("lifecycle_state")
            ));
    }

    public record AlertHistoryRow(
        Long id,
        String alertId,
        String sourceId,
        String lineId,
        String lineNumber,
        String lineName,
        String title,
        String description,
        OffsetDateTime snapshotTime,
        boolean active,
        OffsetDateTime sourceUpdatedAt,
        String eventType,
        String sourceAlertType,
        String impactKind,
        String startStationId,
        String endStationId,
        String direction,
        String cause,
        String causeDescription,
        String lifecycleState
    ) {}
}
```

- [ ] **Step 3: Write service tests before implementation**

Create `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryServiceTest.java`:

```java
package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertHistoryServiceTest {
    private final AlertHistoryRepository repository = mock(AlertHistoryRepository.class);
    private final Clock clock = Clock.fixed(
        Instant.parse("2026-06-23T16:30:00Z"),
        ZoneId.of("UTC")
    );
    private final AlertHistoryService service = new AlertHistoryService(repository, clock);

    @Test
    void todayStartsAtTorontoMidnightAndIncludesClearanceDetails() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of(
            row(2L, "ttc-route-1", false, "cleared", "2026-06-23T12:20:00-04:00"),
            row(1L, "ttc-route-1", true, "opened", "2026-06-23T12:05:00-04:00")
        ));

        AlertHistoryResponses.AlertHistoryResponse response = service.history("today", 300);

        assertThat(response.period()).isEqualTo("today");
        assertThat(response.since()).isEqualTo(OffsetDateTime.parse("2026-06-23T00:00:00-04:00"));
        assertThat(response.until()).isEqualTo(OffsetDateTime.parse("2026-06-23T12:30:00-04:00"));
        assertThat(response.incidents()).singleElement().satisfies(incident -> {
            assertThat(incident.alertId()).isEqualTo("ttc-route-1");
            assertThat(incident.lineNumber()).isEqualTo("2");
            assertThat(incident.lineName()).isEqualTo("Bloor-Danforth");
            assertThat(incident.eventType()).isEqualTo("suspension");
            assertThat(incident.location()).isEqualTo("Warden");
            assertThat(incident.displayDirection()).isEqualTo("Westbound");
            assertThat(incident.cause()).isEqualTo("Mechanical Problem");
            assertThat(incident.source()).isEqualTo("TTC Live Alerts");
            assertThat(incident.status()).isEqualTo("cleared");
            assertThat(incident.firstSeenAt()).isEqualTo(OffsetDateTime.parse("2026-06-23T12:05:00-04:00"));
            assertThat(incident.clearedAt()).isEqualTo(OffsetDateTime.parse("2026-06-23T12:20:00-04:00"));
            assertThat(incident.durationMinutes()).isEqualTo(15L);
            assertThat(incident.events()).extracting(AlertHistoryResponses.AlertHistoryEventDto::state)
                .containsExactly("cleared", "opened");
        });
    }

    @Test
    void supportsSevenAndThirtyDayPeriods() {
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-06-16T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of());
        when(repository.findLifecycleRows(
            OffsetDateTime.parse("2026-05-24T12:30:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            300
        )).thenReturn(List.of());

        assertThat(service.history("7d", 300).period()).isEqualTo("7d");
        assertThat(service.history("30d", 300).period()).isEqualTo("30d");
    }

    private AlertHistoryRepository.AlertHistoryRow row(
        long id,
        String alertId,
        boolean active,
        String lifecycleState,
        String snapshotTime
    ) {
        return new AlertHistoryRepository.AlertHistoryRow(
            id,
            alertId,
            "source-1",
            "line-2",
            "2",
            "Bloor-Danforth",
            "Line 2 Bloor-Danforth: Delays westbound at Warden station while we fix a mechanical problem.",
            "Delays westbound at Warden station while we fix a mechanical problem.",
            OffsetDateTime.parse(snapshotTime),
            active,
            OffsetDateTime.parse(snapshotTime),
            "suspension",
            "Live",
            "suspension",
            "warden",
            "warden",
            "westbound",
            "MECHANICAL_PROBLEM",
            "Mechanical Problem",
            lifecycleState
        );
    }
}
```

- [ ] **Step 4: Run service test and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=AlertHistoryServiceTest
```

Expected: FAIL because `AlertHistoryService` does not exist.

- [ ] **Step 5: Implement history service**

Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryService.java`:

```java
package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryEventDto;
import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryIncidentDto;
import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class AlertHistoryService {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final int MAX_LIMIT = 300;

    private final AlertHistoryRepository repository;
    private final Clock clock;

    public AlertHistoryService(AlertHistoryRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public AlertHistoryResponse history(String requestedPeriod, Integer requestedLimit) {
        String period = normalizePeriod(requestedPeriod);
        OffsetDateTime until = OffsetDateTime.now(clock).atZoneSameInstant(TORONTO_ZONE).toOffsetDateTime();
        OffsetDateTime since = switch (period) {
            case "7d" -> until.minusDays(7);
            case "30d" -> until.minusDays(30);
            default -> until.toLocalDate().atStartOfDay(TORONTO_ZONE).toOffsetDateTime();
        };
        int limit = Math.max(1, Math.min(requestedLimit == null ? MAX_LIMIT : requestedLimit, MAX_LIMIT));
        List<AlertHistoryRepository.AlertHistoryRow> rows =
            repository.findLifecycleRows(since, until, limit);
        return new AlertHistoryResponse(until, period, since, until, group(rows));
    }

    private String normalizePeriod(String period) {
        if ("7d".equalsIgnoreCase(period) || "week".equalsIgnoreCase(period)) {
            return "7d";
        }
        if ("30d".equalsIgnoreCase(period) || "month".equalsIgnoreCase(period)) {
            return "30d";
        }
        return "today";
    }

    private List<AlertHistoryIncidentDto> group(List<AlertHistoryRepository.AlertHistoryRow> rows) {
        Map<String, List<AlertHistoryRepository.AlertHistoryRow>> byAlertId = new LinkedHashMap<>();
        for (AlertHistoryRepository.AlertHistoryRow row : rows) {
            byAlertId.computeIfAbsent(row.alertId(), ignored -> new ArrayList<>()).add(row);
        }
        return byAlertId.values().stream()
            .map(this::incident)
            .toList();
    }

    private AlertHistoryIncidentDto incident(List<AlertHistoryRepository.AlertHistoryRow> rows) {
        AlertHistoryRepository.AlertHistoryRow latest = rows.getFirst();
        OffsetDateTime firstSeenAt = rows.stream()
            .filter(row -> "opened".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .min(OffsetDateTime::compareTo)
            .orElse(null);
        OffsetDateTime lastUpdatedAt = rows.stream()
            .filter(row -> "updated".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
        OffsetDateTime clearedAt = rows.stream()
            .filter(row -> "cleared".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
        Long durationMinutes = firstSeenAt != null && clearedAt != null
            ? Math.max(0, Duration.between(firstSeenAt, clearedAt).toMinutes())
            : null;

        List<AlertHistoryEventDto> events = rows.stream()
            .map(this::event)
            .toList();

        return new AlertHistoryIncidentDto(
            latest.alertId(),
            latest.sourceId(),
            latest.lineId(),
            latest.lineNumber(),
            latest.lineName(),
            eventType(latest),
            firstNonBlank(latest.title(), eventLabel(latest)),
            location(latest),
            displayDirection(latest.direction()),
            sourceLabel(latest.sourceAlertType()),
            cause(latest),
            clearedAt != null ? "cleared" : "active",
            firstSeenAt,
            lastUpdatedAt,
            clearedAt,
            durationMinutes,
            events
        );
    }

    private AlertHistoryEventDto event(AlertHistoryRepository.AlertHistoryRow row) {
        return new AlertHistoryEventDto(
            row.id(),
            row.lifecycleState(),
            eventStateLabel(row.lifecycleState()),
            row.snapshotTime(),
            firstNonBlank(row.title(), eventLabel(row)),
            row.description(),
            location(row),
            displayDirection(row.direction()),
            cause(row),
            sourceLabel(row.sourceAlertType())
        );
    }

    private String eventType(AlertHistoryRepository.AlertHistoryRow row) {
        return firstNonBlank(row.eventType(), row.impactKind(), "service-alert");
    }

    private String eventLabel(AlertHistoryRepository.AlertHistoryRow row) {
        String line = row.lineNumber() == null || row.lineNumber().isBlank()
            ? "TTC"
            : "Line " + row.lineNumber();
        return line + " " + titleCase(eventType(row).replace("-", " "));
    }

    private String eventStateLabel(String state) {
        return switch (state == null ? "" : state) {
            case "opened" -> "Alert opened";
            case "updated" -> "Alert updated";
            case "cleared" -> "Service restored";
            default -> "Alert event";
        };
    }

    private String location(AlertHistoryRepository.AlertHistoryRow row) {
        String start = stationLabel(row.startStationId());
        String end = stationLabel(row.endStationId());
        if (start == null && end == null) {
            return "";
        }
        if (start == null) {
            return end;
        }
        if (end == null || start.equals(end)) {
            return start;
        }
        return start + " to " + end;
    }

    private String displayDirection(String direction) {
        return switch (normalize(direction)) {
            case "northbound" -> "Northbound";
            case "southbound" -> "Southbound";
            case "eastbound" -> "Eastbound";
            case "westbound" -> "Westbound";
            case "bidirectional" -> "Both ways";
            default -> null;
        };
    }

    private String cause(AlertHistoryRepository.AlertHistoryRow row) {
        return firstNonBlank(titleCase(row.causeDescription()), titleCase(row.cause()));
    }

    private String sourceLabel(String sourceAlertType) {
        if ("GTFS-RT".equalsIgnoreCase(sourceAlertType)) {
            return "TTC GTFS-RT";
        }
        if ("Planned".equalsIgnoreCase(sourceAlertType)) {
            return "TTC Service Advisory";
        }
        return "TTC Live Alerts";
    }

    private String stationLabel(String stationId) {
        if (stationId == null || stationId.isBlank()) {
            return null;
        }
        return titleCase(stationId.replace('_', '-').replace("-", " "));
    }

    private String titleCase(String value) {
        String normalized = firstNonBlank(value);
        if (normalized == null) {
            return null;
        }
        StringBuilder result = new StringBuilder();
        for (String word : normalized.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (word.isBlank()) {
                continue;
            }
            if (!result.isEmpty()) {
                result.append(' ');
            }
            result.append(word.substring(0, 1).toUpperCase(Locale.ROOT));
            if (word.length() > 1) {
                result.append(word.substring(1));
            }
        }
        return result.toString();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
```

- [ ] **Step 6: Add controller route test**

Create `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryControllerTest.java`:

```java
package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertHistoryControllerTest {
    private final AlertHistoryService alertHistoryService = mock(AlertHistoryService.class);
    private final AlertHistoryController controller = new AlertHistoryController(alertHistoryService);

@Test
void returnsAlertHistory() {
    AlertHistoryResponses.AlertHistoryResponse history =
        new AlertHistoryResponses.AlertHistoryResponse(
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            "today",
            OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
            OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
            List.of()
        );
    when(alertHistoryService.history("today", 300)).thenReturn(history);

    Object response = controller.getAlertHistory("today", 300);

    assertThat(response).isEqualTo(history);
}
```

- [ ] **Step 7: Add controller endpoint**

Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryController.java`:

```java
package com.calebhabesh.linewatch.alert;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alert-history")
public class AlertHistoryController {
    private final AlertHistoryService historyService;

    public AlertHistoryController(AlertHistoryService historyService) {
        this.historyService = historyService;
    }

    @GetMapping
    public AlertHistoryResponses.AlertHistoryResponse getAlertHistory(
        @RequestParam(required = false, defaultValue = "today") String period,
        @RequestParam(required = false, defaultValue = "300") Integer limit
    ) {
        return historyService.history(period, limit);
    }
}
```

Do not cache this endpoint initially. It is lightweight and history freshness is clearer without cache invalidation coupling.

- [ ] **Step 8: Run focused backend tests and commit**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=AlertHistoryServiceTest,AlertHistoryControllerTest
```

Expected: PASS.

Commit:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryResponses.java backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryRepository.java backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryService.java backend/src/main/java/com/calebhabesh/linewatch/alert/AlertHistoryController.java backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/alert/AlertHistoryControllerTest.java
git commit -m "feat: expose alert lifecycle history"
```

---

## Task 4: Frontend History Data Adapter

**Files:**

- Create: `frontend/src/app/alert-history-data.ts`
- Create: `frontend/tests/alert-history-data.test.mjs`

- [ ] **Step 1: Write failing adapter tests**

Create `frontend/tests/alert-history-data.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyAlertHistory,
  getAlertHistory,
} from "../src/app/alert-history-data.ts";

describe("alert history data adapter", () => {
  it("uses same-origin API by default and includes the requested period", async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          generatedAt: "2026-06-23T12:30:00-04:00",
          period: "today",
          since: "2026-06-23T00:00:00-04:00",
          until: "2026-06-23T12:30:00-04:00",
          incidents: [
            {
              alertId: "ttc-route-1",
              sourceId: "source-1",
              lineId: "line-2",
              lineNumber: "2",
              lineName: "Bloor-Danforth",
              eventType: "suspension",
              title: "Line 2 Suspension",
              location: "Warden",
              displayDirection: "Westbound",
              source: "TTC Live Alerts",
              cause: "Mechanical Problem",
              status: "cleared",
              firstSeenAt: "2026-06-23T12:05:00-04:00",
              lastUpdatedAt: null,
              clearedAt: "2026-06-23T12:20:00-04:00",
              durationMinutes: 15,
              events: [
                {
                  id: 2,
                  state: "cleared",
                  label: "Service restored",
                  happenedAt: "2026-06-23T12:20:00-04:00",
                  title: "Line 2 Suspension",
                  description: "Service restored.",
                  location: "Warden",
                  displayDirection: "Westbound",
                  cause: "Mechanical Problem",
                  source: "TTC Live Alerts",
                },
              ],
            },
          ],
        }),
      };
    };

    const result = await getAlertHistory("today");

    assert.equal(calls[0].url, "/api/alert-history?period=today&limit=300");
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(result.source, "backend");
    assert.equal(result.data.incidents[0].durationMinutes, 15);
  });

  it("falls back to an empty history when the backend is unavailable", async () => {
    global.fetch = async () => {
      throw new Error("offline");
    };

    const result = await getAlertHistory("7d");

    assert.equal(result.source, "fallback");
    assert.equal(result.data.period, "7d");
    assert.deepEqual(result.data.incidents, []);
  });

  it("exports an empty default history shape", () => {
    assert.equal(emptyAlertHistory.period, "today");
    assert.deepEqual(emptyAlertHistory.incidents, []);
  });
});
```

- [ ] **Step 2: Run adapter test and verify RED**

Run:

```bash
node --test frontend/tests/alert-history-data.test.mjs
```

Expected: FAIL because `frontend/src/app/alert-history-data.ts` does not exist.

- [ ] **Step 3: Implement adapter**

Create `frontend/src/app/alert-history-data.ts`:

```typescript
export type AlertHistoryPeriod = "today" | "7d" | "30d";
export type AlertHistorySource = "backend" | "fallback";

export type AlertHistoryEvent = {
  id: number;
  state: "opened" | "updated" | "cleared" | string;
  label: string;
  happenedAt: string;
  title: string;
  description: string;
  location: string;
  displayDirection: string | null;
  cause: string | null;
  source: string;
};

export type AlertHistoryIncident = {
  alertId: string;
  sourceId: string | null;
  lineId: string | null;
  lineNumber: string | null;
  lineName: string | null;
  eventType: string;
  title: string;
  location: string;
  displayDirection: string | null;
  source: string;
  cause: string | null;
  status: "active" | "cleared" | string;
  firstSeenAt: string | null;
  lastUpdatedAt: string | null;
  clearedAt: string | null;
  durationMinutes: number | null;
  events: AlertHistoryEvent[];
};

export type AlertHistoryResponse = {
  generatedAt: string;
  period: AlertHistoryPeriod;
  since: string;
  until: string;
  incidents: AlertHistoryIncident[];
};

export type AlertHistoryResult = {
  source: AlertHistorySource;
  data: AlertHistoryResponse;
};

export const emptyAlertHistory: AlertHistoryResponse = {
  generatedAt: "",
  period: "today",
  since: "",
  until: "",
  incidents: [],
};

export async function getAlertHistory(
  period: AlertHistoryPeriod = "today",
  limit = 300,
): Promise<AlertHistoryResult> {
  const params = new URLSearchParams({
    period,
    limit: String(limit),
  });

  try {
    const response = await fetch(`/api/alert-history?${params.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Alert history request failed: ${response.status}`);
    }
    const data = await response.json() as AlertHistoryResponse;
    return { source: "backend", data };
  } catch {
    return {
      source: "fallback",
      data: {
        ...emptyAlertHistory,
        period,
      },
    };
  }
}
```

- [ ] **Step 4: Run adapter test and commit**

Run:

```bash
node --test frontend/tests/alert-history-data.test.mjs
```

Expected: PASS.

Commit:

```bash
git add frontend/src/app/alert-history-data.ts frontend/tests/alert-history-data.test.mjs
git commit -m "feat: add alert history data adapter"
```

---

## Task 5: Frontend Alert History Timeline UI

**Files:**

- Create: `frontend/src/components/AlertHistoryTimeline.tsx`
- Create: `frontend/tests/alert-history-ui.test.mjs`
- Modify: `frontend/src/components/NotificationSettingsPanel.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write UI source tests**

Create `frontend/tests/alert-history-ui.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const timelineSource = readFileSync(
  new URL("../src/components/AlertHistoryTimeline.tsx", import.meta.url),
  "utf8",
);
const notificationPanelSource = readFileSync(
  new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

describe("alert history timeline UI", () => {
  it("renders period chips and lifecycle filters", () => {
    assert.match(timelineSource, /Today/);
    assert.match(timelineSource, /7 days/);
    assert.match(timelineSource, /30 days/);
    assert.match(timelineSource, /All/);
    assert.match(timelineSource, /Alerts/);
    assert.match(timelineSource, /Clearances/);
  });

  it("loads alert history from the data adapter", () => {
    assert.match(timelineSource, /getAlertHistory/);
    assert.match(timelineSource, /AlertHistoryPeriod/);
    assert.match(timelineSource, /durationMinutes/);
    assert.match(timelineSource, /clearedAt/);
  });

  it("is mounted inside the notification settings panel for all users", () => {
    assert.match(notificationPanelSource, /AlertHistoryTimeline/);
    assert.ok(
      notificationPanelSource.indexOf("<AlertHistoryTimeline") <
        notificationPanelSource.indexOf("!accountState.authenticated"),
    );
  });

  it("adds scoped timeline styles", () => {
    assert.match(cssSource, /\.alert-history-timeline/);
    assert.match(cssSource, /\.alert-history-event-cleared/);
    assert.match(cssSource, /\.alert-history-period-chip/);
  });
});
```

- [ ] **Step 2: Run UI test and verify RED**

Run:

```bash
node --test frontend/tests/alert-history-ui.test.mjs
```

Expected: FAIL because `AlertHistoryTimeline.tsx` does not exist or is not mounted.

- [ ] **Step 3: Implement timeline component**

Create `frontend/src/components/AlertHistoryTimeline.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import {
  getAlertHistory,
  type AlertHistoryIncident,
  type AlertHistoryPeriod,
} from "../app/alert-history-data";
import { formatImpactAge } from "../app/impact-time";

type Filter = "all" | "alerts" | "clearances";

const PERIODS: Array<{ value: AlertHistoryPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "alerts", label: "Alerts" },
  { value: "clearances", label: "Clearances" },
];

export function AlertHistoryTimeline() {
  const [period, setPeriod] = useState<AlertHistoryPeriod>("today");
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState<AlertHistoryIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"backend" | "fallback">("fallback");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAlertHistory(period).then((result) => {
      if (cancelled) return;
      setHistory(result.data.incidents);
      setSource(result.source);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const visibleIncidents = useMemo(() => {
    if (filter === "clearances") {
      return history.filter((incident) => incident.status === "cleared");
    }
    if (filter === "alerts") {
      return history.filter((incident) => incident.events.some((event) => event.state !== "cleared"));
    }
    return history;
  }, [filter, history]);

  return (
    <section className="alert-history-timeline notification-settings-section" aria-label="Alert history timeline">
      <div className="notification-settings-section-header">
        <h3>Service Alert History</h3>
        <span>{source === "backend" ? "Lifecycle" : "Unavailable"}</span>
      </div>

      <div className="alert-history-controls" aria-label="Alert history filters">
        <div className="alert-history-chip-group" aria-label="History period">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-period-chip ${period === option.value ? "active" : ""}`}
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="alert-history-chip-group" aria-label="History event type">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-filter-chip ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="notification-settings-message alert-history-loading" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          Loading alert history...
        </p>
      ) : visibleIncidents.length === 0 ? (
        <p className="notification-settings-note alert-history-empty">
          No alert lifecycle events found for this period.
        </p>
      ) : (
        <ol className="alert-history-list">
          {visibleIncidents.map((incident) => (
            <HistoryIncident key={`${incident.alertId}-${incident.clearedAt ?? incident.firstSeenAt ?? incident.title}`} incident={incident} />
          ))}
        </ol>
      )}
    </section>
  );
}

function HistoryIncident({ incident }: { incident: AlertHistoryIncident }) {
  const primaryEvent = incident.events[0];
  const cleared = incident.status === "cleared";
  const time = primaryEvent?.happenedAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  return (
    <li className={`alert-history-item ${cleared ? "alert-history-event-cleared" : "alert-history-event-active"}`}>
      <div className="alert-history-icon" aria-hidden="true">
        {cleared ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>
      <div className="alert-history-content">
        <div className="alert-history-title-row">
          <strong>{incident.title}</strong>
          {time ? <span>{formatImpactAge(time)}</span> : null}
        </div>
        <p className="alert-history-meta">
          {[
            incident.lineNumber ? `Line ${incident.lineNumber}` : null,
            incident.location || null,
            incident.displayDirection,
            incident.cause,
            incident.source,
          ].filter(Boolean).join(" · ")}
        </p>
        {cleared && incident.durationMinutes !== null ? (
          <p className="alert-history-duration">
            <Clock3 size={13} aria-hidden="true" />
            Cleared after {incident.durationMinutes} min
          </p>
        ) : null}
        <details className="alert-history-details">
          <summary>Lifecycle details</summary>
          <ol>
            {incident.events.map((event) => (
              <li key={event.id}>
                <span>{event.label}</span>
                <time dateTime={event.happenedAt}>{formatImpactAge(event.happenedAt)}</time>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Mount timeline in NotificationSettingsPanel**

In `frontend/src/components/NotificationSettingsPanel.tsx`, add:

```tsx
import { AlertHistoryTimeline } from "./AlertHistoryTimeline";
```

Inside `<div className="notification-settings-scroll">`, before the signed-out prompt, add:

```tsx
        <AlertHistoryTimeline />
```

- [ ] **Step 5: Add scoped CSS**

Append to `frontend/src/app/globals.css` near notification settings styles:

```css
.alert-history-timeline {
  gap: 0.75rem;
}

.alert-history-controls,
.alert-history-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.alert-history-period-chip,
.alert-history-filter-chip {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  padding: 0.35rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 800;
  background: rgba(15, 23, 42, 0.06);
  color: rgb(51, 65, 85);
}

.dark .alert-history-period-chip,
.dark .alert-history-filter-chip,
.high-contrast .alert-history-period-chip,
.high-contrast .alert-history-filter-chip {
  background: rgba(15, 23, 42, 0.75);
  color: rgb(226, 232, 240);
}

.alert-history-period-chip.active,
.alert-history-filter-chip.active {
  border-color: rgba(16, 185, 129, 0.75);
  background: rgba(16, 185, 129, 0.16);
  color: rgb(4, 120, 87);
}

.dark .alert-history-period-chip.active,
.dark .alert-history-filter-chip.active,
.high-contrast .alert-history-period-chip.active,
.high-contrast .alert-history-filter-chip.active {
  color: rgb(167, 243, 208);
}

.alert-history-list {
  display: grid;
  gap: 0.55rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.alert-history-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.5rem;
  padding: 0.7rem;
  background: rgba(248, 250, 252, 0.82);
}

.dark .alert-history-item,
.high-contrast .alert-history-item {
  background: rgba(15, 23, 42, 0.75);
}

.alert-history-event-cleared .alert-history-icon {
  color: rgb(16, 185, 129);
}

.alert-history-event-active .alert-history-icon {
  color: rgb(245, 158, 11);
}

.alert-history-content {
  min-width: 0;
}

.alert-history-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  color: rgb(15, 23, 42);
  font-size: 0.82rem;
}

.dark .alert-history-title-row,
.high-contrast .alert-history-title-row {
  color: rgb(248, 250, 252);
}

.alert-history-title-row span,
.alert-history-meta,
.alert-history-duration,
.alert-history-details {
  color: rgb(100, 116, 139);
  font-size: 0.72rem;
}

.dark .alert-history-title-row span,
.dark .alert-history-meta,
.dark .alert-history-duration,
.dark .alert-history-details,
.high-contrast .alert-history-title-row span,
.high-contrast .alert-history-meta,
.high-contrast .alert-history-duration,
.high-contrast .alert-history-details {
  color: rgb(203, 213, 225);
}

.alert-history-meta {
  margin-top: 0.15rem;
}

.alert-history-duration {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.25rem;
}

.alert-history-details {
  margin-top: 0.35rem;
}

.alert-history-details summary {
  cursor: pointer;
  font-weight: 800;
}

.alert-history-details ol {
  display: grid;
  gap: 0.25rem;
  margin: 0.35rem 0 0;
  padding-left: 1rem;
}

.alert-history-details li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.alert-history-loading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
```

- [ ] **Step 6: Run frontend tests and commit**

Run:

```bash
node --test frontend/tests/alert-history-ui.test.mjs frontend/tests/alert-history-data.test.mjs
npm --prefix frontend run typecheck
```

Expected: PASS.

Commit:

```bash
git add frontend/src/components/AlertHistoryTimeline.tsx frontend/src/components/NotificationSettingsPanel.tsx frontend/src/app/globals.css frontend/tests/alert-history-ui.test.mjs
git commit -m "feat: show alert lifecycle history"
```

---

## Task 6: Documentation And Final Verification

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md` and `GEMINI.md` only if their current text contradicts the implemented source policy or history behavior.

- [ ] **Step 1: Update README alert-history description**

In `README.md`, add to the implemented list:

```markdown
- In-app service alert lifecycle history for Today, 7 days, and 30 days, showing alert openings, meaningful updates, and clearances based on LineWatch snapshot records.
```

Add to limitations:

```markdown
- Alert history is based on LineWatch snapshots and is richer after the alert-history release; older rows may lack full line, cause, direction, or location context.
```

- [ ] **Step 2: Update agent docs only if necessary**

Run:

```bash
rg -n "GTFS-RT|history|notification history|alert history" AGENTS.md GEMINI.md
```

If either file claims GTFS-RT is normally ingested for subway/LRT, change both files to:

```markdown
- TTC GTFS-RT service-alert ingestion exists as an explicit opt-in diagnostic supplement and remains disabled by default; TTC Live Alerts is the normal subway/LRT alert source.
```

If neither file contains a contradictory claim, do not edit `AGENTS.md` or `GEMINI.md`.

- [ ] **Step 3: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS with `Failures: 0, Errors: 0`.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all commands exit 0.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 6: Commit docs and final changes**

Commit:

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document alert history and GTFS-RT policy"
```

If `AGENTS.md` or `GEMINI.md` were not modified, use:

```bash
git add README.md
git commit -m "docs: document alert history and GTFS-RT policy"
```

---

## Gemini 3.5 Flash Execution Notes

- Preserve unrelated worktree changes. The repository currently often has concurrent auth/OAuth edits; do not reset or reformat unrelated files.
- Execute tasks in order. The frontend depends on the backend API contract established in Task 3.
- Use TDD exactly: add the failing test, run it, then implement.
- Do not create a per-user notification-history database table for this feature. Use `snapshots`; it already represents alert lifecycle.
- Do not include raw polling refreshes in history. Only use snapshot rows.
- Do not remove existing GTFS-RT parser/normalizer/deduplication tests. GTFS-RT remains an opt-in diagnostic supplement.
- Do not claim history is complete before LineWatch had snapshots. Document that older rows may be sparse.
- Keep clearances in the history by default. The "no clearances" idea applies only to reducing push notification noise, not to in-app history.
- If `V30__alert_history_snapshot_context.sql` conflicts with an existing migration number, use the next unused version and update the plan references before implementing.

## Self-Review Checklist

- GTFS-RT default-off policy is covered by Task 1.
- GTFS-RT opt-in env vars and README are covered by Tasks 1 and 6.
- Alert openings, updates, and clearances are covered by Tasks 2 and 3.
- "Today", "7 days", and "30 days" periods are covered by Task 3 backend tests and Task 5 UI controls.
- Suspension details in the timeline are covered by `AlertHistoryServiceTest.todayStartsAtTorontoMidnightAndIncludesClearanceDetails`.
- Frontend fallback behavior is covered by Task 4.
- The history is placed inside the existing Notifications panel in Task 5.
- Final verification is covered by Task 6.
