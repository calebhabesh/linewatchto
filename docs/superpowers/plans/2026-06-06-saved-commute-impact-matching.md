# Saved Commute Impact Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account-backed Saved Commutes show default weighted rapid-transit routes and current/planned impact summaries instead of `Impact matching pending`.

**Architecture:** Add a backend `commute` package that derives scheduled adjacent-station segment weights from the active TTC GTFS import when available, falls back to deterministic topology weights when unavailable, and runs Dijkstra over existing `line_segments`. Extend account saved-commute responses with `path` and `impact`, then render those fields in the existing compact Saved Commutes panel. Keep saved-commute persistence unchanged; route review/edit remains a follow-up slice.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Spring JDBC `NamedParameterJdbcTemplate`, PostgreSQL/PostGIS, existing GTFS schedule tables, Next.js App Router, React, TypeScript, Node built-in test runner, Playwright.

---

## Reference Inputs

- Approved design: `docs/superpowers/specs/2026-06-06-saved-commute-impact-matching-design.md`
- Existing account spec: `docs/superpowers/specs/2026-06-05-account-keyboard-rsz-polish-design.md`
- GTFS schedule schema: `backend/src/main/resources/db/migration/V16__gtfs_schedule_arrivals.sql`
- GTFS schedule importer: `backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportService.java`
- Backend account service: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java`
- Account DTOs: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Existing topology model: `backend/src/main/java/com/calebhabesh/linewatch/station/LineSegmentEntity.java`
- Existing segment matcher: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java`
- Dashboard impact service: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Frontend account adapter: `frontend/src/app/account-data.ts`
- Saved Commutes UI: `frontend/src/components/SavedCommutesPanel.tsx`
- Smoke stub: `frontend/tests/smoke/api-stub.mjs`

Run commands from repository root unless specified.

Before implementation:

```bash
git status --short
```

Expected: either clean, or unrelated user edits that must be preserved.

## File Structure

Create backend commute package:

```text
backend/src/main/java/com/calebhabesh/linewatch/commute/
  CommuteResponses.java             Shared route path and impact DTO records.
  CommuteTravelTimeRepository.java  Reads GTFS-derived median segment weights.
  CommutePathService.java           Weighted Dijkstra over line_segments.
  CommuteImpactService.java         Matches computed paths against dashboard-visible impacts.
```

Create backend tests:

```text
backend/src/test/java/com/calebhabesh/linewatch/commute/
  CommuteTravelTimeRepositoryTest.java
  CommutePathServiceTest.java
  CommuteImpactServiceTest.java
```

Modify backend account files:

```text
backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java
backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java
backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteControllerTest.java
```

Modify frontend account and UI files:

```text
frontend/src/app/account-data.ts
frontend/src/components/SavedCommutesPanel.tsx
frontend/src/app/globals.css
frontend/tests/account-data.test.mjs
frontend/tests/account-ui-source.test.mjs
frontend/tests/drawer-layout.test.mjs
frontend/tests/smoke/api-stub.mjs
frontend/tests/smoke/dashboard.spec.ts
```

Modify docs after implementation:

```text
README.md
AGENTS.md
GEMINI.md
```

---

### Task 1: Backend DTOs And GTFS Weight Repository Contract

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepositoryTest.java`

- [ ] **Step 1: Create commute response records**

Create `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java`:

```java
package com.calebhabesh.linewatch.commute;

import java.time.OffsetDateTime;
import java.util.List;

public final class CommuteResponses {
    private CommuteResponses() {}

    public record PathResponse(
        String status,
        List<String> stationIds,
        List<String> segmentIds,
        List<String> lineIds,
        List<String> transferStationIds,
        int estimatedTravelSeconds,
        String weightSource,
        String summary
    ) {
        public boolean available() {
            return "available".equals(status);
        }
    }

    public record ImpactResponse(
        String status,
        String severity,
        String statusLabel,
        String detail,
        List<MatchedImpactResponse> matchedImpacts
    ) {}

    public record MatchedImpactResponse(
        String id,
        String kind,
        String status,
        String severity,
        String title,
        String lineId,
        String lineNumber,
        String location,
        String displayDirection,
        String source,
        List<String> matchedSegmentIds,
        List<String> matchedStationIds,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        String window,
        String timingStatus
    ) {}
}
```

- [ ] **Step 2: Write a failing repository source-contract test**

Create `backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepositoryTest.java`:

```java
package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class CommuteTravelTimeRepositoryTest {

    @Test
    void repositoryDerivesMedianSegmentWeightsFromActiveGtfsImport() throws IOException {
        String source = source("/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java");

        assertThat(source).contains("gtfs_schedule_imports");
        assertThat(source).contains("gtfs_stop_times");
        assertThat(source).contains("gtfs_station_stops");
        assertThat(source).contains("percentile_cont(0.5)");
        assertThat(source).contains("next_time.arrival_seconds - current_time.departure_seconds");
        assertThat(source).contains("between 30 and 900");
        assertThat(source).contains("segment.station_a_id = adjacent.station_a_id");
        assertThat(source).contains("segment.station_b_id = adjacent.station_b_id");
        assertThat(source).contains("gtfs-scheduled-median");
    }

    private String source(String path) throws IOException {
        String relative = path.startsWith("/") ? path.substring(1) : path;
        Path backendRelative = Path.of("src/main/java", relative);
        if (Files.exists(backendRelative)) {
            return Files.readString(backendRelative);
        }
        Path repoRelative = Path.of("backend/src/main/java", relative);
        assertThat(repoRelative).exists();
        return Files.readString(repoRelative);
    }
}
```

- [ ] **Step 3: Run the failing repository contract test**

```bash
mvn -f backend/pom.xml -Dtest=CommuteTravelTimeRepositoryTest test
```

Expected: FAIL because `CommuteTravelTimeRepository.java` does not exist.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepositoryTest.java
git commit -m "test: define commute travel time repository contract"
```

---

