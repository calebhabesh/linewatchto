# TTC Alert Ingestion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poll the official TTC Live Alerts JSON endpoint when explicitly enabled, stage every source record, normalize rapid-transit alerts and station accessibility outages, persist changed alert snapshots, and expose ingestion health without switching the seeded dashboard read paths.

**Architecture:** Keep the TTC HTTP contract isolated behind `TtcAlertClient`, normalize into small internal records, and apply one successfully parsed feed atomically through a focused `NamedParameterJdbcTemplate` store. Use explicit PostgreSQL upserts for source staging and normalized projections because ingestion writes require conflict handling, link-table replacement, and bulk deactivation; retain the existing JPA entities for the later live API read-path slice. Track run lifecycle in separate committed transactions so a failed feed application never erases the prior active state.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring Web `RestClient`, Jackson, Spring Scheduling, Spring JDBC, PostgreSQL/PostGIS, Flyway, JUnit 5, AssertJ, Mockito.

---

## Scope Guardrails

This plan implements only the foundation described in `docs/superpowers/specs/2026-06-01-alert-ingestion-foundation-design.md`.

Do not switch `/api/alerts`, `/api/status`, `/api/map`, or station-panel responses to live records in this plan. Do not add arrival predictions, GTFS import, Redis caching, fuzzy station matching, AI parsing, or PostGIS intersection logic.

The working tree already contains unrelated uncommitted edits. Preserve them:

```text
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java
backend/src/main/resources/db/migration/V2__add_postgis_schema.sql
backend/src/main/resources/db/migration/V3__map_segments_seed.sql
backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java
frontend/next-env.d.ts
frontend/src/components/InteractiveTtcMap.tsx
frontend/tests/map-layering.test.mjs
docs/superpowers/plans/2026-05-31-stabilization-and-playwright-smoke.md
docs/superpowers/plans/2026-06-01-alert-ingestion-slice.md
frontend/test-portal.mjs
frontend/test-split.mjs
```

Do not rewrite `V2__add_postgis_schema.sql` or `V3__map_segments_seed.sql` while implementing ingestion. Add `V4__alert_ingestion_foundation.sql`.

## File Map

### Database

- Create `backend/src/main/resources/db/migration/V4__alert_ingestion_foundation.sql`: additive staging, normalized-outage, station-link, alert-period, alert metadata, snapshot, and ingestion-health schema.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionSchemaMigrationTest.java`: migration contract test.

### Source Client

- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java`: typed configuration with disabled-by-default polling and timeout defaults.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionConfiguration.java`: `RestClient`, `Clock`, and configuration-properties beans.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertActivePeriod.java`: TTC parent period DTO.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertChildPeriod.java`: TTC recurring child-period DTO.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java`: TTC source-record DTO.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcFetchedRecord.java`: parsed DTO plus preserved raw JSON.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeed.java`: parsed envelope.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientException.java`: source-client failure.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java`: official feed adapter and strict envelope parser.
- Create `backend/src/test/resources/fixtures/ttc-synthetic-alerts.json`: TTC-shaped local fixture.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java`: client parsing and HTTP-failure tests.
- Modify `backend/src/main/resources/application.yml`: alert-ingestion properties.

### Normalization

- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/StationAliasResolver.java`: explicit station-name normalization.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertTimes.java`: TTC sentinel-end handling.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizationStatus.java`: `MATCHED`, `MATCHED_WITH_UNRESOLVED`, `IGNORED`, or `UNMATCHED`.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizationResult.java`: outcome wrapper.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedAlertPeriod.java`: normalized recurring period.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`: normalized rapid-transit projection.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedAccessibilityOutage.java`: normalized elevator or escalator outage.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertFingerprint.java`: SHA-256 rider-visible-state fingerprint.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`: structured-first route and accessibility normalizer.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/StationAliasResolverTest.java`: alias contract tests.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`: route, outage, period, and unmatched tests.

### Atomic Feed Application

- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/FeedApplicationCounts.java`: run counters.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`: SQL staging, projection, snapshot, and deactivation operations.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`: one-transaction feed application.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`: snapshot-churn decision test.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java`: staging, projection, unmatched, and deactivation tests.

### Run Tracking And Scheduling

- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunSnapshot.java`: latest-run read model.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunStore.java`: committed run lifecycle writes and latest-run query.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunService.java`: `REQUIRES_NEW` transaction boundary.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java`: run coordinator.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertPollingJob.java`: disabled-by-default scheduled wrapper.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/IngestionRunServiceTest.java`: run state tests.
- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionServiceTest.java`: coordinator success and failure tests.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/LinewatchApplication.java`: enable scheduling infrastructure.

### Ingestion Health And Docs

- Create `backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java`: `GET /api/health/ingestion`.
- Create `backend/src/test/java/com/calebhabesh/linewatch/health/IngestionHealthControllerTest.java`: no-runs and latest-run responses.
- Modify `README.md`: document implemented ingestion foundation and seeded visible read paths.
- Modify `AGENTS.md`: update current reality and next implementation order.
- Modify `GEMINI.md`: keep agent instructions synchronized with `AGENTS.md`.
- Modify `HANDOVER.md`: replace stale unstructured-regex and PostGIS-matching claims with the implemented staged foundation.

## Task 1: Add The Additive Ingestion Schema

**Files:**
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionSchemaMigrationTest.java`
- Create: `backend/src/main/resources/db/migration/V4__alert_ingestion_foundation.sql`

- [ ] **Step 1: Write the failing migration-contract test**

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class AlertIngestionSchemaMigrationTest {

    @Test
    void v4AddsSourceStagingNormalizedOutagesPeriodsAndRunCounters() throws IOException {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V4__alert_ingestion_foundation.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("create table ttc_alert_source_records");
            assertThat(sql).contains("create table alert_stations");
            assertThat(sql).contains("create table alert_active_periods");
            assertThat(sql).contains("create table accessibility_outages");
            assertThat(sql).contains("create table accessibility_outage_stations");
            assertThat(sql).contains("normalized_fingerprint");
            assertThat(sql).contains("records_fetched");
            assertThat(sql).contains("source_feed_updated_at");
        }
    }
}
```

- [ ] **Step 2: Run the migration-contract test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertIngestionSchemaMigrationTest test
```

Expected: FAIL because `V4__alert_ingestion_foundation.sql` does not exist.

- [ ] **Step 3: Add the additive Flyway migration**

Create `backend/src/main/resources/db/migration/V4__alert_ingestion_foundation.sql`:

