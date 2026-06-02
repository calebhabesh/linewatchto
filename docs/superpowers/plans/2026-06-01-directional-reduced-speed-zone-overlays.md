# Directional Reduced Speed Zone Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate TTC Live Alerts reduced-speed records into grouped rider-facing Reduced Speed Zones and precise forward, reverse, or bidirectional SVG map overlays.

**Architecture:** Keep independently ingested TTC alert records in the existing `alerts` table. Add conservative text-derived direction normalization, replace coarse map corridors with adjacent physical topology links, aggregate reduced-speed impacts per link in a dedicated backend projector, and let React resolve display geometry from authored SVG station anchors and `segment-guides-layer` curve paths with database-coordinate fallbacks.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway, PostgreSQL/PostGIS, JUnit 5, AssertJ, Mockito, Next.js App Router, React, TypeScript, SVG, Node built-in test runner, Playwright.

---

## Execution Prerequisite

The checkout already contains uncommitted live-dashboard read-switch and alert-taxonomy work from the previous slice. Preserve that work. Before editing implementation files:

```bash
git status --short
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

If those checks pass, create a dedicated checkpoint commit for the existing slice before starting Task 1. Stage only the files that belong to the existing live-read work. Leave local scratch files such as `TODO.md`, `frontend/test-portal.mjs`, `frontend/test-split.mjs`, and `ttc-feed-viewer.py` untracked unless the user explicitly asks to include them.

Do not modify already-applied migrations `V1` through `V6`. Add `V7`.

## File Structure

### Backend

- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertDirection.java`: normalized cardinal-direction enum persisted by ingestion.
- Create `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParser.java`: conservative structured-field and text parser.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`: normalize explicit directional wording.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`: carry `AlertDirection`.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`: persist normalized wire value.
- Create `backend/src/main/resources/db/migration/V7__adjacent_rapid_transit_topology.sql`: replace coarse seeded corridors with adjacent topology links and SVG anchor metadata.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/station/LineSegmentEntity.java`: expose topology orientation and SVG anchor metadata.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java`: walk connected topology links rather than assuming one flat ordered corridor list.
- Create `backend/src/main/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjector.java`: convert cardinal directions to link-relative movement, group overlapping source alerts, and aggregate impacts.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`: expose grouped zones and combine suspension and zone impacts.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`: keep `/api/alerts?type=slowdown` compatibility while returning grouped zone DTOs.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`: expose adjacent topology and aggregated impact metadata.

### Backend Tests

- Create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParserTest.java`.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`.
- Create `backend/src/test/java/com/calebhabesh/linewatch/station/LineSegmentTopologyMigrationTest.java`.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcherTest.java`.
- Create `backend/src/test/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjectorTest.java`.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertControllerTest.java`.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`.
- Modify constructor call sites in ingestion tests after `NormalizedRouteAlert.direction` becomes typed.

### Frontend

- Create `frontend/src/app/map-geometry.ts`: pure path resolution plus browser SVG anchor and guide extraction.
- Modify `frontend/src/app/linewatch-data.ts`: add topology, direction, grouped-zone, and map-impact types.
- Modify `frontend/src/app/DataContext.tsx`: expose `reducedSpeedZones`.
- Modify `frontend/src/app/page.tsx`: fetch grouped zones and trust `/api/map` impact metadata.
- Modify `frontend/src/components/InteractiveTtcMap.tsx`: resolve authored SVG geometry and render directional chevrons.
- Move `frontend/src/components/SlowdownsPanel.tsx` to `frontend/src/components/ReducedSpeedZonesPanel.tsx`: use TTC terminology and render grouped directional details.
- Modify `frontend/src/components/LineWatchShell.tsx`: rename view state and pass reduced-motion state into the map.
- Modify `frontend/src/components/LineLegend.tsx`: use Reduced Speed Zone naming.
- Modify `frontend/tests/linewatch-data.test.mjs`.
- Create `frontend/tests/map-geometry.test.mjs`.
- Modify `frontend/tests/map-layering.test.mjs`.
- Modify `frontend/tests/drawer-layout.test.mjs`.
- Modify `frontend/tests/smoke/api-stub-data.mjs`.
- Modify `frontend/tests/smoke/dashboard.spec.ts`.

### Documentation

- Modify `README.md`.
- Modify `AGENTS.md`.
- Modify `GEMINI.md` with the same guidance changes as `AGENTS.md`.

## Task 1: Normalize Explicit TTC Direction Wording

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertDirection.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParser.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/AlertDirectionParserTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TestAlertRecords.java`

- [ ] **Step 1: Write parser tests before adding the parser**

Create `AlertDirectionParserTest.java`:

```java
package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AlertDirectionParserTest {
    private final AlertDirectionParser parser = new AlertDirectionParser();

    @Test
    void prefersStructuredDirectionWhenPresent() {
        assertThat(parser.parse(
            "Northbound",
            "Southbound trains are moving slower than usual.",
            "",
            ""
        )).isEqualTo(AlertDirection.NORTHBOUND);
    }

    @Test
    void derivesSouthboundFromAlertTitle() {
        assertThat(parser.parse(
            null,
            "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
            "",
            ""
        )).isEqualTo(AlertDirection.SOUTHBOUND);
    }

    @Test
    void usesHeaderAndDescriptionWhenEarlierFieldsAreBlank() {
        assertThat(parser.parse(null, "", "Line 2: Westbound reduced speed zone.", ""))
            .isEqualTo(AlertDirection.WESTBOUND);
        assertThat(parser.parse(null, "", "", "Eastbound trains are moving slowly."))
            .isEqualTo(AlertDirection.EASTBOUND);
    }

    @Test
    void treatsExplicitBothDirectionsAndOpposingWordsAsBidirectional() {
        assertThat(parser.parse(null, "Reduced speed zone in both directions.", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
        assertThat(parser.parse(null, "Northbound and southbound trains are moving slowly.", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
    }

    @Test
    void returnsUnknownInsteadOfGuessingFromStationOrder() {
        assertThat(parser.parse(null, "Reduced speed zone from Wilson to Yorkdale.", "", ""))
            .isEqualTo(AlertDirection.UNKNOWN);
    }
}
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDirectionParserTest test
```

Expected: compilation failure because `AlertDirectionParser` and `AlertDirection` do not exist.

- [ ] **Step 3: Add the normalized enum and conservative parser**

Create `AlertDirection.java`:

```java
package com.calebhabesh.linewatch.ingestion;

import java.util.Locale;

public enum AlertDirection {
    NORTHBOUND("northbound"),
    SOUTHBOUND("southbound"),
    EASTBOUND("eastbound"),
    WESTBOUND("westbound"),
    BIDIRECTIONAL("bidirectional"),
    UNKNOWN("unknown");

    private final String wireValue;

    AlertDirection(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }

    public static AlertDirection fromWireValue(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        for (AlertDirection direction : values()) {
            if (direction.wireValue.equals(normalized)) {
                return direction;
            }
        }
        return UNKNOWN;
    }
}
```

Create `AlertDirectionParser.java`:

```java
package com.calebhabesh.linewatch.ingestion;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class AlertDirectionParser {

    public AlertDirection parse(
        String structuredDirection,
        String title,
        String headerText,
        String description
    ) {
        for (String value : new String[] { structuredDirection, title, headerText, description }) {
            AlertDirection parsed = parseField(value);
            if (parsed != AlertDirection.UNKNOWN) {
                return parsed;
            }
        }
        return AlertDirection.UNKNOWN;
    }

    private AlertDirection parseField(String value) {
        if (value == null || value.isBlank()) {
            return AlertDirection.UNKNOWN;
        }

        String text = value.toLowerCase(Locale.ROOT);
        if (text.contains("both directions") || text.contains("in both directions")) {
            return AlertDirection.BIDIRECTIONAL;
        }

        Set<AlertDirection> matches = new LinkedHashSet<>();
        addIfPresent(matches, text, "northbound", AlertDirection.NORTHBOUND);
        addIfPresent(matches, text, "southbound", AlertDirection.SOUTHBOUND);
        addIfPresent(matches, text, "eastbound", AlertDirection.EASTBOUND);
        addIfPresent(matches, text, "westbound", AlertDirection.WESTBOUND);

        if (matches.size() > 1) {
            return AlertDirection.BIDIRECTIONAL;
        }
        return matches.isEmpty() ? AlertDirection.UNKNOWN : matches.iterator().next();
    }

    private void addIfPresent(
        Set<AlertDirection> matches,
        String text,
        String word,
        AlertDirection direction
    ) {
        if (text.contains(word)) {
            matches.add(direction);
        }
    }
}
```