### Task 2: GTFS-Derived Segment Weight Repository

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepositoryTest.java`

- [ ] **Step 1: Implement `CommuteTravelTimeRepository`**

Create `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java`:

```java
package com.calebhabesh.linewatch.commute;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CommuteTravelTimeRepository {
    public static final String GTFS_SOURCE = "gtfs-scheduled-median";

    private final NamedParameterJdbcTemplate jdbc;

    public CommuteTravelTimeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, SegmentTravelTime> findActiveScheduledSegmentWeights() {
        List<SegmentTravelTime> rows = jdbc.query("""
            with active_import as (
                select id
                from gtfs_schedule_imports
                where active = true
                order by imported_at desc
                limit 1
            ),
            station_times as (
                select route.line_id,
                       station_stop.station_id,
                       stop_time.trip_id,
                       stop_time.stop_sequence,
                       stop_time.arrival_seconds,
                       stop_time.departure_seconds
                from active_import
                join gtfs_station_stops station_stop
                  on station_stop.import_id = active_import.id
                join gtfs_stop_times stop_time
                  on stop_time.import_id = station_stop.import_id
                 and stop_time.stop_id = station_stop.stop_id
                join gtfs_trips trip
                  on trip.import_id = stop_time.import_id
                 and trip.trip_id = stop_time.trip_id
                join gtfs_routes route
                  on route.import_id = trip.import_id
                 and route.route_id = trip.route_id
                 and route.line_id = station_stop.line_id
            ),
            adjacent as (
                select current_time.line_id,
                       current_time.station_id as station_a_id,
                       next_time.station_id as station_b_id,
                       next_time.arrival_seconds - current_time.departure_seconds as travel_seconds
                from station_times current_time
                join station_times next_time
                  on next_time.line_id = current_time.line_id
                 and next_time.trip_id = current_time.trip_id
                 and next_time.stop_sequence = current_time.stop_sequence + 1
                where current_time.station_id <> next_time.station_id
                  and next_time.arrival_seconds - current_time.departure_seconds between 30 and 900
            ),
            matched as (
                select segment.id as segment_id,
                       adjacent.travel_seconds
                from adjacent
                join line_segments segment
                  on segment.line_id = adjacent.line_id
                 and (
                    (
                        segment.station_a_id = adjacent.station_a_id
                        and segment.station_b_id = adjacent.station_b_id
                    )
                    or
                    (
                        segment.station_a_id = adjacent.station_b_id
                        and segment.station_b_id = adjacent.station_a_id
                    )
                 )
            )
            select segment_id,
                   round(percentile_cont(0.5) within group (order by travel_seconds))::integer as travel_seconds,
                   count(*)::integer as sample_count
            from matched
            group by segment_id
            order by segment_id
            """, Map.of(), (rs, rowNum) -> new SegmentTravelTime(
                rs.getString("segment_id"),
                rs.getInt("travel_seconds"),
                rs.getInt("sample_count"),
                GTFS_SOURCE
            ));

        return rows.stream().collect(Collectors.toMap(
            SegmentTravelTime::segmentId,
            row -> row,
            (left, right) -> left,
            java.util.LinkedHashMap::new
        ));
    }

    public record SegmentTravelTime(
        String segmentId,
        int travelSeconds,
        int sampleCount,
        String source
    ) {}
}
```

- [ ] **Step 2: Run repository contract test**

```bash
mvn -f backend/pom.xml -Dtest=CommuteTravelTimeRepositoryTest test
```

Expected: PASS.

- [ ] **Step 3: Run GTFS schedule tests**

```bash
mvn -f backend/pom.xml -Dtest=GtfsScheduleImportServiceTest,RapidTransitStationAliasCoverageTest test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepositoryTest.java
git commit -m "feat: derive commute segment weights from GTFS schedules"
```

---

### Task 3: Weighted Dijkstra Path Tests

**Files:**
- Create: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`

- [ ] **Step 1: Write failing weighted path tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`:

```java
package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CommutePathServiceTest {
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final CommuteTravelTimeRepository travelTimeRepository = mock(CommuteTravelTimeRepository.class);
    private final CommutePathService service = new CommutePathService(lineSegmentRepository, travelTimeRepository);

    @Test
    void choosesLowerScheduledTimeInsteadOfFewestStops() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-a-x", "line-1", "a", "x", 101),
            segment("line-1-x-b", "line-1", "x", "b", 102),
            segment("line-2-a-c", "line-2", "a", "c", 301),
            segment("line-2-c-d", "line-2", "c", "d", 302),
            segment("line-2-d-b", "line-2", "d", "b", 303)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-1-a-x", weight("line-1-a-x", 600),
            "line-1-x-b", weight("line-1-x-b", 600),
            "line-2-a-c", weight("line-2-a-c", 100),
            "line-2-c-d", weight("line-2-c-d", 100),
            "line-2-d-b", weight("line-2-d-b", 100)
        ));

        CommuteResponses.PathResponse path = service.path("a", "b");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.stationIds()).containsExactly("a", "c", "d", "b");
        assertThat(path.segmentIds()).containsExactly("line-2-a-c", "line-2-c-d", "line-2-d-b");
        assertThat(path.estimatedTravelSeconds()).isEqualTo(300);
        assertThat(path.weightSource()).isEqualTo("gtfs-scheduled-median");
        assertThat(path.summary()).isEqualTo("Default scheduled route: 4 stations on Line 2, about 5 min");
    }

    @Test
    void appliesTransferPenaltyWhenChangingLinesAtSharedStation() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-origin-transfer", "line-1", "origin", "transfer", 101),
            segment("line-1-transfer-destination", "line-1", "transfer", "destination", 102),
            segment("line-4-transfer-destination", "line-4", "transfer", "destination", 401)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-1-origin-transfer", weight("line-1-origin-transfer", 100),
            "line-1-transfer-destination", weight("line-1-transfer-destination", 220),
            "line-4-transfer-destination", weight("line-4-transfer-destination", 80)
        ));

        CommuteResponses.PathResponse path = service.path("origin", "destination");

        assertThat(path.segmentIds()).containsExactly("line-1-origin-transfer", "line-1-transfer-destination");
        assertThat(path.lineIds()).containsExactly("line-1");
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.estimatedTravelSeconds()).isEqualTo(320);
    }

    @Test
    void usesFallbackWeightsWhenGtfsWeightsAreMissing() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-north-york-centre", "line-1", "finch", "north-york-centre", 101),
            segment("line-1-north-york-centre-sheppard-yonge", "line-1", "north-york-centre", "sheppard-yonge", 102)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse path = service.path("finch", "sheppard-yonge");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.segmentIds()).containsExactly(
            "line-1-finch-north-york-centre",
            "line-1-north-york-centre-sheppard-yonge"
        );
        assertThat(path.estimatedTravelSeconds()).isEqualTo(240);
        assertThat(path.weightSource()).isEqualTo("topology-fallback");
        assertThat(path.summary()).isEqualTo("Default route: 3 stations on Line 1, about 4 min");
    }

    @Test
    void returnsUnavailablePathWhenStationsAreDisconnected() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-north-york-centre", "line-1", "finch", "north-york-centre", 101),
            segment("line-2-kipling-islington", "line-2", "kipling", "islington", 301)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse path = service.path("finch", "islington");

        assertThat(path.status()).isEqualTo("unavailable");
        assertThat(path.stationIds()).containsExactly("finch", "islington");
        assertThat(path.segmentIds()).isEmpty();
        assertThat(path.lineIds()).isEmpty();
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.estimatedTravelSeconds()).isZero();
        assertThat(path.weightSource()).isEqualTo("unavailable");
        assertThat(path.summary()).isEqualTo("Route path unavailable");
    }

    private CommuteTravelTimeRepository.SegmentTravelTime weight(String segmentId, int seconds) {
        return new CommuteTravelTimeRepository.SegmentTravelTime(
            segmentId,
            seconds,
            20,
            CommuteTravelTimeRepository.GTFS_SOURCE
        );
    }

    private LineSegmentEntity segment(String id, String lineId, String stationAId, String stationBId, int sortOrder) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            null,
            sortOrder,
            "southbound",
            null,
            false,
            null,
            null
        );
    }
}
```

- [ ] **Step 2: Run the failing path tests**

```bash
mvn -f backend/pom.xml -Dtest=CommutePathServiceTest test
```

Expected: FAIL because `CommutePathService` does not exist.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java
git commit -m "test: define weighted commute pathfinding"
```