```sql
create table ttc_alert_source_records (
    source_section varchar(32) not null,
    source_id varchar(120) not null,
    route_type varchar(80),
    source_updated_at timestamp with time zone,
    payload text not null,
    active boolean not null default true,
    first_seen_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    primary key (source_section, source_id),
    check (source_section in ('routes', 'accessibility'))
);

alter table alerts
    alter column title type varchar(500),
    add column line_id varchar(32) references transit_lines(id),
    add column source_alert_type varchar(32),
    add column effect varchar(80),
    add column effect_description varchar(160),
    add column direction varchar(160),
    add column cause varchar(80),
    add column cause_description varchar(160),
    add column start_station_id varchar(80) references stations(id),
    add column end_station_id varchar(80) references stations(id),
    add column active_period_start timestamp with time zone,
    add column active_period_end timestamp with time zone,
    add column source_updated_at timestamp with time zone,
    add column shuttle_type varchar(80),
    add column shuttle_start varchar(160),
    add column shuttle_end varchar(160),
    add column raw_payload text,
    add column normalized_fingerprint varchar(64);

create table alert_stations (
    alert_id varchar(120) not null references alerts(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    sort_order integer not null,
    primary key (alert_id, station_id)
);

create table alert_active_periods (
    alert_id varchar(120) not null references alerts(id) on delete cascade,
    source_period_id varchar(120) not null,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    sort_order integer not null,
    primary key (alert_id, source_period_id)
);

create table accessibility_outages (
    id varchar(160) primary key,
    source_id varchar(120) not null unique,
    asset_type varchar(32) not null,
    title varchar(500) not null,
    description text not null,
    effect varchar(80),
    effect_description varchar(160),
    active_period_start timestamp with time zone,
    active_period_end timestamp with time zone,
    source_updated_at timestamp with time zone,
    active boolean not null default true,
    raw_payload text not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    check (asset_type in ('elevator', 'escalator'))
);

create table accessibility_outage_stations (
    outage_id varchar(160) not null references accessibility_outages(id) on delete cascade,
    station_id varchar(80) not null references stations(id),
    primary key (outage_id, station_id)
);

alter table snapshots
    add column active boolean not null default true,
    add column source_updated_at timestamp with time zone;

alter table ingestion_runs
    add column records_fetched integer not null default 0,
    add column records_staged integer not null default 0,
    add column records_normalized integer not null default 0,
    add column records_unmatched integer not null default 0,
    add column source_feed_updated_at timestamp with time zone;

create index idx_ttc_alert_source_records_active
    on ttc_alert_source_records(active);
create index idx_alerts_active_line_id
    on alerts(active, line_id);
create index idx_alert_stations_station_id
    on alert_stations(station_id);
create index idx_accessibility_outages_active
    on accessibility_outages(active);
create index idx_accessibility_outage_stations_station_id
    on accessibility_outage_stations(station_id);
create index idx_ingestion_runs_type_started_at
    on ingestion_runs(run_type, started_at desc);
```

- [ ] **Step 4: Run the migration-contract test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertIngestionSchemaMigrationTest test
```

Expected: PASS.

- [ ] **Step 5: Commit the schema**

```bash
git add backend/src/main/resources/db/migration/V4__alert_ingestion_foundation.sql \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionSchemaMigrationTest.java
git commit -m "feat(backend): add alert ingestion schema"
```

## Task 2: Add The TTC Source Client

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertIngestionConfiguration.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertActivePeriod.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertChildPeriod.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcFetchedRecord.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeed.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientException.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java`
- Create: `backend/src/test/resources/fixtures/ttc-synthetic-alerts.json`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java`
- Modify: `backend/src/main/resources/application.yml`

- [ ] **Step 1: Add a TTC-shaped local fixture**

Create `backend/src/test/resources/fixtures/ttc-synthetic-alerts.json`:

```json
{
  "total": 4,
  "lastUpdated": "2026-06-01T07:36:33.367Z",
  "futureUnknownField": "ignored",
  "routes": [
    {
      "id": "synthetic-planned-line-1",
      "alertType": "Planned",
      "lastUpdated": "2026-06-01T05:30:00Z",
      "activePeriod": {
        "start": "2026-06-01T05:30:00Z",
        "end": "2026-06-06T00:30:00Z"
      },
      "activePeriodGroup": ["Current", "Weekend"],
      "route": "1",
      "routeType": "Subway",
      "stopStart": "St George",
      "stopEnd": "Sheppard West",
      "stopIDList": ["Sheppard West", "Wilson", "Yorkdale", "St George"],
      "title": "Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
      "headerText": "Line 1 Yonge-University: Synthetic scenario: no subway service between St George and Sheppard West for a test closure.",
      "effect": "REDUCED_SERVICE",
      "effectDesc": "Subway Closure - Early Access",
      "cause": "MAINTENANCE",
      "causeDescription": "CLOSURE - Planned Track Work",
      "shuttleType": "Will Operate",
      "shuttleStart": "Vaughan",
      "shuttleEnd": "Union",
      "childAlerts": [
        {
          "id": "synthetic-planned-line-1-period",
          "startTime": "2026-06-01T23:59:00Z",
          "endTime": "2026-06-02T03:30:00Z"
        }
      ]
    },
    {
      "id": "synthetic-rsz-line-1",
      "alertType": "Planned",
      "lastUpdated": "2026-05-26T06:00:00Z",
      "activePeriod": {
        "start": "2026-05-26T06:00:00Z",
        "end": "0001-01-01T00:00:00Z"
      },
      "route": "1",
      "routeType": "Subway",
      "stopStart": "Eglinton",
      "stopEnd": "Davisville",
      "stopIDList": ["Davisville", "Eglinton"],
      "title": "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      "headerText": "Line 1 Yonge-University: Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
      "effect": "SIGNIFICANT_DELAYS",
      "effectDesc": "Reduced Speed Zone",
      "cause": "MAINTENANCE",
      "causeDescription": "Track issue",
      "childAlerts": []
    }
  ],
  "accessibility": [
    {
      "id": "synthetic-elevator-warden",
      "alertType": "Planned",
      "lastUpdated": "2026-06-01T06:00:00Z",
      "activePeriod": {
        "start": "2026-06-01T06:00:00Z",
        "end": "0001-01-01T00:00:00Z"
      },
      "routeType": "Elevator",
      "title": "Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      "headerText": "Warden: Synthetic scenario: elevator TEST-E1 is out of service at Warden.",
      "effect": "ACCESSIBILITY_ISSUE",
      "effectDesc": "Out of service",
      "elevatorCode": "TEST-E1",
      "childAlerts": []
    },
    {
      "id": "synthetic-escalator-pioneer-village",
      "alertType": "Planned",
      "lastUpdated": "2026-06-01T06:00:00Z",
      "activePeriod": {
        "start": "2026-06-01T06:00:00Z",
        "end": "0001-01-01T00:00:00Z"
      },
      "routeType": "Escalator",
      "title": "Synthetic scenario: escalator TEST-S1 is out of service at Pioneer Village.",
      "headerText": "Pioneer Village: Synthetic scenario: escalator TEST-S1 is out of service at Pioneer Village.",
      "effect": "ACCESSIBILITY_ISSUE",
      "effectDesc": "Out of service",
      "escalatorCode": "TEST-S1",
      "childAlerts": []
    }
  ]
}
```

- [ ] **Step 2: Write failing client tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java` with these tests:

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class TtcAlertClientTest {
    private MockRestServiceServer server;
    private TtcAlertClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        AlertIngestionProperties properties = new AlertIngestionProperties();
        properties.setUrl(URI.create("https://alerts.ttc.ca/api/alerts/live-alerts"));
        client = new TtcAlertClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties
        );
    }

    @Test
    void fetchParsesRouteAndAccessibilityRecordsWhilePreservingRawJson() throws Exception {
        String body = new String(
            getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
            StandardCharsets.UTF_8
        );
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        TtcAlertFeed feed = client.fetch();

        assertThat(feed.routes()).hasSize(2);
        assertThat(feed.accessibility()).hasSize(2);
        assertThat(feed.routes().getFirst().record().id()).isEqualTo("synthetic-planned-line-1");
        assertThat(feed.routes().getFirst().rawPayload())
            .contains("\"id\":\"synthetic-planned-line-1\"")
            .doesNotContain("futureUnknownField");
        assertThat(feed.accessibility().getFirst().record().elevatorCode()).isEqualTo("TEST-E1");
        server.verify();
    }

    @Test
    void fetchRejectsMalformedEnvelope() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withSuccess("{\"routes\":{}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcAlertClientException.class)
            .hasMessageContaining("routes");
    }

    @Test
    void fetchWrapsUpstreamHttpFailure() {
        server.expect(requestTo("https://alerts.ttc.ca/api/alerts/live-alerts"))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcAlertClientException.class)
            .hasMessageContaining("TTC Live Alerts");
    }
}
```

- [ ] **Step 3: Run the client tests to verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertClientTest test
```