- [ ] **Step 4: Run the parser tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDirectionParserTest test
```

Expected: `Tests run: 5, Failures: 0, Errors: 0`.

- [ ] **Step 5: Add a failing normalization assertion for the captured Eglinton-to-Davisville record**

Extend `TtcAlertNormalizerTest.normalizesReducedSpeedZoneAsDelayAndDropsSentinelEnd()`:

```java
assertThat(alert.direction()).isEqualTo(AlertDirection.SOUTHBOUND);
```

Update test setup to construct:

```java
normalizer = new TtcAlertNormalizer(resolver, new AlertDirectionParser());
```

- [ ] **Step 6: Run the focused normalizer test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcAlertNormalizerTest#normalizesReducedSpeedZoneAsDelayAndDropsSentinelEnd test
```

Expected: compilation or assertion failure because `NormalizedRouteAlert.direction` is still an unnormalized `String`.

- [ ] **Step 7: Wire typed normalized direction through ingestion**

Change `NormalizedRouteAlert`:

```java
AlertDirection direction,
```

Inject `AlertDirectionParser` into `TtcAlertNormalizer`:

```java
private final AlertDirectionParser directionParser;

public TtcAlertNormalizer(
    StationAliasResolver stationAliasResolver,
    AlertDirectionParser directionParser
) {
    this.stationAliasResolver = stationAliasResolver;
    this.directionParser = directionParser;
}
```

Before creating `NormalizedRouteAlert`, derive:

```java
AlertDirection direction = directionParser.parse(
    record.direction(),
    record.title(),
    record.headerText(),
    record.description()
);
```

Pass `direction` into the record. Add `AlertDirection direction` to the private `fingerprint(...)` method signature, pass it from `normalizeRoute(...)`, and fingerprint its normalized wire value:

```java
direction.wireValue(),
```

Persist it in `TtcAlertStore.routeAlertParams()`:

```java
.addValue("direction", alert.direction().wireValue())
```

Update direct `NormalizedRouteAlert` constructor calls in ingestion tests to use `AlertDirection.UNKNOWN` or the asserted direction.

- [ ] **Step 8: Run ingestion tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDirectionParserTest,TtcAlertNormalizerTest,TtcAlertStoreTest test
```

Expected: PASS.

- [ ] **Step 9: Commit direction normalization**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/ingestion \
  backend/src/test/java/com/calebhabesh/linewatch/ingestion
git commit -m "feat: normalize reduced speed zone directions"
```

## Task 2: Seed Adjacent Rapid-Transit Topology Additively

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__adjacent_rapid_transit_topology.sql`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/station/LineSegmentTopologyMigrationTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/LineSegmentEntity.java`

- [ ] **Step 1: Write a migration-shape test before adding V7**

Create `LineSegmentTopologyMigrationTest.java`:

```java
package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LineSegmentTopologyMigrationTest {

    @Test
    void v7ReplacesCoarseCorridorsWithAdjacentTopologyAndSvgMetadata() throws IOException {
        String sql = migrationSql("/db/migration/V7__adjacent_rapid_transit_topology.sql");

        assertThat(sql).contains("add column forward_direction");
        assertThat(sql).contains("add column guide_path_id");
        assertThat(sql).contains("add column station_a_anchor_id");
        assertThat(sql).contains("add column station_b_anchor_id");
        assertThat(sql).contains("add column guide_path_reversed");
        assertThat(sql).contains("drop constraint if exists line_segments_station_a_id_station_b_id_key");
        assertThat(sql).contains("unique (line_id, station_a_id, station_b_id)");
        assertThat(sql).contains("'eglinton', 'davisville'");
        assertThat(sql).contains("'wilson', 'yorkdale'");
        assertThat(sql).contains("'line-1-dupont-spadina'");
        assertThat(sql).contains("'seg-line-1-dupont-spadina'");
        assertThat(sql).contains("'station-spadina-1'");
        assertThat(sql).contains("'station-spadina-2'");
        assertThat(sql).contains("'line-2'");
        assertThat(sql).contains("'line-4'");
        assertThat(sql).contains("'line-5'");
        assertThat(sql).contains("'line-6'");
        assertThat(sql).contains("delete from alert_segments");
        assertThat(sql).contains("delete from line_segments");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=LineSegmentTopologyMigrationTest test
```

Expected: failure because `V7__adjacent_rapid_transit_topology.sql` does not exist.

- [ ] **Step 3: Add V7 with adjacent topology links and authored SVG metadata**

Create `V7__adjacent_rapid_transit_topology.sql`:

```sql
alter table line_segments
    alter column svg_path drop not null,
    add column forward_direction varchar(16),
    add column guide_path_id varchar(160),
    add column guide_path_reversed boolean not null default false,
    add column station_a_anchor_id varchar(160),
    add column station_b_anchor_id varchar(160);

alter table line_segments
    drop constraint if exists line_segments_station_a_id_station_b_id_key,
    add constraint uq_line_segments_line_stations
        unique (line_id, station_a_id, station_b_id);

delete from alert_segments;
delete from line_segments;

with topology_paths(line_id, first_sort_order, forward_direction, station_ids) as (
    values
    (
        'line-1', 100, 'southbound', array[
            'vaughan-metropolitan-centre', 'highway-407', 'pioneer-village',
            'york-university', 'finch-west', 'downsview-park', 'sheppard-west',
            'wilson', 'yorkdale', 'lawrence-west', 'glencairn', 'cedarvale',
            'st-clair-west', 'dupont', 'spadina', 'st-george', 'museum',
            'queens-park', 'st-patrick', 'osgoode', 'st-andrew', 'union'
        ]::varchar[]
    ),
    (
        'line-1', 200, 'southbound', array[
            'finch', 'north-york-centre', 'sheppard-yonge', 'york-mills',
            'lawrence', 'eglinton', 'davisville', 'st-clair', 'summerhill',
            'rosedale', 'bloor-yonge', 'wellesley', 'college', 'tmu', 'queen',
            'king', 'union'
        ]::varchar[]
    ),
    (
        'line-2', 300, 'eastbound', array[
            'kipling', 'islington', 'royal-york', 'old-mill', 'jane',
            'runnymede', 'high-park', 'keele', 'dundas-west', 'lansdowne',
            'dufferin', 'ossington', 'christie', 'bathurst', 'spadina',
            'st-george', 'bay', 'bloor-yonge', 'sherbourne', 'castle-frank',
            'broadview', 'chester', 'pape', 'donlands', 'greenwoood', 'coxwell',
            'woodbine', 'main-street', 'victoria-park', 'warden', 'kennedy'
        ]::varchar[]
    ),
    (
        'line-4', 400, 'eastbound', array[
            'sheppard-yonge', 'bayview', 'bessarion', 'leslie', 'don-mills'
        ]::varchar[]
    ),
    (
        'line-5', 500, 'eastbound', array[
            'mount-dennis', 'keelesdale', 'caledonia', 'fairbank', 'oakwood',
            'cedarvale', 'forest-hill', 'chaplin', 'avenue', 'eglinton',
            'mount-pleasant', 'leaside', 'laird', 'sunnybrook-park',
            'don-valley', 'aga-khan-park-and-museum', 'wynford', 'sloane',
            'o_connor', 'pharmacy', 'hakimi-lebovic', 'golden-mile',
            'birchmount', 'ionview', 'kennedy'
        ]::varchar[]
    ),
    (
        'line-6', 600, 'eastbound', array[
            'humber-college', 'westmore', 'martin-grove', 'albion', 'stevenson',
            'mount-olive', 'rowntree-mills', 'pearldale', 'duncanwoods',
            'milvan-rumike', 'emery', 'signet-arrow', 'norfinch-oakdale',
            'jane-and-finch', 'driftwood', 'tobermory', 'sentinel', 'finch-west'
        ]::varchar[]
    )
)
insert into line_segments (
    id, line_id, station_a_id, station_b_id, geom, svg_path, sort_order,
    forward_direction
)
select
    format('%s-%s-%s', line_id, station_ids[index], station_ids[index + 1]),
    line_id,
    station_ids[index],
    station_ids[index + 1],
    null,
    null,
    first_sort_order + index,
    forward_direction
from topology_paths
cross join lateral generate_subscripts(station_ids, 1) as station_index(index)
where index < array_length(station_ids, 1);

update line_segments
set guide_path_id = 'seg-line-1-dupont-spadina',
    guide_path_reversed = true,
    station_b_anchor_id = 'station-spadina-1'
where id = 'line-1-dupont-spadina';

update line_segments
set guide_path_id = 'seg-line-1-spadina-st-george',
    guide_path_reversed = true,
    station_a_anchor_id = 'station-spadina-1'
where id = 'line-1-spadina-st-george';

update line_segments
set guide_path_id = 'seg-line-1-st-andrew-union'
where id = 'line-1-st-andrew-union';

update line_segments
set guide_path_id = 'seg-line-1-union-king'
where id = 'line-1-king-union';

update line_segments
set station_b_anchor_id = 'station-spadina-2'
where id = 'line-2-bathurst-spadina';

update line_segments
set station_a_anchor_id = 'station-spadina-2'
where id = 'line-2-spadina-st-george';

alter table line_segments
    alter column forward_direction set not null,
    add constraint chk_line_segments_forward_direction
        check (forward_direction in ('northbound', 'southbound', 'eastbound', 'westbound'));

create index idx_line_segments_line_id_sort_order
    on line_segments(line_id, sort_order);
```

