# Alert Taxonomy And Map Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate ordinary delays from Reduced Speed Zones, expose precise alert timestamps and richer RSZ metadata, render layered clickable map impacts including single-station rings, and add a dedicated delay submenu with an amber TV-static overlay.

**Architecture:** Keep TTC normalization and persistence additive: every route alert gains an explicit `impactKind`, while the existing `type` and `severity` fields remain available during the transition. The dashboard API returns independent impact layers per network segment plus station-node impacts, and the frontend uses a typed selection object to connect map overlays to submenu cards. Preserve the repository SVG because it already contains canonical nonlinear guide paths; verify those authored guides with a fixture test before changing the asset.

**Tech Stack:** Java 21, Spring Boot, Flyway, JPA, Maven, Next.js App Router, React, TypeScript, CSS, Node test runner, Playwright.

---

## Scope Boundary

This plan implements the first approved slice from
`docs/superpowers/specs/2026-06-02-alert-taxonomy-and-map-interactions-design.md`.

Included:

- Strict distinction between suspensions, ordinary delays, RSZ alerts, and planned closures.
- Case-insensitive `"Both ways"` normalization.
- Separate `Started` and `Updated` card timestamps.
- Rich RSZ metadata.
- Dedicated delay submenu and copied delay icon.
- Layered segment impacts.
- Clickable overlay paths.
- Clickable single-station alert rings.
- Existing 2.5 second blue selection flash.
- Automated checks for nonlinear SVG guides.

Deferred to follow-up slices:

- Nightly closure child-period activation.
- Station accessibility CSV import and wheelchair/elevator icons.
- Station elevator and escalator outage panels.
- Public arrival provider integration.
- Station emergency enrichment beyond alerts already present in the TTC source.

## Existing Dirty-Worktree Prerequisite

The checkout already contains uncommitted work for `targetRemoval`, route-first card
fields, timestamp helpers, and blue flashes. Treat those edits as a prerequisite
baseline. Do not revert them, fold them into unrelated commits, or rewrite the
untracked `V8__alert_target_removal.sql` migration. Add new persistence fields in
`V9__alert_impact_kind_and_rsz_metadata.sql`.

## Task 0: Verify And Checkpoint The Existing Baseline

**Files:**

- Inspect: all files reported by `git status --short`
- Verify: `backend/src/main/resources/db/migration/V8__alert_target_removal.sql`
- Verify: `frontend/src/components/ImpactCardFields.tsx`
- Verify: `frontend/src/hooks/useTorontoClock.ts`

- [ ] Step 1: Inspect the current dirty worktree.

Run:

```bash
git status --short
git diff --stat
git diff -- backend/src/main/resources/db/migration/V8__alert_target_removal.sql
git diff -- frontend/src/components/ImpactCardFields.tsx frontend/src/hooks/useTorontoClock.ts
```

Expected: the worktree contains the known in-progress alert-card polish. The
untracked V8 migration adds only `target_removal`.

- [ ] Step 2: Run the baseline checks before feature edits.

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: record any pre-existing failures before adding this slice. If the
baseline is green, preserve that result as the comparison point.

- [ ] Step 3: Confirm ownership before creating a baseline commit.

If the prerequisite edits remain uncommitted, ask the user whether those existing
edits should be checkpointed separately. Do not stage them without confirmation.
If the user confirms, run:

```bash
git add backend/src/main/resources/db/migration/V8__alert_target_removal.sql \
  backend/src/main/java/com/calebhabesh/linewatch \
  backend/src/test/java/com/calebhabesh/linewatch \
  frontend/src \
  frontend/tests
git commit -m "feat: enrich alert cards with source metadata"
```

Expected: the later slice commits contain only work described below.

## Task 1: Add Persistent Impact Kind And RSZ Metadata

**Files:**

- Create: `backend/src/main/resources/db/migration/V9__alert_impact_kind_and_rsz_metadata.sql`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertImpactKind.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionSchemaMigrationTest.java`

- [ ] Step 1: Write failing schema and store-parameter tests.

Add a migration test that reads V9 and asserts:

```java
assertThat(sql).contains("add column impact_kind");
assertThat(sql).contains("add column rsz_length");
assertThat(sql).contains("add column station_distance");
assertThat(sql).contains("add column track_percent");
assertThat(sql).contains("add column reduced_speed");
assertThat(sql).contains("add column average_speed");
assertThat(sql).contains("chk_alerts_impact_kind");
```

Extend `TtcAlertStoreTest.storesNormalizedDirectionWireValue` into a parameter
mapping test:

```java
assertThat(params.getValue("impactKind")).isEqualTo("reduced-speed-zone");
assertThat(params.getValue("rszLength")).isEqualTo("600 metres");
assertThat(params.getValue("stationDistance")).isEqualTo("900 metres");
assertThat(params.getValue("trackPercent")).isEqualTo("67%");
assertThat(params.getValue("reducedSpeed")).isEqualTo("15 km/h");
assertThat(params.getValue("averageSpeed")).isEqualTo("35 km/h");
```

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertIngestionSchemaMigrationTest,TtcAlertStoreTest test
```

Expected: FAIL because the entity and schema do not expose the new fields.

- [ ] Step 2: Add the additive V9 migration.

Create:

```sql
alter table alerts
    add column impact_kind varchar(32),
    add column rsz_length varchar(80),
    add column station_distance varchar(80),
    add column track_percent varchar(80),
    add column reduced_speed varchar(80),
    add column average_speed varchar(80);

update alerts
set impact_kind = case
    when type = 'planned-closure' then 'planned-closure'
    when severity = 'suspension' then 'suspension'
    when lower(coalesce(effect_description, '')) = 'reduced speed zone'
        then 'reduced-speed-zone'
    else 'delay'
end
where impact_kind is null;

alter table alerts
    alter column impact_kind set not null,
    add constraint chk_alerts_impact_kind
        check (impact_kind in (
            'suspension',
            'delay',
            'reduced-speed-zone',
            'planned-closure'
        ));
```