---

### Task 4: Weighted Dijkstra Path Service

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`

- [ ] **Step 1: Implement the weighted path service**

Create `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java`:

```java
package com.calebhabesh.linewatch.commute;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class CommutePathService {
    static final int FALLBACK_SEGMENT_SECONDS = 120;
    static final int DEFAULT_TRANSFER_SECONDS = 180;
    static final int SPADINA_TRANSFER_SECONDS = 300;

    private final LineSegmentRepository lineSegmentRepository;
    private final CommuteTravelTimeRepository travelTimeRepository;

    public CommutePathService(
        LineSegmentRepository lineSegmentRepository,
        CommuteTravelTimeRepository travelTimeRepository
    ) {
        this.lineSegmentRepository = lineSegmentRepository;
        this.travelTimeRepository = travelTimeRepository;
    }

    public CommuteResponses.PathResponse path(String originStationId, String destinationStationId) {
        String origin = normalize(originStationId);
        String destination = normalize(destinationStationId);
        if (origin == null || destination == null || origin.equals(destination)) {
            return unavailable(origin, destination);
        }

        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
            .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder).thenComparing(LineSegmentEntity::getId))
            .toList();
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> weights =
            travelTimeRepository.findActiveScheduledSegmentWeights();
        Map<String, List<Edge>> graph = graph(segments, weights);

        PriorityQueue<PathState> queue = new PriorityQueue<>(Comparator
            .comparingInt(PathState::totalSeconds)
            .thenComparingInt(PathState::transferCount)
            .thenComparingInt(state -> state.segmentIds().size())
            .thenComparing(PathState::pathKey));
        Map<StateKey, Integer> bestSeconds = new LinkedHashMap<>();

        PathState start = new PathState(
            origin,
            null,
            List.of(origin),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            0,
            0
        );
        queue.add(start);
        bestSeconds.put(new StateKey(origin, null), 0);

        while (!queue.isEmpty()) {
            PathState current = queue.remove();
            if (current.stationId().equals(destination) && !current.segmentIds().isEmpty()) {
                return available(current);
            }
            StateKey currentKey = new StateKey(current.stationId(), current.currentLineId());
            if (current.totalSeconds() > bestSeconds.getOrDefault(currentKey, Integer.MAX_VALUE)) {
                continue;
            }

            for (Edge edge : graph.getOrDefault(current.stationId(), List.of())) {
                boolean transfer = current.currentLineId() != null && !current.currentLineId().equals(edge.lineId());
                int transferSeconds = transfer ? transferPenalty(current.stationId()) : 0;
                int nextSeconds = current.totalSeconds() + edge.travelSeconds() + transferSeconds;
                StateKey nextKey = new StateKey(edge.toStationId(), edge.lineId());
                if (nextSeconds >= bestSeconds.getOrDefault(nextKey, Integer.MAX_VALUE)) {
                    continue;
                }
                bestSeconds.put(nextKey, nextSeconds);

                List<String> stationIds = new ArrayList<>(current.stationIds());
                stationIds.add(edge.toStationId());
                List<String> segmentIds = new ArrayList<>(current.segmentIds());
                segmentIds.add(edge.segmentId());
                List<String> lineIds = new ArrayList<>(current.lineIds());
                if (lineIds.stream().noneMatch(edge.lineId()::equals)) {
                    lineIds.add(edge.lineId());
                }
                List<String> transfers = new ArrayList<>(current.transferStationIds());
                if (transfer && transfers.stream().noneMatch(current.stationId()::equals)) {
                    transfers.add(current.stationId());
                }
                List<String> sources = new ArrayList<>(current.weightSources());
                sources.add(edge.weightSource());

                queue.add(new PathState(
                    edge.toStationId(),
                    edge.lineId(),
                    List.copyOf(stationIds),
                    List.copyOf(segmentIds),
                    List.copyOf(lineIds),
                    List.copyOf(transfers),
                    List.copyOf(sources),
                    nextSeconds,
                    current.transferCount() + (transfer ? 1 : 0)
                ));
            }
        }

        return unavailable(origin, destination);
    }

    private Map<String, List<Edge>> graph(
        List<LineSegmentEntity> segments,
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> weights
    ) {
        Map<String, List<Edge>> graph = new LinkedHashMap<>();
        for (LineSegmentEntity segment : segments) {
            CommuteTravelTimeRepository.SegmentTravelTime weight = weights.get(segment.getId());
            int seconds = weight == null ? FALLBACK_SEGMENT_SECONDS : weight.travelSeconds();
            String source = weight == null ? "fallback" : weight.source();
            addEdge(graph, segment.getStationAId(), new Edge(
                segment.getStationBId(),
                segment.getId(),
                segment.getLineId(),
                seconds,
                source,
                segment.getSortOrder()
            ));
            addEdge(graph, segment.getStationBId(), new Edge(
                segment.getStationAId(),
                segment.getId(),
                segment.getLineId(),
                seconds,
                source,
                segment.getSortOrder()
            ));
        }
        graph.replaceAll((stationId, edges) -> edges.stream()
            .sorted(Comparator.comparingInt(Edge::sortOrder).thenComparing(Edge::segmentId).thenComparing(Edge::toStationId))
            .toList());
        return graph;
    }

    private void addEdge(Map<String, List<Edge>> graph, String stationId, Edge edge) {
        if (isBlank(stationId) || isBlank(edge.toStationId()) || isBlank(edge.segmentId()) || isBlank(edge.lineId())) {
            return;
        }
        graph.computeIfAbsent(stationId, ignored -> new ArrayList<>()).add(edge);
    }

    private CommuteResponses.PathResponse available(PathState path) {
        return new CommuteResponses.PathResponse(
            "available",
            path.stationIds(),
            path.segmentIds(),
            path.lineIds(),
            path.transferStationIds(),
            path.totalSeconds(),
            weightSource(path.weightSources()),
            summary(path)
        );
    }

    private String summary(PathState path) {
        String prefix = allGtfs(path.weightSources()) ? "Default scheduled route" : "Default route";
        String stationPart = path.stationIds().size() + (path.stationIds().size() == 1 ? " station" : " stations");
        String linePart = path.lineIds().size() == 1
            ? "Line " + lineNumber(path.lineIds().getFirst())
            : "Lines " + joinLineNumbers(path.lineIds());
        return prefix + ": " + stationPart + " on " + linePart + ", about " + Math.max(1, Math.round(path.totalSeconds() / 60.0f)) + " min";
    }

    private String weightSource(List<String> sources) {
        if (sources.isEmpty()) {
            return "unavailable";
        }
        if (allGtfs(sources)) {
            return "gtfs-scheduled-median";
        }
        if (sources.stream().anyMatch(CommuteTravelTimeRepository.GTFS_SOURCE::equals)) {
            return "mixed-scheduled-fallback";
        }
        return "topology-fallback";
    }

    private boolean allGtfs(List<String> sources) {
        return !sources.isEmpty() && sources.stream().allMatch(CommuteTravelTimeRepository.GTFS_SOURCE::equals);
    }

    private String joinLineNumbers(List<String> lineIds) {
        List<String> numbers = lineIds.stream().map(this::lineNumber).toList();
        if (numbers.size() <= 1) {
            return String.join("", numbers);
        }
        return String.join(", ", numbers.subList(0, numbers.size() - 1))
            + " and "
            + numbers.getLast();
    }

    private String lineNumber(String lineId) {
        return lineId == null ? "" : lineId.replace("line-", "").toUpperCase(Locale.ROOT);
    }

    private int transferPenalty(String stationId) {
        return "spadina".equals(stationId) ? SPADINA_TRANSFER_SECONDS : DEFAULT_TRANSFER_SECONDS;
    }

    private CommuteResponses.PathResponse unavailable(String origin, String destination) {
        List<String> stationIds = origin == null || destination == null
            ? List.of()
            : List.of(origin, destination);
        return new CommuteResponses.PathResponse(
            "unavailable",
            stationIds,
            List.of(),
            List.of(),
            List.of(),
            0,
            "unavailable",
            "Route path unavailable"
        );
    }

    private String normalize(String stationId) {
        return stationId == null || stationId.isBlank() ? null : stationId.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record Edge(String toStationId, String segmentId, String lineId, int travelSeconds, String weightSource, int sortOrder) {}

    private record StateKey(String stationId, String lineId) {}

    private record PathState(
        String stationId,
        String currentLineId,
        List<String> stationIds,
        List<String> segmentIds,
        List<String> lineIds,
        List<String> transferStationIds,
        List<String> weightSources,
        int totalSeconds,
        int transferCount
    ) {
        String pathKey() {
            return String.join("|", segmentIds);
        }
    }
}
```

- [ ] **Step 2: Run path tests**

```bash
mvn -f backend/pom.xml -Dtest=CommutePathServiceTest test
```

Expected: PASS.

- [ ] **Step 3: Run existing segment matcher tests**

```bash
mvn -f backend/pom.xml -Dtest=AlertSegmentMatcherTest test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java
git commit -m "feat: compute weighted saved commute paths"
```

---

### Task 5: Commute Impact Matching

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteImpactServiceTest.java`

