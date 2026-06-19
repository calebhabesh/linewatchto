# GTFS-RT Rapid-Transit Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TTC GTFS-RT rapid-transit alerts visible throughout LineWatch TO when Live Alerts omits them, while preferring the richer Live Alerts projection when both sources describe the same incident.

**Architecture:** Extend the existing combined GTFS-RT text adapter to identify supported rapid-transit line IDs, then resolve numeric stop IDs through the active static GTFS import before normalizing them into the existing `alerts` model. Normalize all source records first and apply a conservative source-priority matcher in the feed application service so raw records remain inspectable but only one rider-visible projection is persisted for a matched incident.

**Tech Stack:** Java 21, Spring Boot, Spring JDBC/JPA, PostgreSQL, JUnit 5, AssertJ, Mockito, Maven.

---

## File Structure

### Create

- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolver.java`
  - Resolves numeric GTFS stop IDs and explicit text bounds to LineWatch station IDs.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcher.java`
  - Decides whether one GTFS-RT projection duplicates one Live Alerts projection.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolverTest.java`
  - Covers static-GTFS resolution, text fallback, partial resolution, and line-wide fallback.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcherTest.java`
  - Covers conservative source, line, impact, timing, scope, and text matching.

### Modify

- `backend/src/main/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParser.java`
  - Classify supported route IDs as subway/LRT/rapid transit.
- `backend/src/test/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParserTest.java`
  - Add entity `70483` and multi-line parser regressions.
- `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeNormalizer.java`
  - Exclude the internal `Rapid Transit` route type from surface notices.
- `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java`
  - Read stop-to-station mappings from the active import with line order.
- `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepositoryTest.java`
  - Assert the lookup is scoped by active import, line, and stop IDs.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
  - Route GTFS-RT records through the new resolver and preserve absolute timestamps.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`
  - Cover entity `70483`, UTC timing, text fallback, and line-wide persistence.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java`
  - Supply the new resolver dependency without changing scenario behavior.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`
  - Stage first, normalize candidates, select canonical projections, then persist.
- `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java`
  - Cover both feed-only cases and Live Alerts preference/transition behavior.
- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
  - Derive DTO source labels from `source_alert_type`.
- `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
  - Verify GTFS-RT labels and mapped Line 2 segments.
- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java`
  - Rename local variables and warning text from “surface” to “service-alert supplement.”

No database migration or frontend change is required.

## Task 1: Parse Supported Rapid-Transit Route IDs

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParserTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParser.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeNormalizer.java`

- [ ] **Step 1: Add a failing parser regression for entity `70483`**

Add a test containing the supplied GTFS-RT entity and assert the rapid-transit
classification and absolute timestamps:

```java
@Test
void parsesSupportedRapidTransitEntityWithoutTreatingLineTwoAsBus() {
    String text = """
        header { gtfs_realtime_version: "2.0" incrementality: FULL_DATASET timestamp: 1781843332 }
        entity {
          id: "70483"
          alert {
            active_period { start: 1781885880 }
            informed_entity { route_id: "2" stop_id: "13784" }
            informed_entity { route_id: "2" stop_id: "13783" }
            informed_entity { route_id: "2" stop_id: "13781" }
            informed_entity { route_id: "2" stop_id: "13782" }
            informed_entity { route_id: "2" stop_id: "13780" }
            informed_entity { route_id: "2" stop_id: "13779" }
            informed_entity { route_id: "2" stop_id: "13777" }
            informed_entity { route_id: "2" stop_id: "13778" }
            cause: POLICE_ACTIVITY
            effect: NO_SERVICE
            header_text { translation { text: "Line 2 Bloor-Danforth: No service between Jane and Islington stations due to a security incident." language: "en" } }
            description_text { translation { text: "at Old Mill Station." language: "en" } }
          }
        }
        """;

    TtcAlertRecord record = parser.parse(text).getFirst().record();

    assertThat(record.id()).isEqualTo("gtfsrt-70483");
    assertThat(record.route()).isEqualTo("2");
    assertThat(record.routeType()).isEqualTo("Subway");
    assertThat(record.stopIDList()).containsExactly(
        "13784", "13783", "13781", "13782",
        "13780", "13779", "13777", "13778"
    );
    assertThat(record.effect()).isEqualTo("NO_SERVICE");
    assertThat(record.cause()).isEqualTo("POLICE_ACTIVITY");
    assertThat(record.lastUpdated()).isEqualTo(OffsetDateTime.parse("2026-06-19T04:28:52Z"));
    assertThat(record.activePeriod().start()).isEqualTo(
        OffsetDateTime.parse("2026-06-19T16:18:00Z")
    );
}
```