- [ ] **Step 4: Run the migration-shape test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=LineSegmentTopologyMigrationTest test
```

Expected: PASS.

- [ ] **Step 5: Extend `LineSegmentEntity` without breaking existing constructor-based tests**

Add fields and getters:

```java
@Column(name = "forward_direction")
private String forwardDirection;

@Column(name = "guide_path_id")
private String guidePathId;

@Column(name = "guide_path_reversed")
private boolean guidePathReversed;

@Column(name = "station_a_anchor_id")
private String stationAAnchorId;

@Column(name = "station_b_anchor_id")
private String stationBAnchorId;

public String getForwardDirection() { return forwardDirection; }
public String getGuidePathId() { return guidePathId; }
public boolean isGuidePathReversed() { return guidePathReversed; }
public String getStationAAnchorId() {
    return stationAAnchorId == null ? "station-" + stationAId : stationAAnchorId;
}
public String getStationBAnchorId() {
    return stationBAnchorId == null ? "station-" + stationBId : stationBAnchorId;
}
```

Keep the existing constructor for current tests and add a full constructor:

```java
public LineSegmentEntity(
    String id,
    String lineId,
    String stationAId,
    String stationBId,
    LineString geom,
    String svgPath,
    int sortOrder
) {
    this(id, lineId, stationAId, stationBId, geom, svgPath, sortOrder, null, null, false, null, null);
}

public LineSegmentEntity(
    String id,
    String lineId,
    String stationAId,
    String stationBId,
    LineString geom,
    String svgPath,
    int sortOrder,
    String forwardDirection,
    String guidePathId,
    boolean guidePathReversed,
    String stationAAnchorId,
    String stationBAnchorId
) {
    this.id = id;
    this.lineId = lineId;
    this.stationAId = stationAId;
    this.stationBId = stationBId;
    this.geom = geom;
    this.svgPath = svgPath;
    this.sortOrder = sortOrder;
    this.forwardDirection = forwardDirection;
    this.guidePathId = guidePathId;
    this.guidePathReversed = guidePathReversed;
    this.stationAAnchorId = stationAAnchorId;
    this.stationBAnchorId = stationBAnchorId;
}
```

- [ ] **Step 6: Run station and migration tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=LineSegmentTopologyMigrationTest,StationImpactExpiryMigrationTest test
```

Expected: PASS.

- [ ] **Step 7: Apply V7 against local PostgreSQL**

Run:

```bash
docker compose up -d postgres redis
mvn -f backend/pom.xml spring-boot:run
```

Wait for Spring Boot to report a successful startup, then verify from a second terminal:

```bash
curl http://localhost:8080/api/health
```

Expected: Flyway applies `V7__adjacent_rapid_transit_topology.sql`, Hibernate validation succeeds, and `/api/health` returns a healthy response. Stop the backend process after the check.

- [ ] **Step 8: Commit adjacent topology**

```bash
git add backend/src/main/resources/db/migration/V7__adjacent_rapid_transit_topology.sql \
  backend/src/main/java/com/calebhabesh/linewatch/station/LineSegmentEntity.java \
  backend/src/test/java/com/calebhabesh/linewatch/station/LineSegmentTopologyMigrationTest.java
git commit -m "feat: seed adjacent rapid transit topology"
```

## Task 3: Walk Connected Topology Links

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcherTest.java`

- [ ] **Step 1: Add failing graph-walk tests**

Add tests:

```java
@Test
void matchesEglintonToDavisvilleAdjacentLink() {
    List<LineSegmentEntity> segments = List.of(
        segment("line-1-eglinton-davisville", "line-1", "eglinton", "davisville", 10),
        segment("line-1-st-clair-davisville", "line-1", "st-clair", "davisville", 20)
    );

    assertThat(matcher.matchSegmentIds(segments, "line-1", "eglinton", "davisville"))
        .containsExactly("line-1-eglinton-davisville");
}

@Test
void walksConnectedBranchAndCurveLinksWithoutDependingOnFlatSortOrder() {
    List<LineSegmentEntity> segments = List.of(
        segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 30),
        segment("line-1-king-union", "line-1", "king", "union", 10),
        segment("line-1-osgoode-st-andrew", "line-1", "osgoode", "st-andrew", 20)
    );

    assertThat(matcher.matchSegmentIds(segments, "line-1", "osgoode", "king"))
        .containsExactly(
            "line-1-osgoode-st-andrew",
            "line-1-st-andrew-union",
            "line-1-king-union"
        );
}
```

- [ ] **Step 2: Run the matcher tests to verify the branch test fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertSegmentMatcherTest test
```

Expected: the branch walk fails because the current implementation returns empty after relying on flat sort order.

- [ ] **Step 3: Replace ordered-corridor traversal with deterministic breadth-first traversal**

Expose entity and ID methods:

```java
public List<String> matchSegmentIds(
    List<LineSegmentEntity> segments,
    String lineId,
    String startStationId,
    String endStationId
) {
    return matchSegments(segments, lineId, startStationId, endStationId).stream()
        .map(LineSegmentEntity::getId)
        .toList();
}

public List<LineSegmentEntity> matchSegments(
    List<LineSegmentEntity> segments,
    String lineId,
    String startStationId,
    String endStationId
) {
    if (
        segments == null
            || isBlank(lineId)
            || isBlank(startStationId)
            || isBlank(endStationId)
            || startStationId.equals(endStationId)
    ) {
        return List.of();
    }

    List<LineSegmentEntity> lineSegments = segments.stream()
        .filter(segment -> lineId.equals(segment.getLineId()))
        .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder))
        .toList();
    java.util.ArrayDeque<PathState> queue = new java.util.ArrayDeque<>();
    java.util.Set<String> visitedStations = new java.util.HashSet<>();
    queue.add(new PathState(startStationId, List.of()));
    visitedStations.add(startStationId);

    while (!queue.isEmpty()) {
        PathState current = queue.removeFirst();
        for (LineSegmentEntity segment : lineSegments) {
            String nextStation = nextStation(segment, current.stationId());
            if (nextStation == null || !visitedStations.add(nextStation)) {
                continue;
            }
            List<LineSegmentEntity> path = new java.util.ArrayList<>(current.path());
            path.add(segment);
            if (nextStation.equals(endStationId)) {
                return List.copyOf(path);
            }
            queue.addLast(new PathState(nextStation, List.copyOf(path)));
        }
    }

    return List.of();
}

private String nextStation(LineSegmentEntity segment, String stationId) {
    if (segment.getStationAId().equals(stationId)) {
        return segment.getStationBId();
    }
    if (segment.getStationBId().equals(stationId)) {
        return segment.getStationAId();
    }
    return null;
}

private record PathState(String stationId, List<LineSegmentEntity> path) {}
```

- [ ] **Step 4: Run matcher tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertSegmentMatcherTest test
```

Expected: PASS.

- [ ] **Step 5: Commit graph matching**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java \
  backend/src/test/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcherTest.java
git commit -m "feat: walk connected alert topology links"
```