- [ ] **Step 1: Write impact matching tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteImpactServiceTest.java`:

```java
package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class CommuteImpactServiceTest {
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final CommuteImpactService service = new CommuteImpactService(dashboardService);

    @Test
    void returnsClearImpactWhenNoDashboardImpactsMatchThePath() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("finch", "north-york-centre", "sheppard-yonge"),
            List.of("line-1-finch-north-york-centre", "line-1-north-york-centre-sheppard-yonge")
        ));

        assertThat(impact.status()).isEqualTo("clear");
        assertThat(impact.severity()).isEqualTo("clear");
        assertThat(impact.statusLabel()).isEqualTo("Clear");
        assertThat(impact.detail()).isEqualTo("No active or planned LineWatch impacts match this route.");
        assertThat(impact.matchedImpacts()).isEmpty();
    }

    @Test
    void matchesActiveDelayByAffectedSegment() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of(new AlertDashboardService.DelayAlertDto(
            "delay_1",
            "line-1",
            "1",
            "Delays",
            "Eglinton to Davisville",
            "Southbound",
            "Trains are delayed.",
            List.of("line-1-eglinton-davisville"),
            OffsetDateTime.parse("2026-06-06T12:15:00-04:00"),
            OffsetDateTime.parse("2026-06-06T12:20:00-04:00"),
            "TTC Live Alert",
            "Mechanical issue"
        )));
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("eglinton", "davisville", "st-clair"),
            List.of("line-1-eglinton-davisville", "line-1-davisville-st-clair")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("minor");
        assertThat(impact.statusLabel()).isEqualTo("Affected now");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("delay_1");
            assertThat(match.kind()).isEqualTo("delay");
            assertThat(match.status()).isEqualTo("current");
            assertThat(match.matchedSegmentIds()).containsExactly("line-1-eglinton-davisville");
            assertThat(match.matchedStationIds()).isEmpty();
        });
    }

    @Test
    void stationNodeImpactMatchesAnyStationOnTheComputedPath() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of(new AlertDashboardService.StationNodeImpact(
            "st-george",
            "suspension",
            "alert_station_1",
            "Emergency alarm at St George"
        )));

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("spadina", "st-george", "bay"),
            List.of("line-2-spadina-st-george", "line-2-st-george-bay")
        ));

        assertThat(impact.status()).isEqualTo("affected");
        assertThat(impact.severity()).isEqualTo("suspended");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("alert_station_1");
            assertThat(match.kind()).isEqualTo("suspension");
            assertThat(match.location()).isEqualTo("st-george");
            assertThat(match.matchedStationIds()).containsExactly("st-george");
        });
    }

    @Test
    void plannedClosureMatchesByPreviewSegmentWhenNoCurrentImpactMatches() {
        when(dashboardService.activeAlerts()).thenReturn(List.of());
        when(dashboardService.delays()).thenReturn(List.of());
        when(dashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(dashboardService.plannedClosures()).thenReturn(List.of(new AlertDashboardService.PlannedClosureDto(
            "closure_1",
            "line-2",
            "2",
            "Weekend closure",
            "Sat 11:00 PM - Sun 8:00 AM",
            "Kipling to Jane",
            "Eastbound & Westbound",
            "No subway service during track work.",
            OffsetDateTime.parse("2026-06-06T23:00:00-04:00"),
            OffsetDateTime.parse("2026-06-06T10:00:00-04:00"),
            List.of("line-2-kipling-islington", "line-2-islington-royal-york"),
            true,
            "TTC Service Advisory",
            "Track work",
            "Shuttle buses operate",
            false,
            "upcoming",
            false,
            null,
            null,
            null,
            OffsetDateTime.parse("2026-06-06T23:00:00-04:00"),
            OffsetDateTime.parse("2026-06-07T08:00:00-04:00"),
            "Sat 11:00 PM - Sun 8:00 AM"
        )));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        CommuteResponses.ImpactResponse impact = service.impactFor(path(
            List.of("kipling", "islington", "royal-york"),
            List.of("line-2-kipling-islington", "line-2-islington-royal-york")
        ));

        assertThat(impact.status()).isEqualTo("planned");
        assertThat(impact.severity()).isEqualTo("planned");
        assertThat(impact.statusLabel()).isEqualTo("Planned impact");
        assertThat(impact.matchedImpacts()).singleElement().satisfies(match -> {
            assertThat(match.id()).isEqualTo("closure_1");
            assertThat(match.kind()).isEqualTo("planned-closure");
            assertThat(match.status()).isEqualTo("planned");
            assertThat(match.window()).isEqualTo("Sat 11:00 PM - Sun 8:00 AM");
        });
    }

    @Test
    void unavailablePathReturnsUnavailableImpactWithoutReadingDashboardImpacts() {
        CommuteResponses.ImpactResponse impact = service.impactFor(new CommuteResponses.PathResponse(
            "unavailable",
            List.of("finch", "islington"),
            List.of(),
            List.of(),
            List.of(),
            0,
            "unavailable",
            "Route path unavailable"
        ));

        assertThat(impact.status()).isEqualTo("unavailable");
        assertThat(impact.severity()).isEqualTo("unavailable");
        assertThat(impact.statusLabel()).isEqualTo("Route unavailable");
        assertThat(impact.detail()).isEqualTo("LineWatchTO could not compute a rapid-transit path for this saved commute.");
        assertThat(impact.matchedImpacts()).isEmpty();
        verifyNoInteractions(dashboardService);
    }

    private CommuteResponses.PathResponse path(List<String> stationIds, List<String> segmentIds) {
        return new CommuteResponses.PathResponse(
            "available",
            stationIds,
            segmentIds,
            List.of("line-1"),
            List.of(),
            300,
            "gtfs-scheduled-median",
            stationIds.size() + " stations on Line 1"
        );
    }
}
```

- [ ] **Step 2: Run the failing impact tests**

```bash
mvn -f backend/pom.xml -Dtest=CommuteImpactServiceTest test
```

Expected: FAIL because `CommuteImpactService` does not exist.

- [ ] **Step 3: Implement impact matching**

Create `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java`:

```java
package com.calebhabesh.linewatch.commute;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class CommuteImpactService {
    private final AlertDashboardService dashboardService;

    public CommuteImpactService(AlertDashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    public CommuteResponses.ImpactResponse impactFor(CommuteResponses.PathResponse path) {
        if (path == null || !path.available()) {
            return new CommuteResponses.ImpactResponse(
                "unavailable",
                "unavailable",
                "Route unavailable",
                "LineWatchTO could not compute a rapid-transit path for this saved commute.",
                List.of()
            );
        }

        Set<String> pathSegmentIds = new LinkedHashSet<>(path.segmentIds());
        Set<String> pathStationIds = new LinkedHashSet<>(path.stationIds());
        Map<String, CommuteResponses.MatchedImpactResponse> matchesByIdentity = new LinkedHashMap<>();

        for (AlertDashboardService.ActiveAlertDto alert : dashboardService.activeAlerts()) {
            List<String> matchedSegmentIds = intersection(alert.affectedSegmentIds(), pathSegmentIds);
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            String kind = "planned".equals(alert.severity()) ? "planned-closure" : "suspension";
            String severity = "suspension".equals(kind) ? "suspended" : "major";
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                alert.id(), kind, "current", severity, alert.title(), alert.lineId(), alert.lineNumber(),
                alert.location(), alert.displayDirection(), alert.source(), matchedSegmentIds, List.of(),
                alert.startedAt(), alert.updatedAt(), null, "active-now"
            ));
        }

        for (AlertDashboardService.DelayAlertDto alert : dashboardService.delays()) {
            List<String> matchedSegmentIds = intersection(alert.affectedSegmentIds(), pathSegmentIds);
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                alert.id(), "delay", "current", "minor", alert.title(), alert.lineId(), alert.lineNumber(),
                alert.location(), alert.displayDirection(), alert.source(), matchedSegmentIds, List.of(),
                alert.startedAt(), alert.updatedAt(), null, "active-now"
            ));
        }

        for (AlertDashboardService.ReducedSpeedZoneDto zone : dashboardService.reducedSpeedZones()) {
            List<String> matchedSegmentIds = intersection(zone.affectedSegmentIds(), pathSegmentIds);
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                zone.id(), "reduced-speed-zone", "current", "minor", zone.title(), zone.lineId(), zone.lineNumber(),
                zone.location(), zone.displayDirection(), zone.source(), matchedSegmentIds, List.of(),
                zone.startedAt(), zone.updatedAt(), null, "active-now"
            ));
        }

        for (AlertDashboardService.StationNodeImpact impact : dashboardService.activeStationNodeImpacts()) {
            if (!pathStationIds.contains(impact.stationId())) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                impact.cardId(), impact.kind(), "current", severityForKind(impact.kind()), impact.title(),
                null, null, impact.stationId(), null, "TTC Live Alerts", List.of(), List.of(impact.stationId()),
                null, null, null, "active-now"
            ));
        }

        for (AlertDashboardService.PlannedClosureDto closure : dashboardService.plannedClosures()) {
            List<String> matchedSegmentIds = intersection(closure.previewSegmentIds(), pathSegmentIds);
            if (matchedSegmentIds.isEmpty()) {
                continue;
            }
            putMatch(matchesByIdentity, new CommuteResponses.MatchedImpactResponse(
                closure.id(), "planned-closure", "planned", "planned", closure.title(), closure.lineId(), closure.lineNumber(),
                closure.location(), closure.displayDirection(), closure.source(), matchedSegmentIds, List.of(),
                closure.startedAt(), closure.updatedAt(), closure.window(), closure.timingStatus()
            ));
        }

        List<CommuteResponses.MatchedImpactResponse> matches = matchesByIdentity.values().stream()
            .sorted(Comparator
                .comparingInt((CommuteResponses.MatchedImpactResponse match) -> severityPriority(match.severity())).reversed()
                .thenComparing(CommuteResponses.MatchedImpactResponse::kind)
                .thenComparing(CommuteResponses.MatchedImpactResponse::id))
            .toList();

        return responseFor(matches);
    }

    private List<String> intersection(List<String> values, Set<String> pathValues) {
        if (values == null || values.isEmpty() || pathValues.isEmpty()) {
            return List.of();
        }
        List<String> matches = new ArrayList<>();
        for (String value : values) {
            if (pathValues.contains(value)) {
                matches.add(value);
            }
        }
        return matches.stream().distinct().toList();
    }

    private void putMatch(Map<String, CommuteResponses.MatchedImpactResponse> matchesByIdentity, CommuteResponses.MatchedImpactResponse match) {
        if (match.id() == null || match.id().isBlank()) {
            return;
        }
        matchesByIdentity.putIfAbsent(match.kind() + "|" + match.id(), match);
    }

    private CommuteResponses.ImpactResponse responseFor(List<CommuteResponses.MatchedImpactResponse> matches) {
        if (matches.isEmpty()) {
            return new CommuteResponses.ImpactResponse(
                "clear",
                "clear",
                "Clear",
                "No active or planned LineWatch impacts match this route.",
                List.of()
            );
        }
        boolean hasCurrent = matches.stream().anyMatch(match -> "current".equals(match.status()));
        String topSeverity = matches.stream()
            .map(CommuteResponses.MatchedImpactResponse::severity)
            .max(Comparator.comparingInt(this::severityPriority))
            .orElse("planned");
        return new CommuteResponses.ImpactResponse(
            hasCurrent ? "affected" : "planned",
            topSeverity,
            hasCurrent ? "Affected now" : "Planned impact",
            detail(matches, hasCurrent),
            matches
        );
    }

    private String detail(List<CommuteResponses.MatchedImpactResponse> matches, boolean hasCurrent) {
        long currentCount = matches.stream().filter(match -> "current".equals(match.status())).count();
        long plannedCount = matches.stream().filter(match -> "planned".equals(match.status())).count();
        if (hasCurrent) {
            String currentPart = currentCount == 1
                ? "1 current impact matches this route"
                : currentCount + " current impacts match this route";
            return plannedCount == 0
                ? currentPart + "."
                : currentPart + ", plus " + plannedCount + " planned " + (plannedCount == 1 ? "impact" : "impacts") + ".";
        }
        return plannedCount == 1
            ? "1 upcoming planned impact matches this route."
            : plannedCount + " upcoming planned impacts match this route.";
    }

    private String severityForKind(String kind) {
        return switch (kind) {
            case "suspension" -> "suspended";
            case "planned-closure" -> "major";
            case "delay", "reduced-speed-zone" -> "minor";
            default -> "minor";
        };
    }

    private int severityPriority(String severity) {
        return switch (severity) {
            case "suspended" -> 5;
            case "major" -> 4;
            case "minor" -> 3;
            case "planned" -> 2;
            case "clear" -> 1;
            default -> 0;
        };
    }
}
```

- [ ] **Step 4: Run impact tests**

```bash
mvn -f backend/pom.xml -Dtest=CommuteImpactServiceTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java backend/src/test/java/com/calebhabesh/linewatch/commute/CommuteImpactServiceTest.java
git commit -m "feat: match saved commute routes to dashboard impacts"
```

---

### Task 6: Account Saved Commute Response Integration

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java`