Add a second test asserting one entity with route IDs `2` and `5` receives
route type `Rapid Transit`, so it cannot be projected as one line or as a
surface notice.

- [ ] **Step 2: Run the parser test and confirm the current bus classification**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtServiceAlertTextParserTest test
```

Expected: FAIL because `route_id: "2"` is currently classified as `Bus`.

- [ ] **Step 3: Implement rapid-transit route classification**

In `GtfsRtServiceAlertTextParser`, add:

```java
private static final Set<String> SUBWAY_ROUTE_IDS = Set.of("1", "2", "4");
private static final Set<String> LRT_ROUTE_IDS = Set.of("5", "6");

private boolean isRapidTransitRoute(String routeId) {
    return SUBWAY_ROUTE_IDS.contains(routeId) || LRT_ROUTE_IDS.contains(routeId);
}
```

Update `inferredRouteType` with this precedence:

```java
if (routeIds.stream().allMatch(SUBWAY_ROUTE_IDS::contains)) {
    return "Subway";
}
if (routeIds.stream().allMatch(LRT_ROUTE_IDS::contains)) {
    return "LRT";
}
if (routeIds.stream().allMatch(this::isRapidTransitRoute)) {
    return "Rapid Transit";
}
```

Then retain the existing streetcar/bus/mixed-surface logic. In
`SurfaceServiceNoticeNormalizer`, exclude `rapid transit` alongside subway and
LRT so a multi-line rapid record remains staged but does not become a surface
notice.

- [ ] **Step 4: Run focused parser and surface tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtServiceAlertTextParserTest,SurfaceServiceNoticeNormalizerTest test
```

Expected: PASS.

- [ ] **Step 5: Commit parser classification**

```bash
git add \
  backend/src/main/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParser.java \
  backend/src/main/java/com/calebhabesh/linewatch/surface/SurfaceServiceNoticeNormalizer.java \
  backend/src/test/java/com/calebhabesh/linewatch/surface/GtfsRtServiceAlertTextParserTest.java
git commit -m "fix: classify GTFS-RT rapid transit alerts"
```

## Task 2: Resolve GTFS-RT Stops To Ordered Stations

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepositoryTest.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolver.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolverTest.java`

- [ ] **Step 1: Add failing resolver tests**

Mock `GtfsScheduleReadRepository` and `StationAliasResolver`. Cover:

```java
when(scheduleRepository.findActiveImportId()).thenReturn(Optional.of(91L));
when(scheduleRepository.findStationMappings(
    91L,
    "line-2",
    List.of("13784", "13783", "13781", "13782", "13780", "13779", "13777", "13778")
)).thenReturn(List.of(
    new GtfsScheduleReadRepository.StationMapping("13784", "jane", 10),
    new GtfsScheduleReadRepository.StationMapping("13783", "jane", 10),
    new GtfsScheduleReadRepository.StationMapping("13781", "runnymede", 20),
    new GtfsScheduleReadRepository.StationMapping("13782", "runnymede", 20),
    new GtfsScheduleReadRepository.StationMapping("13780", "high-park", 30),
    new GtfsScheduleReadRepository.StationMapping("13779", "high-park", 30),
    new GtfsScheduleReadRepository.StationMapping("13777", "islington", 60),
    new GtfsScheduleReadRepository.StationMapping("13778", "islington", 60)
));
```

Assert:

```java
assertThat(result.stationIds()).containsExactly(
    "jane", "runnymede", "high-park", "islington"
);
assertThat(result.startStationId()).isEqualTo("jane");
assertThat(result.endStationId()).isEqualTo("islington");
assertThat(result.unresolved()).isFalse();
```

Also add tests for:

- no active import plus `between Jane and Islington stations` resolves bounds;
- unknown stop IDs plus valid text bounds reports `unresolved = true`;
- no import and no resolvable text returns empty stations and
  `unresolved = true`;
- one partially mapped stop preserves the known station and reports unresolved.

- [ ] **Step 2: Run the resolver test and verify it fails to compile**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtRapidTransitStationResolverTest test
```

Expected: FAIL because the resolver and repository method do not exist.

- [ ] **Step 3: Add the repository lookup**

Add:

```java
public List<StationMapping> findStationMappings(
    long importId,
    String lineId,
    List<String> stopIds
) {
    if (stopIds.isEmpty()) {
        return List.of();
    }
    return jdbc.query("""
        select station_stop.stop_id,
               station_stop.station_id,
               station_line.sort_order
        from gtfs_station_stops station_stop
        join station_lines station_line
          on station_line.station_id = station_stop.station_id
         and station_line.line_id = station_stop.line_id
        where station_stop.import_id = :importId
          and station_stop.line_id = :lineId
          and station_stop.stop_id in (:stopIds)
        order by station_line.sort_order, station_stop.stop_id
        """, new MapSqlParameterSource()
            .addValue("importId", importId)
            .addValue("lineId", lineId)
            .addValue("stopIds", stopIds),
        (rs, rowNum) -> new StationMapping(
            rs.getString("stop_id"),
            rs.getString("station_id"),
            rs.getInt("sort_order")
        ));
}

public record StationMapping(String stopId, String stationId, int sortOrder) {}
```

Extend `GtfsScheduleReadRepositoryTest` to assert the source contains the
`import_id`, `line_id`, `stop_id in (:stopIds)`, and station-order constraints.

- [ ] **Step 4: Implement the focused resolver**

Create `GtfsRtRapidTransitStationResolver` with:

```java
public Resolution resolve(String lineId, List<String> stopIds, String sourceText)
```

Implementation rules:

- fetch mappings only when an active import and non-empty stop IDs exist;
- deduplicate mappings by station ID in repository order;
- consider stop resolution complete only when every distinct supplied stop ID
  appears in the mapping results;
- parse `between X and Y stations` and `from X to Y stations` from source text;
- resolve captures only through `StationAliasResolver`;
- use text bounds to fill missing endpoints, then include those bounds in the
  ordered station list without duplicates;
- return `unresolved = true` when any supplied stop is unknown or neither
  endpoint can be derived.

Expose:

```java
public record Resolution(
    List<String> stationIds,
    String startStationId,
    String endStationId,
    boolean unresolved
) {}
```

- [ ] **Step 5: Run resolver and repository tests**

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=GtfsRtRapidTransitStationResolverTest,GtfsScheduleReadRepositoryTest test
```

Expected: PASS.

- [ ] **Step 6: Commit station resolution**

```bash
git add \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepository.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolver.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleReadRepositoryTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/GtfsRtRapidTransitStationResolverTest.java
git commit -m "feat: resolve GTFS-RT rapid transit stops"
```

## Task 3: Normalize GTFS-RT Alerts Without Shifting Epoch Times

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java`

- [ ] **Step 1: Add failing normalizer tests**

Inject a mocked `GtfsRtRapidTransitStationResolver` into the normalizer. Add a
test using the parsed entity `70483` and:

```java
when(gtfsRtStationResolver.resolve(
    eq("line-2"),
    eq(List.of("13784", "13783", "13781", "13782", "13780", "13779", "13777", "13778")),
    contains("No service between Jane and Islington")
)).thenReturn(new GtfsRtRapidTransitStationResolver.Resolution(
    List.of("jane", "runnymede", "high-park", "royal-york", "old-mill", "islington"),
    "jane",
    "islington",
    false
));
```

Assert:

```java
assertThat(result.status()).isEqualTo(NormalizationStatus.MATCHED);
assertThat(alert.lineId()).isEqualTo("line-2");
assertThat(alert.impactKind()).isEqualTo(AlertImpactKind.SUSPENSION);
assertThat(alert.startStationId()).isEqualTo("jane");
assertThat(alert.endStationId()).isEqualTo("islington");
assertThat(alert.activePeriodStart())
    .isEqualTo(OffsetDateTime.parse("2026-06-19T16:18:00Z"));
assertThat(alert.sourceUpdatedAt())
    .isEqualTo(OffsetDateTime.parse("2026-06-19T04:28:52Z"));
```

Add another test returning an empty unresolved resolution and assert the
projection is `MATCHED_WITH_UNRESOLVED`, has no bounds, and still persists as
Line 2. Retain the existing Live Alerts wall-clock test unchanged.