- [ ] Step 3: Add the wire-value enum.

Create:

```java
package com.calebhabesh.linewatch.ingestion;

public enum AlertImpactKind {
    SUSPENSION("suspension"),
    DELAY("delay"),
    REDUCED_SPEED_ZONE("reduced-speed-zone"),
    PLANNED_CLOSURE("planned-closure");

    private final String wireValue;

    AlertImpactKind(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
```

- [ ] Step 4: Extend source and normalized records.

Add these TTC source fields after `targetRemoval` in `TtcAlertRecord`:

```java
String rszLength,
String distance,
String trackPercent,
String reducedSpeed,
String averageSpeed,
```

Add these normalized fields after `targetRemoval` in `NormalizedRouteAlert`:

```java
AlertImpactKind impactKind,
String rszLength,
String stationDistance,
String trackPercent,
String reducedSpeed,
String averageSpeed,
```

- [ ] Step 5: Extend the entity and store upsert.

Add scalar columns to `AlertEntity`:

```java
@Column(name = "impact_kind", nullable = false, length = 32)
private String impactKind;

@Column(name = "rsz_length", length = 80)
private String rszLength;

@Column(name = "station_distance", length = 80)
private String stationDistance;

@Column(name = "track_percent", length = 80)
private String trackPercent;

@Column(name = "reduced_speed", length = 80)
private String reducedSpeed;

@Column(name = "average_speed", length = 80)
private String averageSpeed;
```

Add resolved station IDs:

```java
@ElementCollection(fetch = FetchType.EAGER)
@CollectionTable(name = "alert_stations", joinColumns = @JoinColumn(name = "alert_id"))
@OrderColumn(name = "sort_order")
@Column(name = "station_id")
private List<String> stationIds = new ArrayList<>();
```

Add:

```java
public List<String> getStationIds() { return stationIds; }
```

Extend the store SQL columns and update assignments:

```sql
impact_kind,
rsz_length,
station_distance,
track_percent,
reduced_speed,
average_speed
```

Bind:

```java
.addValue("impactKind", alert.impactKind().wireValue())
.addValue("rszLength", alert.rszLength())
.addValue("stationDistance", alert.stationDistance())
.addValue("trackPercent", alert.trackPercent())
.addValue("reducedSpeed", alert.reducedSpeed())
.addValue("averageSpeed", alert.averageSpeed());
```

Keep the existing `replaceAlertStations(alert)` call after the route-alert upsert.
It already synchronizes the ordered `alert_stations` rows used by the new entity
collection mapping.

- [ ] Step 6: Update fixture constructor calls.

Update every `TtcAlertRecord` and `NormalizedRouteAlert` constructor call in
backend tests with the six added values. Use `null` for non-RSZ records.

- [ ] Step 7: Run the persistence test.

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertIngestionSchemaMigrationTest,TtcAlertStoreTest test
```

Expected: PASS.

- [ ] Step 8: Commit the schema and model.

```bash
git add backend/src/main/resources/db/migration/V9__alert_impact_kind_and_rsz_metadata.sql \
  backend/src/main/java/com/calebhabesh/linewatch/alert/AlertEntity.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertImpactKind.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertIngestionSchemaMigrationTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java
git commit -m "feat: persist route alert impact kinds"
```

## Task 2: Normalize Strict Taxonomy And Bidirectional Wording

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParser.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParserTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TestAlertRecords.java`

- [ ] Step 1: Write failing taxonomy tests.

Add normalizer tests with explicit source records:

```java
assertThat(normalize(significantDelay).impactKind())
    .isEqualTo(AlertImpactKind.DELAY);
assertThat(normalize(explicitReducedSpeedZone).impactKind())
    .isEqualTo(AlertImpactKind.REDUCED_SPEED_ZONE);
assertThat(normalize(noService).impactKind())
    .isEqualTo(AlertImpactKind.SUSPENSION);
assertThat(normalize(plannedClosure).impactKind())
    .isEqualTo(AlertImpactKind.PLANNED_CLOSURE);
```

Use an ordinary delay with `effect = "SIGNIFICANT_DELAYS"` and a non-RSZ
`effectDesc`. Use an RSZ record with `effectDesc = "Reduced Speed Zone"`.
Add parameterized cases proving each structured field (`rszLength`, `distance`,
`trackPercent`, `reducedSpeed`, and `averageSpeed`) promotes a
`SIGNIFICANT_DELAYS` record to RSZ. Add a negative case proving metadata alone
does not promote an otherwise unsupported rapid-transit record.

- [ ] Step 2: Write failing direction tests.

Add:

```java
assertThat(parser.parse("Both ways", "", "", ""))
    .isEqualTo(AlertDirection.BIDIRECTIONAL);
assertThat(parser.parse("both ways", "", "", ""))
    .isEqualTo(AlertDirection.BIDIRECTIONAL);
```

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=TtcAlertNormalizerTest,AlertDirectionParserTest test
```

Expected: FAIL because ordinary delays and RSZ alerts share one classification and
`Both ways` is not recognized.

- [ ] Step 3: Extend direction parsing.

Update the lowercase text condition:

```java
if (text.contains("both directions")
    || text.contains("in both directions")
    || text.contains("both ways")) {
    return AlertDirection.BIDIRECTIONAL;
}
```

- [ ] Step 4: Replace the classification record.

Use:

```java
private record Classification(
    String type,
    String severity,
    AlertImpactKind impactKind
) {}
```

Apply this precedence in `classify`:

```java
if (isPlannedClosure(record)) {
    return new Classification(
        PLANNED_CLOSURE_TYPE,
        "planned",
        AlertImpactKind.PLANNED_CLOSURE
    );
}
if (isSuspension(record)) {
    return new Classification(
        ACTIVE_ALERT_TYPE,
        "suspension",
        AlertImpactKind.SUSPENSION
    );
}
if (isReducedSpeedZone(record)) {
    return new Classification(
        ACTIVE_ALERT_TYPE,
        "delay",
        AlertImpactKind.REDUCED_SPEED_ZONE
    );
}
if (equalsIgnoreCase(record.effect(), "SIGNIFICANT_DELAYS")) {
    return new Classification(
        ACTIVE_ALERT_TYPE,
        "delay",
        AlertImpactKind.DELAY
    );
}
return null;
```

Add:

```java
private boolean isReducedSpeedZone(TtcAlertRecord record) {
    return equalsIgnoreCase(record.effectDesc(), "Reduced Speed Zone")
        || (isDegradedService(record) && hasRszMetadata(record));
}

private boolean isDegradedService(TtcAlertRecord record) {
    return equalsIgnoreCase(record.effect(), "SIGNIFICANT_DELAYS");
}

private boolean hasRszMetadata(TtcAlertRecord record) {
    return hasText(record.rszLength())
        || hasText(record.distance())
        || hasText(record.trackPercent())
        || hasText(record.reducedSpeed())
        || hasText(record.averageSpeed());
}

private boolean isPlannedClosure(TtcAlertRecord record) {
    boolean hasChildPeriods = record.childAlerts() != null
        && !record.childAlerts().isEmpty();
    return equalsIgnoreCase(record.alertType(), "Planned")
        && (hasChildPeriods || hasClosureText(record));
}

private boolean isSuspension(TtcAlertRecord record) {
    return equalsIgnoreCase(record.effect(), "NO_SERVICE")
        || hasClosureText(record);
}

private boolean hasText(String value) {
    return value != null && !value.isBlank();
}
```

Pass the new kind and RSZ source values into `NormalizedRouteAlert`.

- [ ] Step 5: Include user-visible classification fields in the fingerprint.

Extend fingerprint input with:

```java
classification.impactKind().wireValue(),
nullToEmpty(record.targetRemoval()),
nullToEmpty(record.rszLength()),
nullToEmpty(record.distance()),
nullToEmpty(record.trackPercent()),
nullToEmpty(record.reducedSpeed()),
nullToEmpty(record.averageSpeed())
```

- [ ] Step 6: Run normalizer tests.

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=TtcAlertNormalizerTest,AlertDirectionParserTest test
```

Expected: PASS.

- [ ] Step 7: Commit normalization.

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/ingestion \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion
git commit -m "fix: separate delays from reduced speed zones"
```

## Task 3: Expose Delay Cards, Precise Timestamps, And Rich RSZ Fields

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjector.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertControllerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjectorTest.java`

- [ ] Step 1: Write failing dashboard service tests.

Add tests that seed one ordinary delay and one RSZ record. Assert:

```java
assertThat(service.delays()).extracting(DelayAlertDto::id)
    .containsExactly("delay-line-4");
assertThat(service.reducedSpeedZones()).extracting(ReducedSpeedZoneDto::id)
    .containsExactly("rsz-line-1");
```

Assert timestamps and rich fields:

```java
assertThat(delay.startedAt()).isEqualTo(activePeriodStart);
assertThat(delay.updatedAt()).isEqualTo(sourceUpdatedAt);
assertThat(rsz.cause()).isEqualTo("Track maintenance");
assertThat(rsz.resolution()).isEqualTo("June 8");
assertThat(rsz.rszLength()).isEqualTo("600 metres");
assertThat(rsz.averageSpeed()).isEqualTo("35 km/h");
```

Add projector tests:

```java
assertThat(line1BidirectionalZone.displayDirection())
    .isEqualTo("Northbound & Southbound");
assertThat(line2BidirectionalZone.displayDirection())
    .isEqualTo("Eastbound & Westbound");
```

- [ ] Step 2: Write a failing controller test.

Add:

```java
mockMvc.perform(get("/api/alerts").queryParam("type", "delay"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$[0].id").value("delay-line-4"))
    .andExpect(jsonPath("$[0].startedAt").value("2026-06-01T22:15:00-04:00"))
    .andExpect(jsonPath("$[0].updatedAt").value("2026-06-01T22:39:00-04:00"));
```

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertDashboardServiceTest,AlertControllerTest,ReducedSpeedZoneProjectorTest test
```

Expected: FAIL because the delay endpoint and timestamp DTO fields do not exist.

- [ ] Step 3: Add kind constants and kind-based filters.

In `AlertDashboardService`, filter by persisted kind:

```java
private static final String SUSPENSION_KIND = "suspension";
private static final String DELAY_KIND = "delay";
private static final String REDUCED_SPEED_ZONE_KIND = "reduced-speed-zone";
private static final String PLANNED_CLOSURE_KIND = "planned-closure";
```

Use:

```java
public List<DelayAlertDto> delays() {
    return freshActiveRouteAlerts().stream()
        .filter(alert -> DELAY_KIND.equals(alert.getImpactKind()))
        .map(this::toDelayAlert)
        .toList();
}
```

Restrict `reducedSpeedProjection()` to `REDUCED_SPEED_ZONE_KIND`.

- [ ] Step 4: Return absolute timestamps instead of preformatted ages.

Use `activePeriodStart` as `startedAt` and `sourceUpdatedAt` as `updatedAt` in
card DTOs:

```java
public record DelayAlertDto(
    String id,
    String lineId,
    String lineNumber,
    String title,
    String location,
    String description,
    List<String> affectedSegmentIds,
    OffsetDateTime startedAt,
    OffsetDateTime updatedAt,
    String source,
    String cause
) {}
```

Extend `ActiveAlertDto`, `ReducedSpeedZoneDto`, and `PlannedClosureDto` with the
same timestamp pair. Keep unrelated status-summary age strings unchanged in this
slice. For grouped RSZ cards, use the earliest non-null `activePeriodStart` as
`startedAt` and the latest non-null `sourceUpdatedAt` as `updatedAt`.

- [ ] Step 5: Add rich RSZ fields.

Extend `ReducedSpeedZoneDto`:

```java
String cause,
String resolution,
String rszLength,
String stationDistance,
String trackPercent,
String reducedSpeed,
String averageSpeed
```

Populate each field from grouped source records by taking the first nonblank
value. Populate DTO `cause` from `causeDescription` first and fall back to
`cause`; the user-facing card label remains `Cause`.

- [ ] Step 6: Use line-aware bidirectional display copy.

In `ReducedSpeedZoneProjector`, replace generic bidirectional text with:

```java
String displayDirection = displayDirection(group.lineId, group.sources);