Expected: FAIL because the client types do not exist.

- [ ] **Step 4: Add typed configuration and DTO records**

Implement `AlertIngestionProperties`:

```java
package com.calebhabesh.linewatch.ingestion;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.ingestion.alerts")
public class AlertIngestionProperties {
    private boolean enabled;
    private URI url = URI.create("https://alerts.ttc.ca/api/alerts/live-alerts");
    private Duration fixedDelay = Duration.ofMinutes(2);
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(8);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getUrl() { return url; }
    public void setUrl(URI url) { this.url = url; }
    public Duration getFixedDelay() { return fixedDelay; }
    public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
}
```

Implement the source records:

```java
public record TtcAlertActivePeriod(OffsetDateTime start, OffsetDateTime end) {}

public record TtcAlertChildPeriod(
    String id,
    OffsetDateTime startTime,
    OffsetDateTime endTime
) {}

@JsonIgnoreProperties(ignoreUnknown = true)
public record TtcAlertRecord(
    String id,
    String alertType,
    OffsetDateTime lastUpdated,
    TtcAlertActivePeriod activePeriod,
    List<String> activePeriodGroup,
    String route,
    String routeType,
    String stopStart,
    String stopEnd,
    List<String> stopIDList,
    String title,
    String description,
    String headerText,
    String effect,
    String effectDesc,
    String direction,
    String cause,
    String causeDescription,
    String shuttleType,
    String shuttleStart,
    String shuttleEnd,
    String elevatorCode,
    String escalatorCode,
    List<TtcAlertChildPeriod> childAlerts
) {}

public record TtcFetchedRecord(TtcAlertRecord record, String rawPayload) {}

public record TtcAlertFeed(
    OffsetDateTime lastUpdated,
    List<TtcFetchedRecord> routes,
    List<TtcFetchedRecord> accessibility
) {
    public int fetchedCount() {
        return routes.size() + accessibility.size();
    }
}
```

Add required `package`, Jackson, `OffsetDateTime`, and `List` imports in each file.

- [ ] **Step 5: Implement the TTC client and HTTP configuration**

Implement `TtcAlertClient` with a strict envelope parser:

```java
package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcAlertClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AlertIngestionProperties properties;

    public TtcAlertClient(
        RestClient ttcAlertRestClient,
        ObjectMapper objectMapper,
        AlertIngestionProperties properties
    ) {
        this.restClient = ttcAlertRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public TtcAlertFeed fetch() {
        try {
            String body = restClient.get()
                .uri(properties.getUrl())
                .retrieve()
                .body(String.class);
            return parse(body);
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcAlertClientException("Unable to fetch TTC Live Alerts", exception);
        }
    }

    TtcAlertFeed parse(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw new TtcAlertClientException("TTC Live Alerts payload must be an object");
            }
            return new TtcAlertFeed(
                parseOptionalTimestamp(root.get("lastUpdated")),
                parseSection(root, "routes"),
                parseSection(root, "accessibility")
            );
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcAlertClientException("Unable to parse TTC Live Alerts payload", exception);
        }
    }

    private List<TtcFetchedRecord> parseSection(JsonNode root, String section) throws Exception {
        JsonNode records = root.get(section);
        if (records == null || !records.isArray()) {
            throw new TtcAlertClientException("TTC Live Alerts payload requires array: " + section);
        }
        List<TtcFetchedRecord> parsed = new ArrayList<>();
        for (JsonNode node : records) {
            parsed.add(new TtcFetchedRecord(
                objectMapper.treeToValue(node, TtcAlertRecord.class),
                objectMapper.writeValueAsString(node)
            ));
        }
        return List.copyOf(parsed);
    }

    private OffsetDateTime parseOptionalTimestamp(JsonNode node) {
        return node == null || node.isNull() ? null : OffsetDateTime.parse(node.asText());
    }
}
```

Implement the exception:

```java
package com.calebhabesh.linewatch.ingestion;

public class TtcAlertClientException extends RuntimeException {
    public TtcAlertClientException(String message) {
        super(message);
    }

    public TtcAlertClientException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

Implement `AlertIngestionConfiguration`:

```java
package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(AlertIngestionProperties.class)
public class AlertIngestionConfiguration {