## Task 4: Project And Group Reduced Speed Zones

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjector.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjectorTest.java`

- [ ] **Step 1: Write projector tests for directional aggregation**

Create tests covering:

```java
@Test
void projectsSouthboundEglintonToDavisvilleAsForward() {
    Projection projection = projector.project(
        List.of(alert("ttc-route-synthetic-rsz-line-1", "line-1", "eglinton", "davisville", "southbound")),
        List.of(segment(
            "line-1-eglinton-davisville", "line-1", "eglinton", "davisville",
            "southbound"
        ))
    );

    assertThat(projection.segmentImpacts().get("line-1-eglinton-davisville"))
        .extracting(SegmentImpact::travelDirection)
        .isEqualTo(TravelDirection.FORWARD);
}

@Test
void mergesOppositeDirectionsOnTheSameLink() {
    Projection projection = projector.project(
        List.of(
            alert("ttc-route-north", "line-1", "yorkdale", "wilson", "northbound"),
            alert("ttc-route-south", "line-1", "wilson", "yorkdale", "southbound")
        ),
        List.of(segment(
            "line-1-wilson-yorkdale", "line-1", "wilson", "yorkdale", "southbound"
        ))
    );

    assertThat(projection.zones()).hasSize(1);
    assertThat(projection.segmentImpacts().get("line-1-wilson-yorkdale"))
        .satisfies(impact -> {
            assertThat(impact.travelDirection()).isEqualTo(TravelDirection.BIDIRECTIONAL);
            assertThat(impact.sourceAlertIds())
                .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
        });
}

@Test
void defaultsUnknownDirectionToBidirectionalWithoutInventingCardinalCopy() {
    Projection projection = projector.project(
        List.of(alert("ttc-route-unknown", "line-2", "jane", "runnymede", "unknown")),
        List.of(segment(
            "line-2-jane-runnymede", "line-2", "jane", "runnymede", "eastbound"
        ))
    );

    assertThat(projection.segmentImpacts().get("line-2-jane-runnymede").travelDirection())
        .isEqualTo(TravelDirection.BIDIRECTIONAL);
    assertThat(projection.zones().getFirst().displayDirection())
        .isEqualTo("Direction not specified");
}

@Test
void groupsPartialOverlapsButKeepsNonOverlappingLinksDirectional() {
    Projection projection = projector.project(
        List.of(
            alert("ttc-route-east", "line-2", "jane", "dufferin", "eastbound"),
            alert("ttc-route-west", "line-2", "ossington", "jane", "westbound")
        ),
        List.of(
            segment("line-2-jane-runnymede", "line-2", "jane", "runnymede", "eastbound"),
            segment("line-2-runnymede-dufferin", "line-2", "runnymede", "dufferin", "eastbound"),
            segment("line-2-dufferin-ossington", "line-2", "dufferin", "ossington", "eastbound")
        )
    );

    assertThat(projection.zones()).hasSize(1);
    assertThat(projection.segmentImpacts().get("line-2-jane-runnymede").travelDirection())
        .isEqualTo(TravelDirection.BIDIRECTIONAL);
    assertThat(projection.segmentImpacts().get("line-2-runnymede-dufferin").travelDirection())
        .isEqualTo(TravelDirection.BIDIRECTIONAL);
    assertThat(projection.segmentImpacts().get("line-2-dufferin-ossington").travelDirection())
        .isEqualTo(TravelDirection.REVERSE);
}

@Test
void keepsUnmatchedZoneCardWithoutClearingMatchedOverlays() {
    Projection projection = projector.project(
        List.of(
            alert("ttc-route-matched", "line-1", "eglinton", "davisville", "southbound"),
            alert("ttc-route-unmatched", "line-1", "imaginary", "nowhere", "southbound")
        ),
        List.of(segment(
            "line-1-eglinton-davisville", "line-1", "eglinton", "davisville",
            "southbound"
        ))
    );

    assertThat(projection.zones()).hasSize(2);
    assertThat(projection.zones())
        .filteredOn(zone -> zone.sourceAlertIds().contains("ttc-route-unmatched"))
        .singleElement()
        .satisfies(zone -> assertThat(zone.affectedSegmentIds()).isEmpty());
    assertThat(projection.segmentImpacts()).containsKey("line-1-eglinton-davisville");
}
```

Use test helpers that set `AlertEntity.line`, `direction`, and bounds through `ReflectionTestUtils`, and create `LineSegmentEntity` with the full constructor from Task 2.

- [ ] **Step 2: Run the projector test to verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ReducedSpeedZoneProjectorTest test
```

Expected: compilation failure because `ReducedSpeedZoneProjector`, `Projection`, `SegmentImpact`, and `TravelDirection` do not exist.

- [ ] **Step 3: Implement link-relative movement and overlap grouping**

Create `ReducedSpeedZoneProjector.java` with these public records and enum:

```java
public enum TravelDirection {
    FORWARD("forward"),
    REVERSE("reverse"),
    BIDIRECTIONAL("bidirectional");

    private final String wireValue;

    TravelDirection(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }

    public TravelDirection merge(TravelDirection other) {
        return this == other ? this : BIDIRECTIONAL;
    }
}

public record DirectionalDetail(
    String sourceAlertId,
    String displayDirection,
    String location,
    String description
) {}

public record ReducedSpeedZone(
    String id,
    String lineId,
    List<String> affectedSegmentIds,
    List<String> sourceAlertIds,
    String displayDirection,
    List<DirectionalDetail> directionalDetails,
    List<AlertEntity> sourceAlerts
) {}

public record SegmentImpact(
    String segmentId,
    TravelDirection travelDirection,
    List<String> sourceAlertIds,
    List<String> reducedSpeedZoneIds
) {}

public record Projection(
    List<ReducedSpeedZone> zones,
    Map<String, SegmentImpact> segmentImpacts
) {}
```

Use these implementation rules:

```java
private TravelDirection travelDirection(AlertEntity alert, LineSegmentEntity segment) {
    AlertDirection direction = AlertDirection.fromWireValue(alert.getDirection());
    if (direction == AlertDirection.UNKNOWN || direction == AlertDirection.BIDIRECTIONAL) {
        return TravelDirection.BIDIRECTIONAL;
    }
    if (direction.wireValue().equals(segment.getForwardDirection())) {
        return TravelDirection.FORWARD;
    }
    if (opposite(direction).wireValue().equals(segment.getForwardDirection())) {
        return TravelDirection.REVERSE;
    }
    return TravelDirection.BIDIRECTIONAL;
}

private AlertDirection opposite(AlertDirection direction) {
    return switch (direction) {
        case NORTHBOUND -> AlertDirection.SOUTHBOUND;
        case SOUTHBOUND -> AlertDirection.NORTHBOUND;
        case EASTBOUND -> AlertDirection.WESTBOUND;
        case WESTBOUND -> AlertDirection.EASTBOUND;
        case BIDIRECTIONAL, UNKNOWN -> AlertDirection.UNKNOWN;
    };
}
```

Project each alert through `AlertSegmentMatcher.matchSegments()`. Retain alerts with no matched links as single-source rider-facing zones with empty `affectedSegmentIds`; they remain visible but do not paint the map. Group projected source records when they have the same `lineId` and overlapping matched segment IDs. Merge all intersecting groups when a new record bridges them so grouping remains transitive. Build each stable group ID from the lexicographically first source alert ID:

```java
"reduced-speed-zone-" + sortedSourceAlertIds.getFirst()
```

Use this transitive grouping shape:

```java
private List<GroupBuilder> groupSources(List<ProjectedSource> sources) {
    List<GroupBuilder> groups = new java.util.ArrayList<>();
    for (ProjectedSource source : sources) {
        List<GroupBuilder> overlaps = groups.stream()
            .filter(group -> group.overlaps(source))
            .toList();
        if (overlaps.isEmpty()) {
            groups.add(new GroupBuilder(source));
            continue;
        }

        GroupBuilder target = overlaps.getFirst();
        target.add(source);
        for (GroupBuilder overlap : overlaps.subList(1, overlaps.size())) {
            target.addAll(overlap);
            groups.remove(overlap);
        }
    }
    return groups;
}

private static final class GroupBuilder {
    private final String lineId;
    private final List<ProjectedSource> sources = new java.util.ArrayList<>();
    private final java.util.Set<String> segmentIds = new java.util.LinkedHashSet<>();

    private GroupBuilder(ProjectedSource source) {
        this.lineId = source.alert().getLine().getId();
        add(source);
    }

    private boolean overlaps(ProjectedSource source) {
        return lineId.equals(source.alert().getLine().getId())
            && source.segmentIds().stream().anyMatch(segmentIds::contains);
    }

    private void add(ProjectedSource source) {
        sources.add(source);
        segmentIds.addAll(source.segmentIds());
    }

    private void addAll(GroupBuilder group) {
        group.sources.forEach(this::add);
    }
}
```