private String displayDirection(String lineId, List<ProjectedSource> sources) {
    Set<AlertDirection> directions = sources.stream()
        .map(source -> effectiveDirection(source.alert()))
        .collect(Collectors.toSet());
    if (directions.contains(AlertDirection.UNKNOWN)) {
        return "Direction not specified";
    }
    if (directions.size() != 1 || directions.contains(AlertDirection.BIDIRECTIONAL)) {
        return bidirectionalLabel(lineId);
    }
    return formatDirection(directions.iterator().next());
}

private String bidirectionalLabel(String lineId) {
    return "line-1".equals(lineId)
        ? "Northbound & Southbound"
        : "Eastbound & Westbound";
}
```

Keep `"Direction not specified"` for unknown direction.

- [ ] Step 7: Add the endpoint.

In `AlertController`:

```java
case "delay" -> dashboardService.delays();
```

Keep:

```java
case "slowdown" -> dashboardService.reducedSpeedZones();
```

- [ ] Step 8: Run dashboard tests.

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertDashboardServiceTest,AlertControllerTest,ReducedSpeedZoneProjectorTest test
```

Expected: PASS.

- [ ] Step 9: Commit card API behavior.

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert \
  backend/src/test/java/com/calebhabesh/linewatch/alert
git commit -m "feat: add delay cards and precise alert timestamps"
```

## Task 4: Return Layered Segment Impacts And Station-Node Impacts

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`

- [ ] Step 1: Write a failing layered-impact service test.

Seed a suspension and a delay on the same segment. Assert:

```java
assertThat(service.activeSegmentImpacts().get("line-2-christie-ossington"))
    .extracting(SegmentImpact::kind)
    .containsExactly("delay", "suspension");
```

The order is intentional: lower-priority amber visuals render first and the
higher-priority suspension visual renders above them.

- [ ] Step 2: Write a failing station-node test.

Seed one ordinary delay that resolves to one station and no segment. Assert:

```java
assertThat(service.activeStationNodeImpacts())
    .containsExactly(new StationNodeImpact(
        "sheppard-yonge",
        "delay",
        "delay-line-4-sheppard-yonge",
        "Delay at Sheppard-Yonge"
    ));
```

- [ ] Step 3: Write a failing map controller test.

Assert:

```java
mockMvc.perform(get("/api/map"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.segments[0].impacts[0].kind").value("delay"))
    .andExpect(jsonPath("$.stationNodeImpacts[0].stationId")
        .value("sheppard-yonge"));
```

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertDashboardServiceTest,MapControllerTest test
```

Expected: FAIL because map overlays are scalar and station-node impacts are not
returned.

- [ ] Step 4: Replace scalar projection with a layered list.

Add:

```java
public record SegmentImpact(
    String kind,
    String cardId,
    String travelDirection,
    List<String> sourceAlertIds
) {}

public record StationNodeImpact(
    String stationId,
    String kind,
    String cardId,
    String title
) {}
```

Return:

```java
public Map<String, List<SegmentImpact>> activeSegmentImpacts()
```

Append independent impacts instead of using `putIfAbsent`. Sort each segment list
with:

```java
private int impactPriority(SegmentImpact impact) {
    return switch (impact.kind()) {
        case "reduced-speed-zone" -> 1;
        case "delay" -> 2;
        case "suspension" -> 3;
        default -> 0;
    };
}
```

- [ ] Step 5: Project single-station impacts.

Return one `StationNodeImpact` when an active card resolves to exactly one station
and has no affected segment IDs:

```java
private Optional<String> resolvedNodeStationId(
    List<String> stationIds,
    List<String> affectedSegmentIds
) {
    if (!affectedSegmentIds.isEmpty()) {
        return Optional.empty();
    }
    List<String> distinctStations = stationIds.stream()
        .filter(this::hasText)
        .distinct()
        .toList();
    return distinctStations.size() == 1
        ? Optional.of(distinctStations.getFirst())
        : Optional.empty();
}
```

Apply this to suspension cards, ordinary-delay cards, and grouped RSZ cards. For
an RSZ group, combine `getStationIds()` from its source alerts before checking for
one distinct station.

- [ ] Step 6: Extend the map response.

In `MapController`, expose:

```java
public record MapResponse(
    List<StationDto> stations,
    List<NetworkSegmentDto> segments,
    List<StationNodeImpactDto> stationNodeImpacts
) {}

public record SegmentImpactDto(
    String kind,
    String cardId,
    String travelDirection,
    List<String> sourceAlertIds
) {}