    @Bean
    RestClient ttcAlertRestClient(
        RestClient.Builder builder,
        AlertIngestionProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory).build();
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
```

Append to `application.yml`:

```yaml
linewatch:
  ingestion:
    alerts:
      enabled: ${LINEWATCH_INGESTION_ALERTS_ENABLED:false}
      url: ${LINEWATCH_INGESTION_ALERTS_URL:https://alerts.ttc.ca/api/alerts/live-alerts}
      fixed-delay: ${LINEWATCH_INGESTION_ALERTS_FIXED_DELAY:PT2M}
      connect-timeout: ${LINEWATCH_INGESTION_ALERTS_CONNECT_TIMEOUT:PT3S}
      read-timeout: ${LINEWATCH_INGESTION_ALERTS_READ_TIMEOUT:PT8S}
```

- [ ] **Step 6: Run the client tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertClientTest test
```

Expected: PASS.

- [ ] **Step 7: Commit the TTC source client**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/ingestion \
  backend/src/main/resources/application.yml \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertClientTest.java \
  backend/src/test/resources/fixtures/ttc-synthetic-alerts.json
git commit -m "feat(backend): add TTC live alerts client"
```

## Task 3: Normalize Route Alerts And Accessibility Outages

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/StationAliasResolver.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertTimes.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizationStatus.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizationResult.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedAlertPeriod.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedAccessibilityOutage.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertFingerprint.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/StationAliasResolverTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`

- [ ] **Step 1: Write failing alias tests**

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationRepository;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StationAliasResolverTest {
    private final StationRepository stationRepository = mock(StationRepository.class);
    private StationAliasResolver resolver;

    @BeforeEach
    void setUp() {
        Set<String> seededIds = Set.of(
            "st-george",
            "st-clair",
            "cedarvale",
            "tmu",
            "vaughan-metropolitan-centre",
            "o_connor"
        );
        when(stationRepository.existsById(anyString()))
            .thenAnswer(invocation -> seededIds.contains(invocation.getArgument(0)));
        resolver = new StationAliasResolver(stationRepository);
    }

    @Test
    void resolvesCanonicalNamesAndExplicitTtcAliases() {
        assertThat(resolver.resolve("St George")).contains("st-george");
        assertThat(resolver.resolve("St. Clair")).contains("st-clair");
        assertThat(resolver.resolve("Eglinton West")).contains("cedarvale");
        assertThat(resolver.resolve("Dundas")).contains("tmu");
        assertThat(resolver.resolve("Vaughan")).contains("vaughan-metropolitan-centre");
        assertThat(resolver.resolve("O'Connor")).contains("o_connor");
    }

    @Test
    void blankAndUnknownStationNamesRemainUnresolved() {
        assertThat(resolver.resolve(null)).isEmpty();
        assertThat(resolver.resolve("   ")).isEmpty();
        assertThat(resolver.resolve("Imaginary Station")).isEmpty();
    }
}
```

- [ ] **Step 2: Write failing normalizer tests**

Use the Task 2 fixture through `TtcAlertClient.parse(...)`. Assert:

```java
private final StationRepository stationRepository = mock(StationRepository.class);
private TtcAlertFeed feed;
private TtcAlertNormalizer normalizer;

@BeforeEach
void setUp() throws Exception {
    when(stationRepository.existsById(anyString())).thenReturn(true);
    StationAliasResolver resolver = new StationAliasResolver(stationRepository);
    normalizer = new TtcAlertNormalizer(resolver);
    String body = new String(
        getClass().getResourceAsStream("/fixtures/ttc-synthetic-alerts.json").readAllBytes(),
        StandardCharsets.UTF_8
    );
    feed = new TtcAlertClient(
        RestClient.create(),
        new ObjectMapper().findAndRegisterModules(),
        new AlertIngestionProperties()
    ).parse(body);
}

@Test
void normalizesRecurringPlannedClosureWithChildPeriod() {
    NormalizationResult<NormalizedRouteAlert> result =
        normalizer.normalizeRoute(feed.routes().getFirst());

    assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED);
    assertThat(result.projection()).get()
        .extracting(
            NormalizedRouteAlert::id,
            NormalizedRouteAlert::lineId,
            NormalizedRouteAlert::type,
            NormalizedRouteAlert::severity
        )
        .containsExactly("ttc-route-synthetic-planned-line-1", "line-1", "planned-closure", "planned");
    assertThat(result.projection().orElseThrow().periods())
        .containsExactly(new NormalizedAlertPeriod(
            "synthetic-planned-line-1-period",
            OffsetDateTime.parse("2026-06-01T23:59:00Z"),
            OffsetDateTime.parse("2026-06-02T03:30:00Z"),
            0
        ));
}

@Test
void normalizesReducedSpeedZoneAsDelayAndDropsSentinelEnd() {
    NormalizedRouteAlert alert =
        normalizer.normalizeRoute(feed.routes().get(1)).projection().orElseThrow();

    assertThat(alert.type()).isEqualTo("active-alert");
    assertThat(alert.severity()).isEqualTo("delay");
    assertThat(alert.activePeriodEnd()).isNull();
}

@Test
void ignoresSurfaceRoutesWithoutCountingThemAsUnmatched() {
    NormalizationResult<NormalizedRouteAlert> result =
        normalizer.normalizeRoute(fetchedRecord("52", "Bus", "SIGNIFICANT_DELAYS"));

    assertThat(result.status()).isEqualTo(NormalizationStatus.IGNORED);
}

@Test
void normalizesCurrentNoServiceAsSuspension() {
    NormalizedRouteAlert alert =
        normalizer.normalizeRoute(fetchedRecord("2", "Subway", "NO_SERVICE"))
            .projection()
            .orElseThrow();

    assertThat(alert.lineId()).isEqualTo("line-2");
    assertThat(alert.type()).isEqualTo("active-alert");
    assertThat(alert.severity()).isEqualTo("suspension");
}

@Test
void normalizesLrtLineWithoutConfusingItWithSurfaceRouteNumber() {
    NormalizedRouteAlert alert =
        normalizer.normalizeRoute(fetchedRecord("5", "LRT", "SIGNIFICANT_DELAYS"))
            .projection()
            .orElseThrow();

    assertThat(alert.lineId()).isEqualTo("line-5");
}

@Test
void normalizesElevatorOutageFromHeaderPrefix() {
    NormalizedAccessibilityOutage outage =
        normalizer.normalizeAccessibility(feed.accessibility().getFirst())
            .projection()
            .orElseThrow();

    assertThat(outage.id()).isEqualTo("ttc-accessibility-synthetic-elevator-warden");
    assertThat(outage.assetType()).isEqualTo("elevator");
    assertThat(outage.stationIds()).containsExactly("warden");
}

@Test
void marksAccessibilityWithoutStationPrefixAsUnmatched() {
    NormalizationResult<NormalizedAccessibilityOutage> result =
        normalizer.normalizeAccessibility(fetchedAccessibility("Elevator unavailable"));

    assertThat(result.status()).isEqualTo(NormalizationStatus.UNMATCHED);
}

@Test
void persistsResolvableRouteMetadataWhileReportingUnknownStation() {
    when(stationRepository.existsById("imaginary-station")).thenReturn(false);
    TtcFetchedRecord fetched = fetchedRecord("1", "Subway", "SIGNIFICANT_DELAYS");
    TtcAlertRecord record = fetched.record();
    fetched = fetched(new TtcAlertRecord(
        record.id(), record.alertType(), record.lastUpdated(), record.activePeriod(),
        record.activePeriodGroup(), record.route(), record.routeType(),
        "Eglinton", "Imaginary Station", List.of("Eglinton", "Imaginary Station"),
        record.title(), record.description(), record.headerText(), record.effect(),
        record.effectDesc(), record.direction(), record.cause(), record.causeDescription(),
        record.shuttleType(), record.shuttleStart(), record.shuttleEnd(),
        record.elevatorCode(), record.escalatorCode(), record.childAlerts()
    ));

    NormalizationResult<NormalizedRouteAlert> result = normalizer.normalizeRoute(fetched);

    assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED_WITH_UNRESOLVED);
    assertThat(result.projection().orElseThrow().stationIds()).containsExactly("eglinton");
}
```

Use these helpers in the test for ignored and malformed cases:

```java
private TtcFetchedRecord fetchedRecord(String route, String routeType, String effect) {
    return fetched(new TtcAlertRecord(
        "source-" + route,
        "Live",
        OffsetDateTime.parse("2026-06-01T07:00:00Z"),
        new TtcAlertActivePeriod(
            OffsetDateTime.parse("2026-06-01T07:00:00Z"),
            null
        ),
        List.of("Current"),
        route,
        routeType,
        "Eglinton",
        "Davisville",
        List.of("Eglinton", "Davisville"),
        "Test route alert",
        "",
        "Line " + route + ": Test route alert",
        effect,
        effect,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of()
    ));
}