For each segment, merge directional impacts and accumulate sorted unique `sourceAlertIds` and `reducedSpeedZoneIds`.

Use rider-facing display direction:

```java
private String displayDirection(List<ProjectedSource> sources) {
    java.util.Set<AlertDirection> directions = sources.stream()
        .map(source -> AlertDirection.fromWireValue(source.alert().getDirection()))
        .collect(java.util.stream.Collectors.toSet());
    if (directions.contains(AlertDirection.UNKNOWN)) {
        return "Direction not specified";
    }
    if (directions.size() != 1 || directions.contains(AlertDirection.BIDIRECTIONAL)) {
        return "Both directions";
    }
    String value = directions.iterator().next().wireValue();
    return value.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + value.substring(1);
}
```

Use station-ID labels for directional detail locations:

```java
stationLabel(alert.getStartStationId()) + " to " + stationLabel(alert.getEndStationId())
```

- [ ] **Step 4: Run projector tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=ReducedSpeedZoneProjectorTest test
```

Expected: PASS.

- [ ] **Step 5: Commit the projector**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjector.java \
  backend/src/test/java/com/calebhabesh/linewatch/alert/ReducedSpeedZoneProjectorTest.java
git commit -m "feat: group directional reduced speed zones"
```

## Task 5: Expose Grouped Zones And Aggregated Map Impacts

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertControllerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`

- [ ] **Step 1: Replace raw slowdown DTO expectations with grouped-zone expectations**

In `AlertDashboardServiceTest`, add:

```java
@Test
void reducedSpeedZonesGroupOpposingSourceAlertsAndExposeDirectionalDetails() {
    AlertEntity northbound = alert(
        "ttc-route-north", "active-alert", "delay", "Reduced speed",
        "Northbound trains are moving slowly.", "yorkdale", "wilson",
        OffsetDateTime.parse("2026-06-01T11:55:00Z"), null
    );
    ReflectionTestUtils.setField(northbound, "direction", "northbound");
    AlertEntity southbound = alert(
        "ttc-route-south", "active-alert", "delay", "Reduced speed",
        "Southbound trains are moving slowly.", "wilson", "yorkdale",
        OffsetDateTime.parse("2026-06-01T11:54:00Z"), null
    );
    ReflectionTestUtils.setField(southbound, "direction", "southbound");
    when(alertRepository.findByActiveTrueAndType("active-alert"))
        .thenReturn(List.of(northbound, southbound));
    when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
        segment("line-1-wilson-yorkdale", "line-1", "wilson", "yorkdale", 10, "southbound")
    ));

    assertThat(service.reducedSpeedZones()).singleElement().satisfies(zone -> {
        assertThat(zone.displayDirection()).isEqualTo("Both directions");
        assertThat(zone.affectedSegmentIds()).containsExactly("line-1-wilson-yorkdale");
        assertThat(zone.sourceAlertIds())
            .containsExactlyInAnyOrder("ttc-route-north", "ttc-route-south");
        assertThat(zone.directionalDetails()).hasSize(2);
    });
}
```

Update the map-impact test to assert:

```java
assertThat(impact.overlay()).isEqualTo("delay");
assertThat(impact.travelDirection()).isEqualTo("forward");
assertThat(impact.sourceAlertIds()).containsExactly("ttc-route-300");
assertThat(impact.reducedSpeedZoneIds()).containsExactly("reduced-speed-zone-ttc-route-300");
assertThat(impact.alertId()).isNull();
```

- [ ] **Step 2: Run dashboard tests to verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDashboardServiceTest test
```

Expected: compilation failure because `reducedSpeedZones()` and the expanded map-impact contract do not exist.

- [ ] **Step 3: Inject the projector and add grouped zone DTOs**

Add `ReducedSpeedZoneProjector` to `AlertDashboardService` constructor dependencies.

Replace `slowdowns()` with:

```java
public List<ReducedSpeedZoneDto> reducedSpeedZones() {
    List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
    return reducedSpeedProjection(segments).zones().stream()
        .map(this::toReducedSpeedZoneDto)
        .toList();
}

private ReducedSpeedZoneProjector.Projection reducedSpeedProjection(
    List<LineSegmentEntity> segments
) {
    List<AlertEntity> delays = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
        .filter(alert -> "delay".equalsIgnoreCase(alert.getSeverity()))
        .toList();
    return reducedSpeedZoneProjector.project(delays, segments);
}
```

Add DTOs:

```java
public record DirectionalDetailDto(
    String sourceAlertId,
    String displayDirection,
    String location,
    String description
) {}

public record ReducedSpeedZoneDto(
    String id,
    String lineId,
    String lineNumber,
    String title,
    String location,
    String displayDirection,
    String description,
    String updatedAgo,
    List<String> affectedSegmentIds,
    List<String> sourceAlertIds,
    List<DirectionalDetailDto> directionalDetails,
    String source
) {}

public record SegmentImpact(
    String segmentId,
    String overlay,
    String travelDirection,
    List<String> sourceAlertIds,
    List<String> reducedSpeedZoneIds,
    String alertId
) {}
```

Map grouped zones with:

```java
private ReducedSpeedZoneDto toReducedSpeedZoneDto(
    ReducedSpeedZoneProjector.ReducedSpeedZone zone
) {
    AlertEntity first = zone.sourceAlerts().getFirst();
    TransitLineEntity line = first.getLine();
    return new ReducedSpeedZoneDto(
        zone.id(),
        line == null ? null : line.getId(),
        line == null ? null : line.getNumber(),
        "Reduced Speed Zone",
        groupedLocation(zone),
        zone.displayDirection(),
        zone.sourceAlerts().size() == 1
            ? first.getDescription()
            : "TTC reports reduced speeds on this corridor.",
        zone.sourceAlerts().stream()
            .map(AlertEntity::getSourceUpdatedAt)
            .filter(java.util.Objects::nonNull)
            .max(java.util.Comparator.naturalOrder())
            .map(this::updatedAgo)
            .orElse("Updated recently"),
        zone.affectedSegmentIds(),
        zone.sourceAlertIds(),
        zone.directionalDetails().stream()
            .map(detail -> new DirectionalDetailDto(
                detail.sourceAlertId(),
                detail.displayDirection(),
                detail.location(),
                detail.description()
            ))
            .toList(),
        "TTC Live Alert"
    );
}
```

Use the single detail location for one-source zones, join reversed bounds with ` <-> ` for grouped opposite-direction zones, and use a neutral label for more complex overlaps.

```java
private String groupedLocation(ReducedSpeedZoneProjector.ReducedSpeedZone zone) {
    List<String> locations = zone.directionalDetails().stream()
        .map(ReducedSpeedZoneProjector.DirectionalDetail::location)
        .distinct()
        .toList();
    if (locations.size() == 1) {
        return locations.getFirst();
    }
    if (locations.size() == 2 && reverseLocation(locations.getFirst()).equals(locations.get(1))) {
        String[] bounds = locations.getFirst().split(" to ", 2);
        return bounds[0] + " <-> " + bounds[1];
    }
    return "Multiple affected sections";
}

private String reverseLocation(String location) {
    String[] bounds = location.split(" to ", 2);
    return bounds.length == 2 ? bounds[1] + " to " + bounds[0] : location;
}
```

- [ ] **Step 4: Combine suspension and reduced-speed link impacts**

Refactor `activeSegmentImpacts()`:

```java
public Map<String, SegmentImpact> activeSegmentImpacts() {
    List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
    Map<String, SegmentImpact> impacts = new LinkedHashMap<>();

    for (ActiveAlertDto alert : activeAlerts()) {
        for (String segmentId : alert.affectedSegmentIds()) {
            impacts.put(segmentId, new SegmentImpact(
                segmentId,
                "suspension",
                "bidirectional",
                List.of(alert.id()),
                List.of(),
                alert.id()
            ));
        }
    }

    ReducedSpeedZoneProjector.Projection projection = reducedSpeedProjection(segments);
    for (ReducedSpeedZoneProjector.SegmentImpact impact : projection.segmentImpacts().values()) {
        impacts.putIfAbsent(impact.segmentId(), new SegmentImpact(
            impact.segmentId(),
            "delay",
            impact.travelDirection().wireValue(),
            impact.sourceAlertIds(),
            impact.reducedSpeedZoneIds(),
            null
        ));
    }

    return impacts;
}
```