- [ ] **Step 2: Run the normalizer test and verify the current behavior fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertNormalizerTest test
```

Expected: FAIL because numeric stop IDs are sent to the alias resolver and
GTFS-RT UTC values are shifted as Toronto wall times.

- [ ] **Step 3: Integrate the GTFS-RT resolver**

Add `GtfsRtRapidTransitStationResolver` to the constructor. In
`normalizeRoute`, derive `lineId` before station resolution and branch on:

```java
private boolean isGtfsRt(TtcAlertRecord record) {
    return equalsIgnoreCase(record.alertType(), "GTFS-RT");
}
```

For GTFS-RT records call:

```java
gtfsRtStationResolver.resolve(
    lineId,
    record.stopIDList() == null ? List.of() : record.stopIDList(),
    sourceText(record)
)
```

Use its internal station IDs and bounds directly. Continue using
`StationAliasResolver` for Live Alerts records.

Accept internal route type `rapid transit` in `RAPID_TRANSIT_TYPES`; its
comma-separated multi-line route value will then fail the single-line route
lookup and count as unmatched.

- [ ] **Step 4: Preserve GTFS-RT absolute timestamps**

Change the internal time conversion to accept the source record:

```java
private OffsetDateTime sourceTime(TtcAlertRecord record, OffsetDateTime value) {
    if (equalsIgnoreCase(record.alertType(), "GTFS-RT")) {
        return TtcAlertTimes.nullIfSentinel(value) == null
            ? null
            : value.withOffsetSameInstant(ZoneOffset.UTC);
    }
    return TtcAlertTimes.sourceWallTimeToInstant(value);
}
```

Use this method for parent periods, child periods, active bounds, and
`sourceUpdatedAt`.

- [ ] **Step 5: Update constructor call sites and run focused tests**

In `TtcAlertScenarioCatalogTest`, pass a mocked resolver that is unused for
Live Alerts scenarios. Update `TtcAlertNormalizerTest` setup similarly.

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=TtcAlertNormalizerTest,TtcAlertScenarioCatalogTest test
```

Expected: PASS.

- [ ] **Step 6: Commit source-aware normalization**

```bash
git add \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java
git commit -m "feat: normalize GTFS-RT rapid transit alerts"
```

## Task 4: Prefer Live Alerts For Matching Incidents

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcher.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcherTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java`

- [ ] **Step 1: Add failing duplicate-matcher tests**

Build `NormalizedRouteAlert` fixtures with independent source IDs and cover:

- matching Line 2 suspensions with reversed Jane/Islington bounds;
- equal resolved station sets;
- equal normalized title text;
- starts within 60 minutes;
- overlapping periods;
- missing time on one source;
- different line, impact, scope, or non-overlapping distant time returns false;
- GTFS-RT versus GTFS-RT and Live versus Live returns false because source
  priority applies only across sources.

Use:

```java
assertThat(matcher.isGtfsRtDuplicateOfLive(gtfsRt, live)).isTrue();
```

- [ ] **Step 2: Run the matcher test and verify it fails to compile**

Run:

```bash
mvn -f backend/pom.xml -Dtest=RapidTransitAlertDuplicateMatcherTest test
```

Expected: FAIL because the matcher does not exist.

- [ ] **Step 3: Implement conservative matching**

Create `RapidTransitAlertDuplicateMatcher` with:

```java
public boolean isGtfsRtDuplicateOfLive(
    NormalizedRouteAlert gtfsRt,
    NormalizedRouteAlert live
)
```

Require:

```java
isGtfsRt(gtfsRt)
&& !isGtfsRt(live)
&& Objects.equals(gtfsRt.lineId(), live.lineId())
&& gtfsRt.impactKind() == live.impactKind()
&& timingMatches(gtfsRt, live)
&& scopeMatches(gtfsRt, live)
```

Timing matches when one start is absent, starts differ by at most 60 minutes,
or the intervals overlap. Treat a null end as open-ended.

Scope matches when unordered non-null bounds are equal, non-empty station sets
are equal, or normalized titles are equal. Normalize titles with lowercasing,
punctuation removal, trimming, and whitespace collapse only.

- [ ] **Step 4: Add failing feed-selection tests**

Update service construction to include the matcher. Add separate fetched
records and projections for Live Alerts and GTFS-RT, then verify:

```java
verify(store).upsertSource("routes", liveFetched, NOW);
verify(store).upsertSource("routes", gtfsFetched, NOW);
verify(store).upsertRouteAlert(liveProjection, NOW);
verify(store, never()).upsertRouteAlert(gtfsProjection, NOW);
verify(store).deactivateMissingAlerts(Set.of(liveProjection.sourceId()), NOW);
```

Also test:

- GTFS-RT-only persists and remains in the seen alert source IDs;
- Live-only persists;
- unrelated records both persist;
- when only GTFS-RT remains in the next feed, its source ID is selected;
- `MATCHED_WITH_UNRESOLVED` still increments unmatched even when its projection
  is suppressed by a richer Live Alerts record.

- [ ] **Step 5: Refactor feed application into stage, normalize, select, persist**

Keep source staging and surface normalization for every route. Collect rapid
results as a small private record:

```java
private record RouteCandidate(
    NormalizationResult<NormalizedRouteAlert> result,
    NormalizedRouteAlert alert
) {}
```

After the route loop:

1. Count every `result.countsAsUnmatched()`.
2. Collect all `result.shouldPersist()` projections.
3. Keep every non-GTFS-RT projection.
4. Keep a GTFS-RT projection only when no Live projection matches it.
5. Upsert selected projections, increment `normalized`, and add only selected
   source IDs to `seenAlertSourceIds`.
6. Run existing deactivation calls after all selected projections are stored.

Do not change accessibility or surface-notice selection.

- [ ] **Step 6: Run application and matcher tests**

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=RapidTransitAlertDuplicateMatcherTest,TtcAlertFeedApplicationServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit canonical selection**

```bash
git add \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcher.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/RapidTransitAlertDuplicateMatcherTest.java \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationServiceTest.java
git commit -m "feat: prefer Live Alerts over GTFS-RT duplicates"
```

## Task 5: Report Accurate API Source Labels

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java`