- [ ] **Step 1: Update account service tests**

In `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java`, add imports:

```java
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
```

Replace the service fields with:

```java
    private final CommutePathService commutePathService = mock(CommutePathService.class);
    private final CommuteImpactService commuteImpactService = mock(CommuteImpactService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final SavedCommuteService service = new SavedCommuteService(
        commuteRepository,
        stationRepository,
        commutePathService,
        commuteImpactService,
        clock
    );
```

Add this helper:

```java
    private void stubCommutePathAndImpact(String originStationId, String destinationStationId) {
        CommuteResponses.PathResponse path = new CommuteResponses.PathResponse(
            "available",
            List.of(originStationId, destinationStationId),
            List.of("segment_" + originStationId + "_" + destinationStationId),
            List.of("line-1"),
            List.of(),
            300,
            "gtfs-scheduled-median",
            "Default scheduled route: 2 stations on Line 1, about 5 min"
        );
        when(commutePathService.path(originStationId, destinationStationId)).thenReturn(path);
        when(commuteImpactService.impactFor(path)).thenReturn(new CommuteResponses.ImpactResponse(
            "clear",
            "clear",
            "Clear",
            "No active or planned LineWatch impacts match this route.",
            List.of()
        ));
    }
```

Call `stubCommutePathAndImpact("finch", "union");` before existing `service.create(...)` and `service.list(account)` calls that expect a `finch -> union` commute.