Suspensions remain higher priority because reduced-speed impacts use `putIfAbsent`.

- [ ] **Step 5: Keep endpoint compatibility and expand map DTOs**

In `AlertController`:

```java
if ("slowdown".equals(type)) {
    return dashboardService.reducedSpeedZones();
}
```

Expand `MapController.NetworkSegmentDto`:

```java
public record NetworkSegmentDto(
    String id,
    String lineId,
    String label,
    String stationAId,
    String stationBId,
    String stationAAnchorId,
    String stationBAnchorId,
    String guidePathId,
    boolean guidePathReversed,
    String pathD,
    String overlay,
    String travelDirection,
    List<String> sourceAlertIds,
    List<String> reducedSpeedZoneIds,
    String alertId
) {}
```

When no impact exists, emit `"clear"`, `"bidirectional"`, empty lists, and `null` alert ID. When an impact exists, pass its values through. Keep `pathD` non-null for the frontend contract by mapping a missing persisted SVG path to `""`; ordinary adjacent links will resolve from SVG anchors in Task 6. `LineSegmentEntity.getStationAAnchorId()` and `getStationBAnchorId()` already emit an authored override when present and otherwise synthesize the asset convention `station-{stationId}`, so pass those getter values through:

```java
java.util.Objects.requireNonNullElse(segment.getSvgPath(), "")
```

- [ ] **Step 6: Update controller tests**

Update `AlertControllerTest` so `type=slowdown` stubs and returns a `ReducedSpeedZoneDto`.

Update `MapControllerTest` so it asserts:

```java
assertThat(segment.stationAId()).isEqualTo("jane");
assertThat(segment.stationBId()).isEqualTo("ossington");
assertThat(segment.stationAAnchorId()).isEqualTo("station-jane");
assertThat(segment.stationBAnchorId()).isEqualTo("station-ossington");
assertThat(segment.overlay()).isEqualTo("delay");
assertThat(segment.travelDirection()).isEqualTo("forward");
assertThat(segment.sourceAlertIds()).containsExactly("ttc-route-300");
assertThat(segment.reducedSpeedZoneIds())
    .containsExactly("reduced-speed-zone-ttc-route-300");
```

Update constructor calls in `AlertDashboardServiceTest`, `AlertControllerTest`, and `MapControllerTest` to provide the new `ReducedSpeedZoneProjector` dependency.

- [ ] **Step 7: Run backend alert and map tests**

Run:

```bash
mvn -f backend/pom.xml \
  -Dtest=ReducedSpeedZoneProjectorTest,AlertDashboardServiceTest,AlertControllerTest,MapControllerTest \
  test
```

Expected: PASS.

- [ ] **Step 8: Commit dashboard projection**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/alert \
  backend/src/main/java/com/calebhabesh/linewatch/map \
  backend/src/test/java/com/calebhabesh/linewatch/alert \
  backend/src/test/java/com/calebhabesh/linewatch/map
git commit -m "feat: expose grouped reduced speed zone impacts"
```

## Task 6: Resolve Overlay Geometry From Authored SVG Anchors

**Files:**
- Create: `frontend/src/app/map-geometry.ts`
- Create: `frontend/tests/map-geometry.test.mjs`
- Modify: `frontend/src/app/linewatch-data.ts`

- [ ] **Step 1: Add frontend topology and grouped-zone types**

In `linewatch-data.ts`, add:

```ts
export type TravelDirection = "forward" | "reverse" | "bidirectional";

export type DirectionalDetail = {
  sourceAlertId: string;
  displayDirection: string;
  location: string;
  description: string;
};

export type ReducedSpeedZone = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  displayDirection: string;
  description: string;
  updatedAgo: string;
  affectedSegmentIds: string[];
  sourceAlertIds: string[];
  directionalDetails: DirectionalDetail[];
  source: string;
};
```

Expand `NetworkSegment` while retaining required `pathD` for fallback fixtures and smoke stubs:

```ts
export type NetworkSegment = {
  id: string;
  lineId: string;
  label: string;
  stationAId?: string;
  stationBId?: string;
  stationAAnchorId?: string;
  stationBAnchorId?: string;
  guidePathId?: string;
  guidePathReversed?: boolean;
  pathD: string;
  overlay: SegmentOverlay;
  travelDirection?: TravelDirection;
  sourceAlertIds?: string[];
  reducedSpeedZoneIds?: string[];
  alertId?: string;
};
```

Add the grouped-zone types, but keep the existing internal fixture payload unchanged until Task 8 so this commit remains type-safe:

```ts
export const slowdowns: ActiveAlert[] = [];
```

- [ ] **Step 2: Write pure geometry tests before adding the helper**

Create `frontend/tests/map-geometry.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveNetworkSegmentPath,
  visualTravelDirection,
} from "../src/app/map-geometry.ts";

const stations = [
  { id: "eglinton", name: "Eglinton", x: 4547, y: 1808 },
  { id: "davisville", name: "Davisville", x: 4547, y: 2005 },
];

describe("map overlay geometry", () => {
  it("generates ordinary paths from authored station anchor measurements", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-eglinton-davisville",
        lineId: "line-1",
        label: "Eglinton to Davisville",
        stationAId: "eglinton",
        stationBId: "davisville",
        stationAAnchorId: "station-eglinton",
        stationBAnchorId: "station-davisville",
        overlay: "delay",
      },
      stations,
      new Map([
        ["station-eglinton", { x: 4547, y: 1808 }],
        ["station-davisville", { x: 4547, y: 2005 }],
      ]),
      new Map(),
    );

    assert.equal(path, "M 4547 1808 L 4547 2005");
  });

  it("uses authored nonlinear guide paths before straight fallbacks", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-king-union",
        lineId: "line-1",
        label: "King to Union",
        stationAId: "king",
        stationBId: "union",
        guidePathId: "seg-line-1-union-king",
        overlay: "delay",
      },
      [],
      new Map(),
      new Map([["seg-line-1-union-king", "m 4547,3363 c 0,0 -7,227 -235,236"]]),
    );

    assert.equal(path, "m 4547,3363 c 0,0 -7,227 -235,236");
  });

  it("falls back to database station coordinates when an svg anchor is missing", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-eglinton-davisville",
        lineId: "line-1",
        label: "Eglinton to Davisville",
        stationAId: "eglinton",
        stationBId: "davisville",
        overlay: "delay",
      },
      stations,
      new Map(),
      new Map(),
    );

    assert.equal(path, "M 4547 1808 L 4547 2005");
  });

  it("falls back to station coordinates when an authored guide is missing", () => {
    const path = resolveNetworkSegmentPath(
      {
        id: "line-1-king-union",
        lineId: "line-1",
        label: "King to Union",
        stationAId: "king",
        stationBId: "union",
        guidePathId: "seg-line-1-union-king",
        overlay: "delay",
      },
      [
        { id: "king", name: "King", x: 4547, y: 3362 },
        { id: "union", name: "Union", x: 4311, y: 3597 },
      ],
      new Map(),
      new Map(),
    );

    assert.equal(path, "M 4547 3362 L 4311 3597");
  });

  it("flips visual movement when an authored guide runs opposite topology orientation", () => {
    assert.equal(
      visualTravelDirection({
        id: "line-1-spadina-st-george",
        lineId: "line-1",
        label: "Spadina to St George",
        overlay: "delay",
        travelDirection: "forward",
        guidePathReversed: true,
      }),
      "reverse",
    );
  });
});
```

- [ ] **Step 3: Run frontend fixture tests to verify geometry import fails**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: failure because `map-geometry.ts` does not exist.

- [ ] **Step 4: Add pure path resolution and browser SVG extraction**

Create `frontend/src/app/map-geometry.ts`:

```ts
import type { NetworkSegment, Station } from "./linewatch-data";

export type MapPoint = { x: number; y: number };

export function visualTravelDirection(segment: NetworkSegment) {
  const direction = segment.travelDirection ?? "bidirectional";
  if (!segment.guidePathReversed || direction === "bidirectional") {
    return direction;
  }
  return direction === "forward" ? "reverse" : "forward";
}