- [ ] **Step 1: Add failing dashboard source tests**

Create a Line 2 suspension with:

```java
ReflectionTestUtils.setField(alert, "sourceAlertType", "GTFS-RT");
```

Use Jane and Islington bounds plus ordered Line 2 test segments. Assert:

```java
assertThat(dto.source()).isEqualTo("TTC GTFS-RT");
assertThat(dto.affectedSegmentIds()).containsExactly(
    "line-2-jane-runnymede",
    "line-2-runnymede-high-park",
    "line-2-high-park-royal-york",
    "line-2-royal-york-old-mill",
    "line-2-old-mill-islington"
);
```

Add GTFS-RT assertions for a delay and planned closure DTO. Keep existing Live
Alerts source assertions unchanged.

- [ ] **Step 2: Run dashboard test and verify hard-coded labels fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDashboardServiceTest test
```

Expected: FAIL because current DTO projections hard-code `TTC Live Alert` or
`TTC Service Advisory`.

- [ ] **Step 3: Add one source-label helper**

In `AlertDashboardService`, add:

```java
private String sourceLabel(AlertEntity alert, String liveAlertsDefault) {
    return "GTFS-RT".equalsIgnoreCase(alert.getSourceAlertType())
        ? "TTC GTFS-RT"
        : liveAlertsDefault;
}
```

Use it from active alerts, delay cards, planned closures, active planned
closures, and Reduced Speed Zone DTOs. For grouped Reduced Speed Zones, derive
the label from the first source alert as the existing projection does for other
source fields.

- [ ] **Step 4: Generalize GTFS-RT client naming**

Without changing configuration keys, rename the local
`surfaceServiceAlerts`/`fetchSurfaceGtfsRtRecords` identifiers to
`gtfsRtServiceAlerts`/`fetchGtfsRtServiceAlertRecords`, and change the warning
to:

```text
Unable to fetch TTC GTFS-RT service-alert supplement
```

This is a terminology correction only; retain the existing resilient fetch
behavior and `surface-gtfs-rt-*` property compatibility.

- [ ] **Step 5: Run dashboard and client tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDashboardServiceTest,TtcAlertClientTest test
```

Expected: PASS.

- [ ] **Step 6: Commit API attribution**

```bash
git add \
  backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java \
  backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertClient.java \
  backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java
git commit -m "fix: label GTFS-RT dashboard alerts accurately"
```

## Task 6: Full Verification

**Files:**
- Review all files changed in Tasks 1-5.

- [ ] **Step 1: Run formatting and whitespace checks**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 2: Run the complete backend test suite**

```bash
mvn -f backend/pom.xml test
```

Expected: BUILD SUCCESS with all backend tests passing.

- [ ] **Step 3: Inspect the final diff and worktree**

```bash
git status --short
git diff --stat HEAD~5..HEAD
git log --oneline -6
```

Expected:

- only the GTFS-RT backend files and this plan/spec are included in the feature
  history;
- the original unrelated frontend changes are absent from the isolated
  worktree;
- no generated build output is tracked.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` against the feature branch. Address
verified correctness findings, rerun the affected focused tests, then rerun the
complete backend suite.

- [ ] **Step 5: Finish the development branch**

Use `superpowers:finishing-a-development-branch` to present merge, PR, or
worktree cleanup options after all verification passes.