Add assertions:

```java
        assertThat(response.path().estimatedTravelSeconds()).isEqualTo(300);
        assertThat(response.path().weightSource()).isEqualTo("gtfs-scheduled-median");
        assertThat(response.impact().statusLabel()).isEqualTo("Clear");
```

- [ ] **Step 2: Run failing account service test**

```bash
mvn -f backend/pom.xml -Dtest=SavedCommuteServiceTest test
```

Expected: FAIL because `SavedCommuteResponse` does not expose `path()` or `impact()`.

- [ ] **Step 3: Extend account DTOs**

Modify `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`:

```java
package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.commute.CommuteResponses;
import java.time.Instant;
import java.util.List;

public final class AccountResponses {
    private AccountResponses() {}

    public record UserResponse(String id, String email, String displayName, boolean demo) {}

    public record AuthResponse(boolean authenticated, UserResponse user) {}

    public record AuthSession(UserResponse user, String rawSessionToken, Instant expiresAt) {}

    public record SavedCommuteResponse(
        String id,
        String label,
        String originStationId,
        String originStationName,
        String destinationStationId,
        String destinationStationName,
        String routeLabel,
        CommuteResponses.PathResponse path,
        CommuteResponses.ImpactResponse impact,
        Instant createdAt,
        Instant updatedAt
    ) {}

    public record SavedCommuteListResponse(List<SavedCommuteResponse> commutes) {}
}
```

- [ ] **Step 4: Inject commute services into `SavedCommuteService`**

Modify `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java` imports:

```java
import com.calebhabesh.linewatch.commute.CommuteImpactService;
import com.calebhabesh.linewatch.commute.CommutePathService;
import com.calebhabesh.linewatch.commute.CommuteResponses;
```

Replace the constructor block with:

```java
    private final SavedCommuteRepository commuteRepository;
    private final StationRepository stationRepository;
    private final CommutePathService commutePathService;
    private final CommuteImpactService commuteImpactService;
    private final Clock clock;

    @Autowired
    public SavedCommuteService(
        SavedCommuteRepository commuteRepository,
        StationRepository stationRepository,
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService
    ) {
        this(commuteRepository, stationRepository, commutePathService, commuteImpactService, Clock.systemUTC());
    }

    SavedCommuteService(
        SavedCommuteRepository commuteRepository,
        StationRepository stationRepository,
        CommutePathService commutePathService,
        CommuteImpactService commuteImpactService,
        Clock clock
    ) {
        this.commuteRepository = commuteRepository;
        this.stationRepository = stationRepository;
        this.commutePathService = commutePathService;
        this.commuteImpactService = commuteImpactService;
        this.clock = clock;
    }
```

Replace `toResponse(...)` with:

```java
    private AccountResponses.SavedCommuteResponse toResponse(SavedCommuteEntity commute, Map<String, StationEntity> stationsById) {
        StationEntity origin = stationsById.get(commute.getOriginStationId());
        StationEntity destination = stationsById.get(commute.getDestinationStationId());
        String originName = origin == null ? commute.getOriginStationId() : origin.getName();
        String destinationName = destination == null ? commute.getDestinationStationId() : destination.getName();
        CommuteResponses.PathResponse path = commutePathService.path(
            commute.getOriginStationId(),
            commute.getDestinationStationId()
        );
        CommuteResponses.ImpactResponse impact = commuteImpactService.impactFor(path);
        return new AccountResponses.SavedCommuteResponse(
            commute.getId(),
            commute.getLabel(),
            commute.getOriginStationId(),
            originName,
            commute.getDestinationStationId(),
            destinationName,
            originName + " -> " + destinationName,
            path,
            impact,
            commute.getCreatedAt(),
            commute.getUpdatedAt()
        );
    }
```

- [ ] **Step 5: Run account and dashboard tests**

```bash
mvn -f backend/pom.xml -Dtest=SavedCommuteServiceTest,SavedCommuteControllerTest,AlertDashboardServiceTest,MapControllerTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java
git commit -m "feat: return weighted path impacts for saved commutes"
```

---

### Task 7: Frontend Types And Saved Commute Rendering

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/account-ui-source.test.mjs`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Update frontend source tests**

In `frontend/tests/account-data.test.mjs`, add this source test inside the existing describe block:

```js
  it("defines saved commute weighted path and impact contracts", () => {
    const source = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");
    assert.match(source, /export type AccountCommutePath/);
    assert.match(source, /estimatedTravelSeconds: number/);
    assert.match(source, /weightSource: "gtfs-scheduled-median" \| "mixed-scheduled-fallback" \| "topology-fallback" \| "unavailable"/);
    assert.match(source, /export type AccountCommuteImpact/);
    assert.match(source, /path: AccountCommutePath/);
    assert.match(source, /impact: AccountCommuteImpact/);
  });
```

Add `import { readFileSync } from "node:fs";` to the top of that test file.

In `frontend/tests/account-ui-source.test.mjs`, replace the existing `Impact matching pending` assertion with:

```js
    assert.match(savedCommutesSource, /status-pill/);
    assert.match(savedCommutesSource, /matchedImpacts/);
    assert.match(savedCommutesSource, /Route path unavailable/);
    assert.doesNotMatch(savedCommutesSource, /Impact matching pending/);
```

In `frontend/tests/drawer-layout.test.mjs`, replace any assertion matching `Impact matching pending` with:

```js
    assert.match(savedCommutesSource, /impact\.statusLabel/);
    assert.doesNotMatch(savedCommutesSource, /Impact matching pending/);
```

- [ ] **Step 2: Run failing fixture tests**

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because account path and impact contracts are not typed and pending copy still exists.

- [ ] **Step 3: Add frontend account types**

In `frontend/src/app/account-data.ts`, add these types above `AccountSavedCommute`:

```ts
export type AccountCommutePath = {
  status: "available" | "unavailable";
  stationIds: string[];
  segmentIds: string[];
  lineIds: string[];
  transferStationIds: string[];
  estimatedTravelSeconds: number;
  weightSource: "gtfs-scheduled-median" | "mixed-scheduled-fallback" | "topology-fallback" | "unavailable";
  summary: string;
};

export type AccountMatchedImpact = {
  id: string;
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  status: "current" | "planned";
  severity: "minor" | "major" | "suspended" | "planned";
  title: string;
  lineId: string | null;
  lineNumber: string | null;
  location: string | null;
  displayDirection: string | null;
  source: string;
  matchedSegmentIds: string[];
  matchedStationIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  window?: string | null;
  timingStatus?: "active-now" | "upcoming" | "unknown" | null;
};

export type AccountCommuteImpact = {
  status: "clear" | "affected" | "planned" | "unavailable";
  severity: "clear" | "minor" | "major" | "suspended" | "planned" | "unavailable";
  statusLabel: string;
  detail: string;
  matchedImpacts: AccountMatchedImpact[];
};
```

Extend `AccountSavedCommute`:

```ts
export type AccountSavedCommute = {
  id: string;
  label: string;
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  routeLabel: string;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Render real impact states**

In `frontend/src/components/SavedCommutesPanel.tsx`, import `AccountMatchedImpact` and add helpers:

```tsx
function commuteTone(commute: AccountSavedCommute) {
  switch (commute.impact.severity) {
    case "suspended":
    case "major":
      return "danger";
    case "minor":
    case "planned":
      return "warning";
    case "unavailable":
      return "neutral";
    case "clear":
    default:
      return "ok";
  }
}

function impactKindLabel(kind: AccountMatchedImpact["kind"]) {
  switch (kind) {
    case "reduced-speed-zone":
      return "RSZ";
    case "planned-closure":
      return "Planned";
    case "suspension":
      return "Suspension";
    case "delay":
    default:
      return "Delay";
  }
}

function impactLineLabel(impact: AccountMatchedImpact) {
  return impact.lineNumber ? `Line ${impact.lineNumber}` : "Station";
}

function routeSummary(commute: AccountSavedCommute) {
  return commute.path.status === "available" ? commute.path.summary : "Route path unavailable";
}
```

Replace the form heading badge text with:

```tsx
<span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Route impacts enabled</span>
```

Replace the account commute card body with:

```tsx
                <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start gap-2">
                        <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{commute.label}</h3>
                        <span className={`status-pill ${commuteTone(commute)}`}>{commute.impact.statusLabel}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">{commute.routeLabel}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 whitespace-normal break-words">{routeSummary(commute)}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 whitespace-normal break-words">{commute.impact.detail}</p>
                      {commute.impact.matchedImpacts.length > 0 ? (
                        <ul className="saved-commute-impact-list">
                          {commute.impact.matchedImpacts.slice(0, 3).map((impact) => (
                            <li key={`${impact.kind}-${impact.id}`}>
                              <strong>{impactKindLabel(impact.kind)}</strong>
                              <span>{impactLineLabel(impact)}{impact.location ? `: ${impact.location}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => handleDeleteCommute(commute.id)} aria-label={`Delete saved commute ${commute.label}`}>Delete</button>
                  </div>
                </div>
```

- [ ] **Step 5: Add matched-impact list CSS**

In `frontend/src/app/globals.css`, add near saved commute styles:

```css
.saved-commute-impact-list {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.65rem;
  min-width: 0;
}

.saved-commute-impact-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.4rem;
  align-items: baseline;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  padding-top: 0.35rem;
  font-size: 0.72rem;
  color: rgb(71, 85, 105);
}

.dark .saved-commute-impact-list li,
.high-contrast .saved-commute-impact-list li {
  border-top-color: rgba(255, 255, 255, 0.12);
  color: rgb(203, 213, 225);
}