export function resolveNetworkSegmentPath(
  segment: NetworkSegment,
  stations: Station[],
  anchorPoints: Map<string, MapPoint>,
  guidePaths: Map<string, string>,
): string {
  if (segment.guidePathId) {
    const guide = guidePaths.get(segment.guidePathId);
    if (guide) return guide;
  }

  const stationById = new Map(stations.map((station) => [station.id, station]));
  const stationA = segment.stationAId ? stationById.get(segment.stationAId) : undefined;
  const stationB = segment.stationBId ? stationById.get(segment.stationBId) : undefined;
  const pointA =
    (segment.stationAAnchorId && anchorPoints.get(segment.stationAAnchorId)) ??
    (stationA ? { x: stationA.x, y: stationA.y } : undefined);
  const pointB =
    (segment.stationBAnchorId && anchorPoints.get(segment.stationBAnchorId)) ??
    (stationB ? { x: stationB.x, y: stationB.y } : undefined);

  if (pointA && pointB) {
    return `M ${pointA.x} ${pointA.y} L ${pointB.x} ${pointB.y}`;
  }
  return segment.pathD;
}

export function readSvgGeometry(
  root: SVGSVGElement,
  segments: NetworkSegment[],
): {
  anchorPoints: Map<string, MapPoint>;
  guidePaths: Map<string, string>;
} {
  const anchorIds = new Set(
    segments.flatMap((segment) =>
      [segment.stationAAnchorId, segment.stationBAnchorId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const anchorPoints = new Map<string, MapPoint>();
  for (const anchorId of anchorIds) {
    const element = root.querySelector<SVGGraphicsElement>(`#${CSS.escape(anchorId)}`);
    if (!element) continue;
    const box = element.getBBox();
    const point = root.createSVGPoint();
    point.x = box.x + box.width / 2;
    point.y = box.y + box.height / 2;
    const matrix = element.getCTM();
    const resolved = matrix ? point.matrixTransform(matrix) : point;
    anchorPoints.set(anchorId, { x: resolved.x, y: resolved.y });
  }

  const guidePaths = new Map<string, string>();
  const guideLayer = Array.from(root.querySelectorAll<SVGGElement>("g")).find(
    (element) => element.getAttribute("inkscape:label") === "segment-guides-layer",
  );
  for (const path of guideLayer?.querySelectorAll<SVGPathElement>("path") ?? []) {
    const label = path.getAttribute("inkscape:label");
    const pathD = path.getAttribute("d");
    if (label && pathD) guidePaths.set(label, pathD);
  }
  return { anchorPoints, guidePaths };
}
```

- [ ] **Step 5: Update fixture tests and run them**

Keep `linewatch-data.test.mjs` importing the temporary internal `slowdowns` property and assert that fixture mode remains empty:

```js
import { slowdowns } from "../src/app/linewatch-data.ts";
assert.equal(slowdowns.length, 0);
```

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit frontend contracts and geometry helper**

```bash
git add frontend/src/app/map-geometry.ts \
  frontend/src/app/linewatch-data.ts \
  frontend/tests/map-geometry.test.mjs \
  frontend/tests/linewatch-data.test.mjs
git commit -m "feat: resolve overlays from authored svg geometry"
```

## Task 7: Render Directional Chevron Variants

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add source-level tests for geometry resolution and three chevron modes**

Extend `map-layering.test.mjs`:

```js
const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");

assert.match(interactiveMapSource, /readSvgGeometry/);
assert.match(interactiveMapSource, /resolveNetworkSegmentPath/);
assert.match(mapGeometrySource, /segment\.travelDirection \?\? "bidirectional"/);
assert.match(mapGeometrySource, /segment\.guidePathReversed/);
assert.match(mapGeometrySource, /getAttribute\("inkscape:label"\) === "segment-guides-layer"/);
assert.match(interactiveMapSource, /travelDirection !== "reverse"/);
assert.match(interactiveMapSource, /travelDirection !== "forward"/);
assert.match(interactiveMapSource, /reducedMotion \? null : \(/);
assert.match(globalCss, /\.motion-paused \.asset-alert-path-glow/);
assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
```

- [ ] **Step 2: Run fixture tests to verify the new assertions fail**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: `map-layering.test.mjs` failure because the map does not resolve authored SVG geometry or branch chevron lanes.

- [ ] **Step 3: Measure SVG geometry after the authored map is rendered**

In `InteractiveTtcMap.tsx`:

```ts
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  readSvgGeometry,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  type MapPoint,
} from "../app/map-geometry";
```

Read `stations: mapStations` from `useDashboardData()` separately from station-detail hit-target props. Add:

```ts
const mapSvgRef = useRef<SVGSVGElement>(null);
const [anchorPoints, setAnchorPoints] = useState(new Map<string, MapPoint>());
const [guidePaths, setGuidePaths] = useState(new Map<string, string>());

useLayoutEffect(() => {
  if (loadState !== "ready" || !mapSvgRef.current) return;
  const geometry = readSvgGeometry(mapSvgRef.current, networkSegments);
  setAnchorPoints(geometry.anchorPoints);
  setGuidePaths(geometry.guidePaths);
}, [loadState, networkSegments]);
```

Attach `ref={mapSvgRef}` to the SVG containing the injected map layers. Before rendering overlays, resolve:

```ts
const renderedOverlaySegments = overlaySegments
  .map((segment) => ({
    ...segment,
    pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
  }))
  .filter((segment) => segment.pathD);
```

- [ ] **Step 4: Render forward, reverse, and bidirectional lanes**

Pass the existing `LineWatchShell` `reducedMotion` state into `InteractiveTtcMap`, then into `OverlaySegment`.

Inside `OverlaySegment`:

```ts
const renderedDirection = visualTravelDirection(segment);
const renderForwardLane = renderedDirection !== "reverse";
const renderReverseLane = renderedDirection !== "forward";
const singleLaneOffset = renderedDirection === "bidirectional" ? 0 : 20;
```

Replace unconditional chevron lanes with:

```tsx
{renderForwardLane && (
  <path
    d="M 0,12 L 24,12 L 48,28 L 24,44 L 0,44 L 24,28 Z M -60,12 L -36,12 L -12,28 L -36,44 L -60,44 L -36,28 Z"
    fill={chevronStroke}
    transform={`translate(0 ${singleLaneOffset})`}
  >
    {reducedMotion ? null : (
      <animateTransform
        attributeName="transform"
        additive="sum"
        type="translate"
        from="0 0"
        to="60 0"
        dur="4s"
        repeatCount="indefinite"
      />
    )}
  </path>
)}
{renderReverseLane && (
  <path
    d="M 60,52 L 36,52 L 12,68 L 36,84 L 60,84 L 36,68 Z M 120,52 L 96,52 L 72,68 L 96,84 L 120,84 L 96,68 Z"
    fill={chevronStroke}
    transform={`translate(0 ${renderedDirection === "bidirectional" ? 0 : -20})`}
  >
    {reducedMotion ? null : (
      <animateTransform
        attributeName="transform"
        additive="sum"
        type="translate"
        from="0 0"
        to="-60 0"
        dur="4s"
        repeatCount="indefinite"
      />
    )}
  </path>
)}
```

Use `segment.pathD` inside `OverlaySegment`.

- [ ] **Step 5: Stop CSS animation in reduced-motion mode**

Add:

```css
.motion-paused .asset-alert-path-glow,
.motion-paused .asset-alert-path.delay-candy,
.motion-paused .asset-alert-path.suspension-candy {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .asset-alert-path-glow,
  .asset-alert-path.delay-candy,
  .asset-alert-path.suspension-candy {
    animation: none !important;
  }
}
```

Apply `motion-paused` to the map root when the prop is true.

- [ ] **Step 6: Run frontend focused verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 7: Commit directional rendering**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx \
  frontend/src/components/LineWatchShell.tsx \
  frontend/src/app/globals.css \
  frontend/tests/map-layering.test.mjs
git commit -m "feat: render directional reduced speed chevrons"
```

## Task 8: Rename And Render Rider-Facing Reduced Speed Zones

**Files:**
- Move: `frontend/src/components/SlowdownsPanel.tsx` to `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/LineLegend.tsx`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/DataContext.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/linewatch-data.test.mjs`

- [ ] **Step 1: Add failing naming and grouped-detail assertions**

In `drawer-layout.test.mjs`, read `ReducedSpeedZonesPanel.tsx` and assert:

```js
assert.match(shellSource, /"reduced-speed-zones"/);
assert.match(shellSource, /Reduced Speed Zones/);
assert.match(reducedSpeedZonesSource, /Reduced Speed Zones/);
assert.match(reducedSpeedZonesSource, /zone\.displayDirection/);
assert.match(reducedSpeedZonesSource, /zone\.directionalDetails/);
assert.match(lineLegendSource, /View reduced speed zone/);
assert.doesNotMatch(shellSource, /> Slowdowns</);
```

- [ ] **Step 2: Run fixture tests to verify the naming test fails**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: failure because visible and internal menu naming still uses `Slowdowns`.

- [ ] **Step 3: Rename the panel and data property**

Rename:

```text
SlowdownsPanel.tsx -> ReducedSpeedZonesPanel.tsx
slowdowns          -> reducedSpeedZones
ActiveView "slowdowns" -> "reduced-speed-zones"
onSlowdownClick    -> onReducedSpeedZoneClick
```

In `linewatch-data.ts`, change the fixture export and keep the legacy `findAlertBySegmentId()` helper scoped to active disruptions so the older `transit-map.tsx` compatibility component retains an `ActiveAlert | undefined` return type:

```ts
export const reducedSpeedZones: ReducedSpeedZone[] = [];

export function findAlertBySegmentId(segmentId: string): ActiveAlert | undefined {
  return activeAlerts.find((alert) => alert.affectedSegmentIds.includes(segmentId));
}
```

In `DataContext.tsx`, replace `slowdowns: ActiveAlert[]` with:

```ts
reducedSpeedZones: ReducedSpeedZone[];
```

Keep the backend URL compatible:

```ts
fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown")
```

In `page.tsx`, remove the Server Component overlay-recomposition block. `/api/map` now carries the authoritative aggregated overlay, direction, and grouped-zone selection metadata:

```ts
const networkSegments = useFallback ? fallbackSegments : mapData.segments;
```

Update `linewatch-data.test.mjs` imports and neutral fixture assertions from `slowdowns` to `reducedSpeedZones`.

- [ ] **Step 4: Render grouped direction details**

In `ReducedSpeedZonesPanel.tsx`, render:

```tsx
<h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 whitespace-nowrap">
  <AlertTriangle size={22} className="text-amber-500 shrink-0" />
  Reduced Speed Zones
</h2>
```

For each zone:

```tsx
<p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1">
  {zone.displayDirection}
</p>
{zone.directionalDetails.length > 1 && (
  <div className="mt-2 flex flex-col gap-1 border-t border-black/5 pt-2 dark:border-white/5">
    {zone.directionalDetails.map((detail) => (
      <p key={detail.sourceAlertId} className="text-xs text-slate-600 dark:text-slate-400">
        <strong>{detail.displayDirection}:</strong> {detail.location}
      </p>
    ))}
  </div>
)}
```

Use singular preview wording:

```text
Preview Reduced Speed Zone
Hide Map Preview
```

- [ ] **Step 5: Select grouped zones from map links**

In `InteractiveTtcMap`, look up suspension cards and grouped zones separately:

```ts
type SelectableMapImpact =
  | Pick<ActiveAlert, "id" | "title" | "affectedSegmentIds">
  | Pick<ReducedSpeedZone, "id" | "title" | "affectedSegmentIds">;

const findSelectableImpactBySegment = (segment: NetworkSegment) => {
  if (segment.alertId) {
    return activeAlerts.find((alert) => alert.id === segment.alertId);
  }
  return reducedSpeedZones.find((zone) =>
    segment.reducedSpeedZoneIds?.includes(zone.id),
  );
};
```

Use grouped zone IDs in map click selection and selection highlighting. Type shared selection state and overlay props as `SelectableMapImpact | undefined` so active disruptions and grouped zones can use the same highlight path without pretending a zone is an `ActiveAlert`.

- [ ] **Step 6: Run frontend focused verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 7: Commit Reduced Speed Zone UI**

```bash
git add frontend/src/app \
  frontend/src/components \
  frontend/tests/drawer-layout.test.mjs \
  frontend/tests/linewatch-data.test.mjs
git commit -m "feat: add grouped reduced speed zone ui"
```

## Task 9: Update Smoke Fixtures And Browser Coverage

**Files:**
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a deterministic reduced-speed zone smoke payload**

Add `stub-eglinton`, `stub-davisville`, and an ordinary delay topology link:

```js
{ id: "stub-eglinton", name: "Eglinton", x: 4547, y: 1808, interchange: false },
{ id: "stub-davisville", name: "Davisville", x: 4547, y: 2005, interchange: false },
```

```js
{
  id: "stub-line-1-eglinton-davisville",
  lineId: "line-1",
  label: "Eglinton to Davisville",
  stationAId: "stub-eglinton",
  stationBId: "stub-davisville",
  stationAAnchorId: "station-eglinton",
  stationBAnchorId: "station-davisville",
  guidePathId: null,
  guidePathReversed: false,
  pathD: "M 4547 1808 L 4547 2005",
  overlay: "delay",
  travelDirection: "forward",
  sourceAlertIds: ["stub-zone-south-source"],
  reducedSpeedZoneIds: ["reduced-speed-zone-stub-zone-south-source"],
  alertId: null,
}
```

Add:

```js
export const reducedSpeedZonesResponse = [
  {
    id: "reduced-speed-zone-stub-zone-south-source",
    lineId: "line-1",
    lineNumber: "1",
    title: "Reduced Speed Zone",
    location: "Eglinton to Davisville",
    displayDirection: "Southbound",
    description: "Southbound trains are moving slower than usual.",
    updatedAgo: "Seeded demo",
    affectedSegmentIds: ["stub-line-1-eglinton-davisville"],
    sourceAlertIds: ["stub-zone-south-source"],
    directionalDetails: [
      {
        sourceAlertId: "stub-zone-south-source",
        displayDirection: "Southbound",
        location: "Eglinton to Davisville",
        description: "Southbound trains are moving slower than usual.",
      },
    ],
    source: "Playwright API stub",
  },
];
```

Update `api-stub.mjs` to import `reducedSpeedZonesResponse` instead of `slowdownsResponse` and return it from `/api/alerts?type=slowdown`.

- [ ] **Step 2: Add browser assertions**

In `dashboard.spec.ts`, after opening the menu:

```ts
await page.getByRole("button", { name: /Reduced Speed Zones/ }).click();
await expect(page.getByText("Reduced Speed Zones", { exact: true })).toBeVisible();
await expect(page.getByText("Southbound", { exact: true })).toBeVisible();
await expect(page.getByText("Eglinton to Davisville", { exact: true })).toBeVisible();
```

- [ ] **Step 3: Run smoke tests**

Run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: build succeeds and Playwright reports all Chromium smoke projects passing.

- [ ] **Step 4: Commit smoke coverage**

```bash
git add frontend/tests/smoke
git commit -m "test: cover reduced speed zone browser flow"
```

## Task 10: Align Documentation And Agent Guidance

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update current-state claims**

Document:

```text
- Live Alerts reduced-speed records now derive explicit cardinal direction from TTC wording.
- Map overlays project onto adjacent rapid-transit topology links.
- Ordinary overlay links resolve from SVG station-dot anchors.
- Nonlinear overlays resolve from the authored hidden segment-guides-layer.
- Opposite-direction Reduced Speed Zone records merge into one bidirectional effect and grouped card.
- Directionless Reduced Speed Zone records render bidirectionally without inventing a direction label.
- TTC Reduced Speed Zones webpage ingestion remains a separate planned slice.
```

Remove stale statements claiming visible map-overlay reads remain seeded-only where the normalized live-read switch now exists. Keep these limitations explicit:

```text
- TTC alert polling remains opt-in.
- GTFS import remains unimplemented.
- Populated geographic PostGIS geometry remains unimplemented.
- Production geospatial matching remains unimplemented.
- TTC Reduced Speed Zones webpage ingestion remains unimplemented.
- Live station arrivals remain demo-only estimates.
```

- [ ] **Step 2: Keep agent files synchronized**

Run:

```bash
diff -u AGENTS.md GEMINI.md
```

Expected: no output.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: describe directional reduced speed zones"
```

## Task 11: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run backend verification**

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture, type, and lint verification**

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 3: Run frontend production and browser verification**

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 4: Inspect the worktree**

```bash
git status --short
git log --oneline --decorate -12
```

Expected: only intentionally untracked local scratch files remain. Do not delete or commit user scratch files.

- [ ] **Step 5: Report implemented behavior precisely**

Report:

```text
- Eglinton-to-Davisville southbound Live Alerts records render one-way chevrons.
- Opposite directional records on one physical link merge into one bidirectional overlay and one grouped card.
- Ordinary links use authored station-dot anchors with database fallback.
- Curved links use segment-guides-layer paths.
- The TTC Reduced Speed Zones webpage importer remains deferred.
```