private TtcFetchedRecord fetchedAccessibility(String headerText) {
    return fetched(new TtcAlertRecord(
        "source-accessibility",
        "Live",
        OffsetDateTime.parse("2026-06-01T07:00:00Z"),
        new TtcAlertActivePeriod(
            OffsetDateTime.parse("2026-06-01T07:00:00Z"),
            null
        ),
        List.of("Current"),
        null,
        "Elevator",
        null,
        null,
        List.of(),
        "Elevator unavailable",
        "",
        headerText,
        "ACCESSIBILITY_ISSUE",
        "Out of service",
        null,
        null,
        null,
        null,
        null,
        null,
        "TEST",
        null,
        List.of()
    ));
}

private TtcFetchedRecord fetched(TtcAlertRecord record) {
    return new TtcFetchedRecord(record, "{\"id\":\"" + record.id() + "\"}");
}
```

- [ ] **Step 3: Run the normalization tests to verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StationAliasResolverTest,TtcAlertNormalizerTest test
```

Expected: FAIL because normalization types do not exist.

- [ ] **Step 4: Implement station alias resolution and TTC timestamp handling**

Implement `StationAliasResolver` with explicit overrides before slug generation:

```java
package com.calebhabesh.linewatch.ingestion;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import com.calebhabesh.linewatch.station.StationRepository;
import org.springframework.stereotype.Component;

@Component
public class StationAliasResolver {
    private static final Map<String, String> ALIASES = Map.ofEntries(
        Map.entry("eglinton west", "cedarvale"),
        Map.entry("dundas", "tmu"),
        Map.entry("vaughan", "vaughan-metropolitan-centre"),
        Map.entry("vaughan metropolitan centre", "vaughan-metropolitan-centre"),
        Map.entry("o connor", "o_connor"),
        Map.entry("greenwood", "greenwoood"),
        Map.entry("queens park", "queens-park"),
        Map.entry("queen s park", "queens-park"),
        Map.entry("aga khan park and museum", "aga-khan-park-and-museum")
    );
    private final StationRepository stationRepository;

    public StationAliasResolver(StationRepository stationRepository) {
        this.stationRepository = stationRepository;
    }

    public Optional<String> resolve(String stationName) {
        if (stationName == null || stationName.isBlank()) {
            return Optional.empty();
        }
        String normalized = normalize(stationName);
        String stationId = ALIASES.getOrDefault(normalized, normalized.replace(' ', '-'));
        return stationRepository.existsById(stationId)
            ? Optional.of(stationId)
            : Optional.empty();
    }

    private String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replace("&", " and ")
            .replaceAll("[^a-z0-9]+", " ")
            .trim()
            .replaceAll("\\s+", " ");
    }
}
```

Implement `TtcAlertTimes`:

```java
package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;

final class TtcAlertTimes {
    private TtcAlertTimes() {}

    static OffsetDateTime nullIfSentinel(OffsetDateTime value) {
        return value != null && value.getYear() <= 1 ? null : value;
    }
}
```

- [ ] **Step 5: Add normalized records and fingerprinting**

Create:

```java
public enum NormalizationStatus {
    MATCHED,
    MATCHED_WITH_UNRESOLVED,
    IGNORED,
    UNMATCHED
}

public record NormalizationResult<T>(
    NormalizationStatus status,
    Optional<T> projection
) {
    public static <T> NormalizationResult<T> matched(T projection) {
        return new NormalizationResult<>(NormalizationStatus.MATCHED, Optional.of(projection));
    }

    public static <T> NormalizationResult<T> matchedWithUnresolved(T projection) {
        return new NormalizationResult<>(
            NormalizationStatus.MATCHED_WITH_UNRESOLVED,
            Optional.of(projection)
        );
    }

    public static <T> NormalizationResult<T> ignored() {
        return new NormalizationResult<>(NormalizationStatus.IGNORED, Optional.empty());
    }

    public static <T> NormalizationResult<T> unmatched() {
        return new NormalizationResult<>(NormalizationStatus.UNMATCHED, Optional.empty());
    }

    public boolean shouldPersist() {
        return status == NormalizationStatus.MATCHED
            || status == NormalizationStatus.MATCHED_WITH_UNRESOLVED;
    }

    public boolean countsAsUnmatched() {
        return status == NormalizationStatus.UNMATCHED
            || status == NormalizationStatus.MATCHED_WITH_UNRESOLVED;
    }
}

public record NormalizedAlertPeriod(
    String sourcePeriodId,
    OffsetDateTime startsAt,
    OffsetDateTime endsAt,
    int sortOrder
) {}
```

Define `NormalizedRouteAlert` with these components in this order:

```java
String id,
String sourceId,
String lineId,
String type,
String severity,
String title,
String description,
String sourceAlertType,
String effect,
String effectDescription,
String direction,
String cause,
String causeDescription,
String startStationId,
String endStationId,
OffsetDateTime activePeriodStart,
OffsetDateTime activePeriodEnd,
OffsetDateTime sourceUpdatedAt,
String shuttleType,
String shuttleStart,
String shuttleEnd,
String rawPayload,
List<String> stationIds,
List<NormalizedAlertPeriod> periods,
String fingerprint
```

Define `NormalizedAccessibilityOutage` with:

```java
String id,
String sourceId,
String assetType,
String title,
String description,
String effect,
String effectDescription,
OffsetDateTime activePeriodStart,
OffsetDateTime activePeriodEnd,
OffsetDateTime sourceUpdatedAt,
String rawPayload,
List<String> stationIds
```

Implement `AlertFingerprint.sha256(String value)` using Java 21 `MessageDigest` and `HexFormat`. Build the route fingerprint from rider-visible fields and ordered station and period lists:

```java
String fingerprint = AlertFingerprint.sha256(String.join("|",
    nullToEmpty(type),
    nullToEmpty(severity),
    nullToEmpty(title),
    nullToEmpty(description),
    nullToEmpty(lineId),
    nullToEmpty(direction),
    String.join(",", stationIds),
    periods.toString(),
    nullToEmpty(shuttleType),
    nullToEmpty(shuttleStart),
    nullToEmpty(shuttleEnd)
));
```

- [ ] **Step 6: Implement the structured-first normalizer**

Implement `TtcAlertNormalizer` as a `@Component` with:

```java
private static final Set<String> RAPID_TRANSIT_TYPES = Set.of("subway", "lrt");
private static final Map<String, String> LINE_IDS = Map.of(
    "1", "line-1",
    "2", "line-2",
    "4", "line-4",
    "5", "line-5",
    "6", "line-6"
);
private static final Pattern ACCESSIBILITY_STATION =
    Pattern.compile("^\\s*([^:]+):\\s+.+$");
```

Implement route normalization in this order:

1. Ignore records whose lowercase `routeType` is not `subway` or `lrt`.
2. Return unmatched if `route` is not mapped or `id` is blank.
3. Resolve `stopStart`, `stopEnd`, and ordered `stopIDList` through `StationAliasResolver`.
4. Classify reduced-speed records first: `SIGNIFICANT_DELAYS` or `Reduced Speed Zone` -> `active-alert` / `delay`.
5. Classify scheduled closures second: `alertType=Planned` and either child periods exist or closure text is present -> `planned-closure` / `planned`.
6. Classify current no-service records: closure or no-service text -> `active-alert` / `suspension`.
7. Return unmatched for effects without an explicit rule.
8. Normalize child periods when present; otherwise emit one `parent` period.
9. Convert TTC year-one sentinel ends to `null`.
10. Return `MATCHED_WITH_UNRESOLVED` when a supported route projection has useful line metadata but at least one TTC station name does not resolve. Persist its resolved stations and increment the unmatched counter.

Implement accessibility normalization in this order:

1. Accept only `routeType=Elevator` or `routeType=Escalator`; ignore other accessibility records.
2. Extract the station name from the text before the first colon in `headerText`.
3. Resolve that prefix through `StationAliasResolver`.
4. Return unmatched if id, supported asset type, station prefix, or station alias is absent.
5. Emit one normalized outage with lowercase `assetType`.

- [ ] **Step 7: Run the normalization tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=StationAliasResolverTest,TtcAlertNormalizerTest test
```

Expected: PASS.

- [ ] **Step 8: Commit normalization**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/ingestion \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion
git commit -m "feat(backend): normalize TTC route and accessibility alerts"
```

## Task 4: Apply One Feed Atomically

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/FeedApplicationCounts.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java`

- [ ] **Step 1: Write failing store and feed-application service tests**

Add `TtcAlertStoreTest`:

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TtcAlertStoreTest {

    @Test
    void appendsSnapshotOnlyForNewOrChangedFingerprint() {
        assertThat(TtcAlertStore.shouldAppendSnapshot(null, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("old", "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("same", "same")).isFalse();
    }
}
```

Mock `TtcAlertStore` and `TtcAlertNormalizer`. Add tests for:

```java
@Test
void stagesEveryRecordButCountsIgnoredSurfaceRouteOnlyAsStaged() {
    when(normalizer.normalizeRoute(route)).thenReturn(NormalizationResult.ignored());
    when(normalizer.normalizeAccessibility(outage))
        .thenReturn(NormalizationResult.matched(normalizedOutage));

    FeedApplicationCounts counts = service.apply(feed);

    verify(store).upsertSource("routes", route, now);
    verify(store).upsertSource("accessibility", outage, now);
    verify(store).upsertAccessibilityOutage(normalizedOutage, now);
    assertThat(counts).isEqualTo(new FeedApplicationCounts(2, 2, 1, 0));
}

@Test
void countsSupportedButUnresolvedProjectionAsUnmatched() {
    when(normalizer.normalizeRoute(route)).thenReturn(NormalizationResult.unmatched());

    FeedApplicationCounts counts = service.apply(routeOnlyFeed);

    assertThat(counts.recordsUnmatched()).isEqualTo(1);
}

@Test
void deactivatesOnlyAfterApplyingSuccessfullyParsedFeed() {
    service.apply(feed);

    verify(store).deactivateMissingSources(Set.of(sourceKey("routes", route)));
    verify(store).deactivateMissingAlerts(Set.of());
    verify(store).deactivateMissingAccessibilityOutages(Set.of(normalizedOutage.sourceId()), now);
}
```

Use a fixed `Clock` and direct constructors. Include an additional matched-route test that verifies `store.upsertRouteAlert(normalizedAlert, now)`.

- [ ] **Step 2: Run the feed-application tests to verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertStoreTest,TtcAlertFeedApplicationServiceTest test
```

Expected: FAIL because store and service types do not exist.

- [ ] **Step 3: Add explicit feed counters**

```java
package com.calebhabesh.linewatch.ingestion;

public record FeedApplicationCounts(
    int recordsFetched,
    int recordsStaged,
    int recordsNormalized,
    int recordsUnmatched
) {}
```

- [ ] **Step 4: Implement the JDBC store**

Create `TtcAlertStore` as a `@Repository` using `NamedParameterJdbcTemplate`.

Use this stable source key:

```java
public static String sourceKey(String section, TtcFetchedRecord fetched) {
    return section + ":" + fetched.record().id();
}
```

Implement `upsertSource` with:

```sql
insert into ttc_alert_source_records (
    source_section, source_id, route_type, source_updated_at, payload,
    active, first_seen_at, last_seen_at
) values (
    :sourceSection, :sourceId, :routeType, :sourceUpdatedAt, :payload,
    true, :now, :now
)
on conflict (source_section, source_id) do update set
    route_type = excluded.route_type,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    active = true,
    last_seen_at = excluded.last_seen_at
```

Implement `upsertRouteAlert` with:

1. Query existing `normalized_fingerprint` by `source_id`.
2. Upsert all normalized `alerts` columns, always setting `active=true` and `updated_at=:now`.
3. Delete and replace `alert_stations`.
4. Delete and replace `alert_active_periods`.
5. Insert an active `snapshots` row only when the previous fingerprint is absent or different.

Use this package-private helper from `upsertRouteAlert`:

```java
static boolean shouldAppendSnapshot(String previousFingerprint, String nextFingerprint) {
    return !Objects.equals(previousFingerprint, nextFingerprint);
}
```

Use `id = "ttc-route-" + sourceId`.

Implement `upsertAccessibilityOutage` with:

1. Upsert all `accessibility_outages` columns, always setting `active=true` and `updated_at=:now`.
2. Delete and replace `accessibility_outage_stations`.

Use `id = "ttc-accessibility-" + sourceId`.

Implement `deactivateMissingSources(Set<String> sourceKeys)`:

- Query currently active staged rows.
- For each row whose `source_section + ":" + source_id` is not present, set `active=false`.

Implement `deactivateMissingAlerts(Set<String> sourceIds, OffsetDateTime now)`:

- Query active TTC-owned alerts only: `where active = true and id like 'ttc-route-%'`.
- For each absent source id, update `active=false`, `updated_at=:now`.
- Insert a `snapshots` row with `active=false` and the existing severity, description, and source timestamp.

Implement `deactivateMissingAccessibilityOutages(Set<String> sourceIds, OffsetDateTime now)`:

- Query active `accessibility_outages`.
- For each absent source id, update `active=false`, `updated_at=:now`.

Use small row records inside `TtcAlertStore` for active staged records and active alert snapshot values. Branch in Java instead of generating `IN ()` SQL for empty sets.

- [ ] **Step 5: Implement the transactional feed application service**

```java
package com.calebhabesh.linewatch.ingestion;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TtcAlertFeedApplicationService {
    private final TtcAlertStore store;
    private final TtcAlertNormalizer normalizer;
    private final Clock clock;

    public TtcAlertFeedApplicationService(
        TtcAlertStore store,
        TtcAlertNormalizer normalizer,
        Clock clock
    ) {
        this.store = store;
        this.normalizer = normalizer;
        this.clock = clock;
    }

    @Transactional
    public FeedApplicationCounts apply(TtcAlertFeed feed) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        Set<String> seenSourceKeys = new HashSet<>();
        Set<String> seenAlertSourceIds = new HashSet<>();
        Set<String> seenOutageSourceIds = new HashSet<>();
        int normalized = 0;
        int unmatched = 0;

        for (TtcFetchedRecord fetched : feed.routes()) {
            seenSourceKeys.add(store.upsertSource("routes", fetched, now));
            NormalizationResult<NormalizedRouteAlert> result =
                normalizer.normalizeRoute(fetched);
            if (result.shouldPersist()) {
                NormalizedRouteAlert alert = result.projection().orElseThrow();
                store.upsertRouteAlert(alert, now);
                seenAlertSourceIds.add(alert.sourceId());
                normalized++;
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }
        }

        for (TtcFetchedRecord fetched : feed.accessibility()) {
            seenSourceKeys.add(store.upsertSource("accessibility", fetched, now));
            NormalizationResult<NormalizedAccessibilityOutage> result =
                normalizer.normalizeAccessibility(fetched);
            if (result.shouldPersist()) {
                NormalizedAccessibilityOutage outage = result.projection().orElseThrow();
                store.upsertAccessibilityOutage(outage, now);
                seenOutageSourceIds.add(outage.sourceId());
                normalized++;
            }
            if (result.countsAsUnmatched()) {
                unmatched++;
            }
        }

        store.deactivateMissingSources(seenSourceKeys);
        store.deactivateMissingAlerts(seenAlertSourceIds, now);
        store.deactivateMissingAccessibilityOutages(seenOutageSourceIds, now);

        return new FeedApplicationCounts(
            feed.fetchedCount(),
            seenSourceKeys.size(),
            normalized,
            unmatched
        );
    }
}
```

- [ ] **Step 6: Run the feed-application service tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertStoreTest,TtcAlertFeedApplicationServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit atomic feed application**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/ingestion \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java
git commit -m "feat(backend): persist normalized TTC alerts atomically"
```