public record StationNodeImpactDto(
    String stationId,
    String kind,
    String cardId,
    String title
) {}
```

Add `List<SegmentImpactDto> impacts` to `NetworkSegmentDto`. Keep the current
scalar `overlay`, `alertId`, and `reducedSpeedZoneIds` fields temporarily by
deriving them from the highest-priority list item.

- [ ] Step 7: Run map tests.

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=AlertDashboardServiceTest,MapControllerTest test
```

Expected: PASS.

- [ ] Step 8: Commit layered map responses.

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java \
  backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java \
  backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java
git commit -m "feat: return layered map impacts"
```

## Task 5: Add Frontend Contracts, Delay Fetching, And Timestamp Formatting

**Files:**

- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/DataContext.tsx`
- Create: `frontend/src/app/impact-time.ts`
- Create: `frontend/src/components/ImpactTimestamp.tsx`
- Modify: `frontend/src/components/ImpactCardFields.tsx`
- Create: `frontend/tests/impact-timestamp.test.mjs`
- Modify: `frontend/tests/linewatch-data.test.mjs`

- [ ] Step 1: Write failing fixture tests.

Add fixture assertions:

```js
assert.ok(Array.isArray(delays));
assert.ok(Array.isArray(stationNodeImpacts));
assert.equal(delays.length, 0);
assert.equal(stationNodeImpacts.length, 0);
```

- [ ] Step 2: Write failing timestamp utility tests.

Add:

```js
assert.equal(
  formatRelativeImpactTime(
    "2026-06-01T22:15:00-04:00",
    new Date("2026-06-01T22:39:00-04:00"),
  ),
  "24 mins ago",
);
assert.equal(
  formatRelativeImpactTime(
    "2026-06-01T22:39:00-04:00",
    new Date("2026-06-01T22:39:30-04:00"),
  ),
  "just now",
);
assert.equal(
  formatRelativeImpactTime(
    "2026-06-01T18:00:00-04:00",
    new Date("2026-06-01T22:39:00-04:00"),
  ),
  "4 hrs 39 mins ago",
);
```

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because delays, station-node impacts, and timestamp formatting are
not defined.

- [ ] Step 3: Add frontend types.

In `linewatch-data.ts`:

```ts
export type ImpactKind =
  | "suspension"
  | "delay"
  | "reduced-speed-zone"
  | "planned-closure";

export type MapImpactKind = Exclude<ImpactKind, "planned-closure">;

export type ImpactSelection = {
  kind: ImpactKind;
  id: string;
} | null;

export type MapImpact = {
  kind: MapImpactKind;
  cardId: string;
  travelDirection: TravelDirection;
  sourceAlertIds: string[];
};

export type StationNodeImpact = {
  stationId: string;
  kind: MapImpactKind;
  cardId: string;
  title: string;
};
```

Add:

```ts
export type DelayAlert = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  description: string;
  affectedSegmentIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  source: string;
  cause?: string | null;
};
```

Extend `NetworkSegment` with `impacts?: MapImpact[]`, add absolute timestamps to
card DTOs, and add rich RSZ fields. Export empty fixture arrays:

```ts
export const delays: DelayAlert[] = [];
export const stationNodeImpacts: StationNodeImpact[] = [];
```

- [ ] Step 4: Fetch the delay endpoint and station-node impacts.

In `page.tsx`, request:

```ts
fetchSafe<DelayAlert[]>("/api/alerts?type=delay")
```

Include `stationNodeImpacts` from `/api/map` and preserve complete fixture fallback
when any required request fails.

- [ ] Step 5: Expose the new arrays from context.

Add `delays` and `stationNodeImpacts` to the context value and default fixture
data. Add these fields to `DashboardData`:

```ts
delays: DelayAlert[];
stationNodeImpacts: StationNodeImpact[];
```

- [ ] Step 6: Implement the plain TypeScript timestamp formatter.

Create `frontend/src/app/impact-time.ts`:

```ts
export function formatRelativeImpactTime(
  timestamp: string,
  now = new Date(),
): string {
  const elapsedMs = Math.max(0, now.getTime() - new Date(timestamp).getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const remainingMinutes = elapsedMinutes % 60;
  const minuteSuffix = remainingMinutes === 1 ? "" : "s";
  const minutePart = remainingMinutes > 0
    ? ` ${remainingMinutes} min${minuteSuffix}`
    : "";
  return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"}${minutePart} ago`;
}
```

Import this module directly from `frontend/tests/impact-timestamp.test.mjs`.

- [ ] Step 7: Add the per-minute timestamp component.

Create `frontend/src/components/ImpactTimestamp.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { formatRelativeImpactTime } from "../app/impact-time";

export function ImpactTimestamp({ timestamp }: { timestamp?: string | null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!timestamp) return <>Not reported</>;
  return (
    <time dateTime={timestamp} title={new Date(timestamp).toLocaleString()}>
      {formatRelativeImpactTime(timestamp)}
    </time>
  );
}
```

- [ ] Step 8: Render separate Started and Updated rows.

Update `ImpactCardFields.tsx` to accept:

```ts
startedAt?: string | null;
updatedAt?: string | null;
extraRows?: Array<{ label: string; value?: string | null }>;
```

Render:

```tsx
<div>
  <dt>Started</dt>
  <dd><ImpactTimestamp timestamp={startedAt} /></dd>
</div>
<div>
  <dt>Updated</dt>
  <dd><ImpactTimestamp timestamp={updatedAt} /></dd>
</div>
```

Filter blank `extraRows` before rendering.

- [ ] Step 9: Run frontend fixture tests and typecheck.

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] Step 10: Commit contracts and timestamps.

```bash
git add frontend/src/app/linewatch-data.ts \
  frontend/src/app/page.tsx \
  frontend/src/app/DataContext.tsx \
  frontend/src/app/impact-time.ts \
  frontend/src/components/ImpactTimestamp.tsx \
  frontend/src/components/ImpactCardFields.tsx \
  frontend/tests/impact-timestamp.test.mjs \
  frontend/tests/linewatch-data.test.mjs