.saved-commute-impact-list strong {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.saved-commute-impact-list span {
  min-width: 0;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 6: Run frontend checks for this task**

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/account-data.ts frontend/src/components/SavedCommutesPanel.tsx frontend/src/app/globals.css frontend/tests/account-data.test.mjs frontend/tests/account-ui-source.test.mjs frontend/tests/drawer-layout.test.mjs
git commit -m "feat: render weighted saved commute impacts"
```

---

### Task 8: Smoke Stub And Browser Assertion

**Files:**
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Update the smoke demo commute response**

In `frontend/tests/smoke/api-stub.mjs`, replace the demo commute object with:

```js
  {
    id: "commute_demo_finch_union",
    label: "Morning commute",
    originStationId: "stub-station",
    originStationName: "Stub Station",
    destinationStationId: "stub-union",
    destinationStationName: "Union",
    routeLabel: "Stub Station -> Union",
    path: {
      status: "available",
      stationIds: ["stub-station", "stub-eglinton", "stub-davisville", "stub-king", "stub-union"],
      segmentIds: ["stub-line-1-segment", "stub-line-1-eglinton-davisville", "stub-line-1-king-union"],
      lineIds: ["line-1"],
      transferStationIds: [],
      estimatedTravelSeconds: 780,
      weightSource: "gtfs-scheduled-median",
      summary: "Default scheduled route: 5 stations on Line 1, about 13 min",
    },
    impact: {
      status: "affected",
      severity: "suspended",
      statusLabel: "Affected now",
      detail: "1 current impact matches this route.",
      matchedImpacts: [
        {
          id: "stub-alert-line-1",
          kind: "suspension",
          status: "current",
          severity: "suspended",
          title: "Stub API signal problem",
          lineId: "line-1",
          lineNumber: "1",
          location: "Stub Station to Stub Terminal",
          displayDirection: "Northbound & Southbound",
          source: "Playwright API stub",
          matchedSegmentIds: ["stub-line-1-segment"],
          matchedStationIds: [],
          startedAt: "2026-06-05T14:30:00Z",
          updatedAt: "2026-06-05T14:35:00Z",
          window: null,
          timingStatus: "active-now",
        },
      ],
    },
    createdAt: "2026-06-05T14:30:00Z",
    updatedAt: "2026-06-05T14:30:00Z",
  },
```

- [ ] **Step 2: Update the smoke assertion**

In `frontend/tests/smoke/dashboard.spec.ts`, replace:

```ts
  await expect(page.getByText("Finch -> Union")).toBeVisible();
  await expect(page.getByText("Impact matching pending", { exact: true })).toBeVisible();
```

with:

```ts
  await expect(page.getByText("Stub Station -> Union")).toBeVisible();
  await expect(page.getByText("Default scheduled route: 5 stations on Line 1, about 13 min")).toBeVisible();
  await expect(page.getByText("Affected now", { exact: true })).toBeVisible();
  await expect(page.getByText("Suspension", { exact: true })).toBeVisible();
  await expect(page.getByText(/Line 1: Stub Station to Stub Terminal/)).toBeVisible();
```

- [ ] **Step 3: Run the focused smoke test**

```bash
npm --prefix frontend run test:smoke -- --grep "demo account shows account-backed saved commutes"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: smoke weighted saved commute impacts"
```

---

### Task 9: Documentation And Claim Alignment

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README current status**

In `README.md`, replace:

```markdown
- Saved commute impact cards.
```

with:

```markdown
- Account-backed saved commutes with weighted default rapid-transit route matching and dashboard-visible impact summaries.
```

In the Not implemented section, replace:

```markdown
- Backend commute-impact endpoint.
```

with:

```markdown
- Standalone commute-impact endpoint, route review/edit, push/email commute notifications, alternate-route suggestions, and accessibility-personalized commute matching.
```

Add this limitation near the data source limitations:

```markdown
Saved commute route matching uses scheduled adjacent-station weights from the active TTC GTFS import when available and deterministic topology fallback weights otherwise. It is useful for in-app route awareness, but it is not a full TTC trip planner and does not reflect live train travel times.
```

- [ ] **Step 2: Update AGENTS and GEMINI together**

In both `AGENTS.md` and `GEMINI.md`, replace:

```markdown
- GTFS import, populated geographic geometry, production segment matching, Redis caching, commute-impact API, and reliability aggregation are planned but not yet implemented.
```

with:

```markdown
- Populated geographic geometry, production segment matching, Redis caching, standalone commute-impact API, route review/edit, push/email commute notifications, and reliability aggregation are planned but not yet implemented.
```

Add this Current Reality bullet in both files:

```markdown
- Account-backed saved commutes compute a weighted default rapid-transit path over the seeded Line 1, 2, 4, 5, and 6 topology, using active GTFS scheduled median segment weights when available and fallback topology weights otherwise, then match dashboard-visible service impacts against every path segment and station-node impact.
```

Add this guardrail in both files:

```markdown
Do not claim saved commutes send push/email notifications, recommend alternate routes, account for walking transfers, provide route review/edit, provide accessibility-personalized matching, or use live train movement for route timing.
```

- [ ] **Step 3: Run docs consistency search**

```bash
rg -n "Impact matching pending|Backend commute-impact endpoint|commute-impact API|push/email commute|route review/edit|live train movement" README.md AGENTS.md GEMINI.md frontend/src frontend/tests
```

Expected:

- no `Impact matching pending` matches;
- no old `Backend commute-impact endpoint` match;
- `route review/edit`, `push/email commute`, and `live train movement` only appear in explicit limitations or guardrails.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: describe weighted saved commute matching"
```

---

### Task 10: Full Verification

**Files:**
- All files touched by previous tasks.

- [ ] **Step 1: Run backend tests**

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Run smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 7: Inspect final diff**

```bash
git status --short
git diff --stat
git diff -- backend/src/main/java/com/calebhabesh/linewatch/commute backend/src/main/java/com/calebhabesh/linewatch/account frontend/src/app/account-data.ts frontend/src/components/SavedCommutesPanel.tsx
```

Expected: only saved-commute weighted path matching changes, tests, smoke stub updates, and docs.

- [ ] **Step 8: Final commit if task commits were not used**

If the implementation was not committed task-by-task, commit the completed slice:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute backend/src/test/java/com/calebhabesh/linewatch/commute backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java backend/src/test/java/com/calebhabesh/linewatch/account frontend/src/app/account-data.ts frontend/src/components/SavedCommutesPanel.tsx frontend/src/app/globals.css frontend/tests README.md AGENTS.md GEMINI.md
git commit -m "feat: match saved commutes to weighted route impacts"
```

## Self-Review Checklist

- Every saved commute response includes `path` and `impact`.
- Dijkstra chooses lower scheduled travel time, not fewest stops.
- The route engine uses active GTFS scheduled median segment weights when available.
- Missing GTFS weights fall back to deterministic topology weights.
- Transfer penalties are applied only when changing lines.
- Matching covers active suspensions, active delays, active planned closures, Reduced Speed Zones, upcoming planned closures, and station-node impacts.
- Stale ingestion remains suppressed because the feature reads from `AlertDashboardService`.
- The frontend no longer renders `Impact matching pending`.
- README, AGENTS, and GEMINI do not overclaim notifications, full trip planning, manual route editing, accessibility personalization, or live train timing.