## Task 5: Track Runs And Schedule Polling

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunSnapshot.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunStore.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionRunService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertPollingJob.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/IngestionRunServiceTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionServiceTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/LinewatchApplication.java`

- [ ] **Step 1: Write failing run-tracking and coordinator tests**

For `IngestionRunServiceTest`, mock `IngestionRunStore` and verify:

```java
@Test
void startsAlertRunWithClockTimestamp() {
    when(store.createRunning(now)).thenReturn(42L);

    assertThat(service.start()).isEqualTo(42L);
}

@Test
void recordsSuccessfulCountsAndSourceFeedTimestamp() {
    service.succeed(42L, counts, feedUpdatedAt);

    verify(store).markSuccess(42L, now, counts, feedUpdatedAt);
}

@Test
void boundsPersistedFailureMessage() {
    service.fail(42L, new IllegalStateException("x".repeat(4000)));

    verify(store).markFailed(eq(42L), eq(now), argThat(message -> message.length() == 1000));
}
```

For `TtcAlertIngestionServiceTest`, verify:

```java
@Test
void successfulPollFetchesAppliesAndCompletesRun() {
    when(runService.start()).thenReturn(42L);
    when(client.fetch()).thenReturn(feed);
    when(applicationService.apply(feed)).thenReturn(counts);

    service.ingestNow();

    verify(runService).succeed(42L, counts, feed.lastUpdated());
    verify(runService, never()).fail(anyLong(), any());
}

@Test
void failedPollRecordsFailureAndRethrowsWithoutApplyingEmptyFeed() {
    when(runService.start()).thenReturn(42L);
    when(client.fetch()).thenThrow(new TtcAlertClientException("offline"));

    assertThatThrownBy(service::ingestNow)
        .isInstanceOf(TtcAlertClientException.class);

    verify(applicationService, never()).apply(any());
    verify(runService).fail(eq(42L), any(TtcAlertClientException.class));
}
```

- [ ] **Step 2: Run the run-tracking tests to verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionRunServiceTest,TtcAlertIngestionServiceTest test
```

Expected: FAIL because run-tracking and coordinator types do not exist.

- [ ] **Step 3: Implement the run store and `REQUIRES_NEW` service**

Define:

```java
public record IngestionRunSnapshot(
    long id,
    String status,
    OffsetDateTime startedAt,
    OffsetDateTime completedAt,
    int recordsFetched,
    int recordsStaged,
    int recordsNormalized,
    int recordsUnmatched,
    OffsetDateTime sourceFeedUpdatedAt,
    String errorMessage
) {}
```

Implement `IngestionRunStore` with `NamedParameterJdbcTemplate`:

```sql
insert into ingestion_runs (run_type, status, started_at)
values ('alerts', 'running', :startedAt)
returning id
```

```sql
update ingestion_runs set
    status = 'success',
    completed_at = :completedAt,
    records_processed = :recordsNormalized,
    records_fetched = :recordsFetched,
    records_staged = :recordsStaged,
    records_normalized = :recordsNormalized,
    records_unmatched = :recordsUnmatched,
    source_feed_updated_at = :sourceFeedUpdatedAt,
    error_message = null
where id = :id
```

```sql
update ingestion_runs set
    status = 'failed',
    completed_at = :completedAt,
    error_message = :errorMessage
where id = :id
```

Add a latest-run query:

```sql
select id, status, started_at, completed_at, records_fetched, records_staged,
       records_normalized, records_unmatched, source_feed_updated_at, error_message
from ingestion_runs
where run_type = 'alerts'
order by started_at desc
limit 1
```

Implement `IngestionRunService`:

```java
@Service
public class IngestionRunService {
    private static final int MAX_ERROR_LENGTH = 1000;
    private final IngestionRunStore store;
    private final Clock clock;

    public IngestionRunService(IngestionRunStore store, Clock clock) {
        this.store = store;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long start() {
        return store.createRunning(now());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(long id, FeedApplicationCounts counts, OffsetDateTime sourceFeedUpdatedAt) {
        store.markSuccess(id, now(), counts, sourceFeedUpdatedAt);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(long id, Throwable failure) {
        String message = failure.getMessage() == null
            ? failure.getClass().getSimpleName()
            : failure.getMessage();
        store.markFailed(id, now(), message.substring(0, Math.min(message.length(), MAX_ERROR_LENGTH)));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }
}
```

- [ ] **Step 4: Implement the coordinator and conditional polling job**

```java
@Service
public class TtcAlertIngestionService {
    private final TtcAlertClient client;
    private final TtcAlertFeedApplicationService applicationService;
    private final IngestionRunService runService;

    public void ingestNow() {
        long runId = runService.start();
        try {
            TtcAlertFeed feed = client.fetch();
            FeedApplicationCounts counts = applicationService.apply(feed);
            runService.succeed(runId, counts, feed.lastUpdated());
        } catch (RuntimeException exception) {
            runService.fail(runId, exception);
            throw exception;
        }
    }
}
```

Add constructor injection.

Implement `TtcAlertPollingJob`:

```java
@Component
@ConditionalOnProperty(
    prefix = "linewatch.ingestion.alerts",
    name = "enabled",
    havingValue = "true"
)
public class TtcAlertPollingJob {
    private static final Logger log = LoggerFactory.getLogger(TtcAlertPollingJob.class);
    private final TtcAlertIngestionService service;

    public TtcAlertPollingJob(TtcAlertIngestionService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${linewatch.ingestion.alerts.fixed-delay:PT2M}")
    public void poll() {
        try {
            service.ingestNow();
        } catch (RuntimeException exception) {
            log.error("TTC alert ingestion failed", exception);
        }
    }
}
```

Enable scheduling infrastructure in `LinewatchApplication`:

```java
@EnableScheduling
@SpringBootApplication
public class LinewatchApplication {
```

- [ ] **Step 5: Run the run-tracking tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionRunServiceTest,TtcAlertIngestionServiceTest test
```

Expected: PASS.

- [ ] **Step 6: Commit run tracking and scheduling**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion
git commit -m "feat(backend): schedule tracked TTC alert polling"
```

## Task 6: Expose Ingestion Health

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/health/IngestionHealthControllerTest.java`

- [ ] **Step 1: Write failing controller tests**

```java
package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class IngestionHealthControllerTest {
    private final IngestionRunStore store = mock(IngestionRunStore.class);
    private final IngestionHealthController controller = new IngestionHealthController(store);

    @Test
    void returnsNotRunStateBeforeFirstPoll() {
        when(store.findLatest()).thenReturn(Optional.empty());

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("not-run");
        assertThat(response.dashboardLive()).isFalse();
    }

    @Test
    void returnsLatestRunWithoutClaimingDashboardIsLive() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T07:00:00Z");
        when(store.findLatest()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L, "success", started, started.plusSeconds(2),
            44, 44, 12, 3, started.minusMinutes(1), null
        )));

        IngestionHealthController.IngestionHealthResponse response = controller.ingestion();

        assertThat(response.status()).isEqualTo("success");
        assertThat(response.recordsFetched()).isEqualTo(44);
        assertThat(response.recordsNormalized()).isEqualTo(12);
        assertThat(response.dashboardLive()).isFalse();
    }
}
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionHealthControllerTest test
```

Expected: FAIL because `IngestionHealthController` does not exist.

- [ ] **Step 3: Implement the health endpoint**

```java
package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.time.OffsetDateTime;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/ingestion")
public class IngestionHealthController {
    private final IngestionRunStore store;

    public IngestionHealthController(IngestionRunStore store) {
        this.store = store;
    }

    @GetMapping
    public IngestionHealthResponse ingestion() {
        return store.findLatest()
            .map(this::toResponse)
            .orElseGet(() -> new IngestionHealthResponse(
                "not-run", false, null, null, 0, 0, 0, 0, null, null
            ));
    }

    private IngestionHealthResponse toResponse(IngestionRunSnapshot run) {
        return new IngestionHealthResponse(
            run.status(),
            false,
            run.startedAt(),
            run.completedAt(),
            run.recordsFetched(),
            run.recordsStaged(),
            run.recordsNormalized(),
            run.recordsUnmatched(),
            run.sourceFeedUpdatedAt(),
            run.errorMessage()
        );
    }

    public record IngestionHealthResponse(
        String status,
        boolean dashboardLive,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        int recordsFetched,
        int recordsStaged,
        int recordsNormalized,
        int recordsUnmatched,
        OffsetDateTime sourceFeedUpdatedAt,
        String errorMessage
    ) {}
}
```

- [ ] **Step 4: Run the controller test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionHealthControllerTest test
```

Expected: PASS.

- [ ] **Step 5: Commit ingestion health**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java \
  backend/src/test/java/com/calebhabesh/linewatch/health/IngestionHealthControllerTest.java
git commit -m "feat(backend): expose alert ingestion health"
```

## Task 7: Align Documentation And Verify End To End

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Update documentation claims**

Update the docs with these exact boundaries:

- The backend can poll and stage the official TTC Live Alerts feed when `LINEWATCH_INGESTION_ALERTS_ENABLED=true`.
- Route-alert normalization covers supported subway/LRT lines and structured closure, suspension, and reduced-speed cases.
- Elevator and escalator outages are normalized and linked to seeded stations where TTC names resolve.
- `/api/health/ingestion` reports poll outcomes.
- Visible `/api/alerts`, `/api/status`, station detail, and map-overlay responses remain seeded demo data until the next slice.
- Live station arrivals remain demo-only estimates.
- Imported GTFS geometry, populated PostGIS segments, Redis-backed status, commute impact, and reliability aggregation remain future work.

Keep `AGENTS.md` and `GEMINI.md` byte-for-byte synchronized:

```bash
cmp -s AGENTS.md GEMINI.md
```

Expected: exit code `0`.

- [ ] **Step 2: Run the full backend suite**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 3: Check the diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Confirm unrelated pre-existing edits remain intact.

- [ ] **Step 4: Verify Flyway and the disabled-by-default application path**

Start local infrastructure:

```bash
docker compose up -d postgres redis
```

Start the backend with ingestion disabled:

```bash
mvn -f backend/pom.xml spring-boot:run
```

From another terminal:

```bash
curl --fail --silent http://localhost:8080/api/health
curl --fail --silent http://localhost:8080/api/health/ingestion
```

Expected:

```json
{"service":"linewatch-backend","status":"ok"}
```

and a `status` of `not-run` when no poll has executed.

If Flyway reports a checksum mismatch because an existing local Docker volume applied an earlier edited migration, preserve the volume and report the mismatch. Verify against a disposable PostgreSQL volume rather than deleting user data without approval.

- [ ] **Step 5: Verify one explicit live poll when network access is available**

Stop the disabled backend, then run:

```bash
LINEWATCH_INGESTION_ALERTS_ENABLED=true \
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT10M \
mvn -f backend/pom.xml spring-boot:run
```

After the initial scheduled execution, run:

```bash
curl --fail --silent http://localhost:8080/api/health/ingestion
```

Expected: `status` is `success`, `recordsFetched` is greater than zero, and `dashboardLive` remains `false`.

If sandboxing or network restrictions block the official TTC request, report the exact failed command and rely on the deterministic mocked client tests for automated verification.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md AGENTS.md GEMINI.md HANDOVER.md
git commit -m "docs: document TTC alert ingestion foundation"
```

- [ ] **Step 7: Final verification**

Run:

```bash
mvn -f backend/pom.xml test
git diff --check
git status --short
```

Expected: backend tests pass, no whitespace errors exist, and only preserved unrelated worktree changes remain.

## Next Slice

After this plan passes verification, create a separate design and implementation plan for the live read-path switch:

1. Read normalized database alerts in `/api/alerts?type=live|planned`.
2. Derive `/api/status` from active normalized route alerts.
3. Replace seeded station outage summaries with active accessibility-outage reads.
4. Include route alerts linked through `alert_stations` in station detail.
5. Design display-segment projection for live map overlays while preserving complete frontend fixture fallback.

Live arrivals remain the following separate slice after the live alert read paths stabilize.