git commit -m "feat: add delay data and alert timestamps"
```

## Task 6: Add Delay Navigation, Rich Cards, And Typed Selection

**Files:**

- Copy: `${LINEWATCH_ASSET_DIR}/delay-icon.svg`
- Create: `frontend/public/assets/linewatch/delay-icon.svg`
- Create: `frontend/src/components/DelaysPanel.tsx`
- Create: `frontend/src/hooks/useScrollSelectedImpactCard.ts`
- Modify: `frontend/src/components/ActiveAlertsPanel.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/PlannedClosuresPanel.tsx`
- Modify: `frontend/src/components/LineLegend.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] Step 1: Copy the provided icon.

Run:

```bash
cp ${LINEWATCH_ASSET_DIR}/delay-icon.svg \
  frontend/public/assets/linewatch/delay-icon.svg
```

Expected: the copied asset is versioned with the frontend public assets.

- [ ] Step 2: Write a failing layout test.

Assert source markup contains the delay panel, menu entry, and typed card marker:

```js
assert.match(shellSource, /activeView === "delays"/);
assert.match(shellSource, /\/assets\/linewatch\/delay-icon\.svg/);
assert.match(delaysPanelSource, /data-impact-card-id=/);
assert.match(delaysPanelSource, /Started/);
```

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the delay submenu does not exist.

- [ ] Step 3: Add card scroll behavior.

Create:

```ts
"use client";

import { useEffect } from "react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";

export function useScrollSelectedImpactCard(
  selection: ImpactSelection,
  kind: ImpactKind,
) {
  useEffect(() => {
    if (selection?.kind !== kind) return;
    const card = document.querySelector<HTMLElement>(
      `[data-impact-card-id="${CSS.escape(selection.id)}"]`,
    );
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [kind, selection]);
}
```

- [ ] Step 4: Create `DelaysPanel`.

Follow the existing RSZ panel structure. Use:

```tsx
<article data-impact-card-id={delay.id} className={cardClassName}>
  <Image src="/assets/linewatch/delay-icon.svg" alt="" width={20} height={20} />
  <h3>{delay.title}</h3>
  <LineBadge lineId={delay.lineId} lineNumber={delay.lineNumber} />
  <ImpactRouteHeader location={delay.location} />
  <MetadataGrid
    source={delay.source}
    startedAt={delay.startedAt}
    updatedAt={delay.updatedAt}
    extraRows={[{ label: "Cause", value: delay.cause }]}
  />
  <button
    type="button"
    onClick={() => onSelectImpact({ kind: "delay", id: delay.id })}
  >
    Highlight on Map
  </button>
</article>
```

- [ ] Step 5: Make every panel use typed selection.

Replace separate selected alert and closure IDs with:

```ts
selection: ImpactSelection;
onSelectImpact: (selection: ImpactSelection) => void;
```

Add `data-impact-card-id={card.id}` to active, RSZ, delay, and closure cards.
Call `useScrollSelectedImpactCard(selection, kind)` inside each panel.

- [ ] Step 6: Enrich RSZ cards.

Render:

```tsx
extraRows={[
  { label: "Cause", value: zone.cause },
  { label: "Resolution", value: zone.resolution },
  { label: "Length", value: zone.rszLength },
  { label: "Station distance", value: zone.stationDistance },
  { label: "Track affected", value: zone.trackPercent },
  { label: "Reduced speed", value: zone.reducedSpeed },
  { label: "Average speed", value: zone.averageSpeed },
]}
```

Pass `zone.displayDirection` directly to `ImpactRouteHeader`; remove the previous
`"Both Directions"` special-case join because the backend now returns rider-facing
axis copy.

- [ ] Step 7: Add delay navigation and menu routing.

In `LineWatchShell`, add `"delays"` to the view union, add the submenu button with
the copied icon, add the panel branch, and map kind to submenu:

```ts
function viewForImpactKind(kind: ImpactKind): ActiveView {
  switch (kind) {
    case "suspension":
      return "alerts";
    case "delay":
      return "delays";
    case "reduced-speed-zone":
      return "reduced-speed-zones";
    case "planned-closure":
      return "closures";
  }
}
```

Use one selection state:

```ts
const [selection, setSelection] = useState<ImpactSelection>(null);

const handleMapSelectImpact = (nextSelection: ImpactSelection) => {
  setSelectedStationId(null);
  if (!nextSelection) {
    setSelection(null);
    return;
  }
  setActiveView(viewForImpactKind(nextSelection.kind));
  setSelection(nextSelection);
};
```

- [ ] Step 8: Add delay status indicators.

Include `delays` in the shell destructuring and at-a-glance checks:

```ts
const hasDelay = delays.some((delay) => delay.lineId === line.id);
const isClear = !hasAlert && !hasDelay && !hasRSZ && !hasClosure;
```

Render the delay icon next to line status when `hasDelay` is true.

- [ ] Step 9: Add delay legend entry.

Use the copied icon and amber label in `LineLegend`.

- [ ] Step 10: Run fixture tests and typecheck.

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] Step 11: Commit delay UI.

```bash
git add frontend/public/assets/linewatch/delay-icon.svg \
  frontend/src/components/DelaysPanel.tsx \
  frontend/src/hooks/useScrollSelectedImpactCard.ts \
  frontend/src/components/ActiveAlertsPanel.tsx \
  frontend/src/components/ReducedSpeedZonesPanel.tsx \
  frontend/src/components/PlannedClosuresPanel.tsx \
  frontend/src/components/LineLegend.tsx \
  frontend/src/components/LineWatchShell.tsx \
  frontend/tests/drawer-layout.test.mjs
git commit -m "feat: add delay submenu and rich impact cards"
```

## Task 7: Render Clickable Layered Overlays And Single-Station Rings

**Files:**

- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] Step 1: Write failing source-level rendering tests.

Assert:

```js
assert.match(mapSource, /segment\.impacts/);
assert.match(mapSource, /stationNodeImpacts/);
assert.match(mapSource, /pointerEvents="stroke"/);
assert.match(mapSource, /onSelectImpact\(\{ kind: impact\.kind, id: impact\.cardId \}\)/);
assert.match(mapSource, /feTurbulence/);
assert.match(mapSource, /prefers-reduced-motion/);
```

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the map still uses scalar overlays.

- [ ] Step 2: Flatten segment impact layers.

In `InteractiveTtcMap`, use `segment.impacts` and preserve legacy scalar fields
only as fallback:

```ts
const renderedImpactLayers = renderedOverlaySegments.flatMap((segment) => {
  const impacts = segment.impacts ?? legacyImpactsForSegment(segment);
  return impacts.map((impact) => ({ segment, impact }));
});
```

- [ ] Step 3: Add SVG delay-static definitions.

Add:

```tsx
<filter id="delay-static-filter" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence
    type="fractalNoise"
    baseFrequency="0.85"
    numOctaves="2"
    seed="7"
    result="noise"
  >
    {reducedMotion ? null : (
      <animate
        attributeName="seed"
        values="7;19;3;31;11;7"
        dur="700ms"
        repeatCount="indefinite"
      />
    )}
  </feTurbulence>
  <feColorMatrix in="noise" type="saturate" values="0" result="monoNoise" />
  <feComposite in="monoNoise" in2="SourceGraphic" operator="in" />
</filter>
```

Apply an amber base path plus a monochrome filtered path. Use CSS animation on the
filtered path for normal motion and disable animation under reduced motion:

```css
.delay-static-path {
  filter: url("#delay-static-filter");
  stroke: #f59e0b;
  stroke-dasharray: 2 5 11 3;
  animation: delay-static-shift 700ms steps(4, end) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .delay-static-path {
    animation: none;
  }
}

.motion-paused .delay-static-path {
  animation: none;
}
```

- [ ] Step 4: Preserve RSZ chevrons and suspension styling.

Use the impact kind switch:

```ts
switch (impact.kind) {
  case "suspension":
    return "suspension";
  case "delay":
    return "delay-static";
  case "reduced-speed-zone":
    return "reduced-speed-zone";
}
```

Keep planned-preview blue highlighting for closure selection.

- [ ] Step 5: Make overlay strokes clickable.

Render each overlay path as an accessible button-like target:

```tsx
<path
  d={segment.pathD}
  className={overlayClassName}
  role="button"
  tabIndex={0}
  aria-label={ariaLabel}
  onClick={(event) => {
    event.stopPropagation();
    onSelectImpact({ kind: impact.kind, id: impact.cardId });
  }}
  onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectImpact({ kind: impact.kind, id: impact.cardId });
    }
  }}
  onPointerDown={(event) => event.stopPropagation()}
/>
```

The shell callback must open the matching submenu, scroll to the card, apply the
existing 2.5 second blue flash, clear the selection, and leave the submenu open.

- [ ] Step 6: Render single-station rings above station hit circles.

Render station hit targets first and rings afterward. This makes the ring stroke
clickable while clicks inside the ring still reach the existing station target:

```tsx
{stationNodeImpacts.map((impact) => {
  const station = stationSummariesById.get(impact.stationId);
  if (!station) return null;
  return (
    <circle
      key={`${impact.kind}:${impact.cardId}:${impact.stationId}`}
      cx={station.mapX}
      cy={station.mapY}
      r={105}
      fill="none"
      pointerEvents="stroke"
      className={`station-impact-ring station-impact-ring--${impact.kind}`}
      role="button"
      tabIndex={0}
      aria-label={`${impact.title}. Open alert details.`}
      onClick={(event) => {
        event.stopPropagation();
        onSelectImpact({ kind: impact.kind, id: impact.cardId });
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
})}
```

Add keyboard handling matching segment paths.

- [ ] Step 7: Add ring styling.

Use:

```css
.station-impact-ring {
  stroke-width: 24;
  vector-effect: non-scaling-stroke;
  cursor: pointer;
  animation: station-impact-pulse 1.6s ease-in-out infinite;
}

.station-impact-ring--suspension {
  stroke: #ef4444;
}

.station-impact-ring--delay {
  stroke: #f59e0b;
}

.station-impact-ring--reduced-speed-zone {
  stroke: #fbbf24;
}

@media (prefers-reduced-motion: reduce) {
  .station-impact-ring {
    animation: none;
  }
}

.motion-paused .station-impact-ring {
  animation: none;
}
```

- [ ] Step 8: Run frontend checks.

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] Step 9: Commit map interactions.

```bash
git add frontend/src/components/InteractiveTtcMap.tsx \
  frontend/src/app/globals.css \
  frontend/tests/map-layering.test.mjs
git commit -m "feat: make map impacts clickable"
```

## Task 8: Lock Nonlinear SVG Guide Compatibility

**Files:**

- Inspect: `${LINEWATCH_ASSET_DIR}/TTC_Subway Map_Edited.svg`
- Inspect: `frontend/public/assets/linewatch/ttc-subway-map-edited.svg`
- Create: `frontend/tests/map-asset-guides.test.mjs`
- Modify only if needed: `frontend/public/assets/linewatch/ttc-subway-map-edited.svg`

- [ ] Step 1: Compare the supplied and repository SVGs.

Run:

```bash
sha256sum \
  "${LINEWATCH_ASSET_DIR}/TTC_Subway Map_Edited.svg" \
  frontend/public/assets/linewatch/ttc-subway-map-edited.svg
rg -n "segment-guides-layer|non-linear-guides-layer|king|union|st-andrew|st-george|spadina|dupont" \
  "${LINEWATCH_ASSET_DIR}/TTC_Subway Map_Edited.svg" \
  frontend/public/assets/linewatch/ttc-subway-map-edited.svg
```

Expected: the repository asset contains canonical hidden runtime guide paths that
must be preserved. Do not copy the supplied SVG over the repository asset unless
those paths and station anchors remain intact.

- [ ] Step 2: Write a failing guide-compatibility test if the asset drifts.

Create a Node test that reads the repository SVG and asserts:

```js
assert.match(svg, /inkscape:label="segment-guides-layer"/);
assert.match(svg, /inkscape:label="seg-line-1-union-king"/);
assert.match(svg, /inkscape:label="seg-line-1-st-andrew-union"/);
assert.match(svg, /inkscape:label="seg-line-1-spadina-st-george"/);
assert.match(svg, /inkscape:label="seg-line-1-dupont-spadina"/);
```

Also assert station-dot anchors:

```js
assert.match(svg, /id="station-king"/);
assert.match(svg, /id="station-union"/);
assert.match(svg, /id="station-st-andrew"/);
assert.match(svg, /id="station-st-george"/);
assert.match(svg, /id="station-spadina-1"/);
assert.match(svg, /id="station-spadina-2"/);
assert.match(svg, /id="station-dupont"/);
```

- [ ] Step 3: Run the asset test.

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS with the repository asset. If a visual SVG refresh is imported,
keep the canonical guide layer and rerun until PASS.

- [ ] Step 4: Commit the compatibility test.

```bash
git add frontend/tests/map-asset-guides.test.mjs
git commit -m "test: protect nonlinear map guides"
```

## Task 9: Update Stub Data And Add Browser Coverage

**Files:**

- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Step 1: Add smoke stub responses.

Add:

```js
export const delays = [
  {
    id: "stub-delay-line-4",
    lineId: "line-4",
    lineNumber: "4",
    title: "Delay between Sheppard-Yonge and Don Mills",
    location: "Sheppard-Yonge to Don Mills",
    description: "Trains are moving slowly.",
    affectedSegmentIds: ["line-4-sheppard-yonge-don-mills"],
    startedAt: "2026-06-01T22:15:00-04:00",
    updatedAt: "2026-06-01T22:39:00-04:00",
    source: "TTC Live Alert",
    cause: "Operational issue",
  },
];
```

Add `impacts` to affected map segments and `stationNodeImpacts` to the stub map
response. Route `/api/alerts?type=delay` to `delays`.

- [ ] Step 2: Add Playwright tests.

Cover:

```ts
await page.getByRole("button", { name: "Delays" }).click();
await expect(page.getByText("Delay between Sheppard-Yonge and Don Mills"))
  .toBeVisible();
await expect(page.getByText("Started")).toBeVisible();
await expect(page.getByText("Updated")).toBeVisible();
```

Then click a delay map overlay by accessible name and assert that the delays
submenu opens and the matching card receives the temporary selected class.

Add a single-station stub impact and click its ring by accessible name. Assert the
matching submenu card becomes visible.

- [ ] Step 3: Run smoke tests.

Run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] Step 4: Commit browser coverage.

```bash
git add frontend/tests/smoke/api-stub-data.mjs \
  frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover delay overlay interactions"
```

## Task 10: Align Documentation And Run Full Verification

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] Step 1: Update README claims.

Document:

- User-facing delay cards are distinct from explicit RSZ cards.
- `Started` is based on `activePeriod.start`.
- `Updated` is based on TTC `lastUpdated`.
- Map segment overlays and single-station alert rings are clickable.
- RSZ overlays use chevrons; ordinary delay overlays use amber static.
- Station accessibility metadata, live arrivals, and nightly closure windows remain
  follow-up work.

- [ ] Step 2: Update agent guidance in both copies.

In both `AGENTS.md` and `GEMINI.md`, add matching Current Reality and Backend
Direction statements for the completed slice. Keep the unofficial-product
guardrail and avoid claiming live arrivals or imported GTFS geometry.

- [ ] Step 3: Run backend verification.

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] Step 4: Run frontend verification.

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] Step 5: Inspect final workspace and commits.

Run:

```bash
git status --short
git log --oneline --decorate -8
```

Expected: only unrelated user-owned changes remain unstaged. Every slice commit is
scoped and reviewable.

- [ ] Step 6: Commit documentation.

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: describe alert taxonomy and map interactions"
```

## Manual Acceptance Checklist

- [ ] Ordinary `SIGNIFICANT_DELAYS` alerts appear only under Delays.
- [ ] Explicit RSZ alerts appear only under Reduced Speed Zones.
- [ ] A `Both ways` Line 1 RSZ card reads `Northbound & Southbound`.
- [ ] A `Both ways` Line 2, 4, 5, or 6 card reads `Eastbound & Westbound`.
- [ ] Cards render separate Started and Updated ages and refresh without reload.
- [ ] RSZ cards render Cause and Resolution when supplied.
- [ ] Ordinary delays render amber static and RSZ paths retain chevrons.
- [ ] Clicking an impact path opens its submenu, scrolls its card into view, flashes
  blue for 2.5 seconds, clears selection, and leaves the submenu open.
- [ ] Clicking a single-station ring opens its matching card.
- [ ] Clicking the center station dot still opens station detail.
- [ ] King-Union, St Andrew-Union, St George-Spadina, and Dupont-Spadina authored
  guide segments retain correct overlay geometry.
