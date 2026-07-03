# Estimated Train Blips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in LineWatchTO schematic map layer that shows estimated train markers inferred from fresh TTC GTFS-RT subway trip updates and existing SVG/topology data.

**Architecture:** Backend code derives train-marker snapshots from the existing GTFS-RT subway trip-update cache, active static GTFS station mappings, line topology, and segment travel-time weights. The frontend fetches a separate `/api/trains` snapshot only when the user enables the layer, then renders quiet SVG markers on the current TTC schematic map below station labels and above base routes. The UI must call these **estimated train markers**, not live train positions.

**Tech Stack:** Java 21, Spring Boot, JUnit/Mockito/AssertJ, Next.js App Router, React, TypeScript, CSS, Node built-in test runner, Playwright smoke tests.

---

## Scope Rules

- Keep this feature opt-in. Default state is off.
- Do not import GTFS `shapes.txt`.
- Do not claim physical train location, train movement, or route timing.
- Do not use GTFS-RT service alerts for train markers. Use only the existing TTC GTFS-RT Subway Trip Updates live-arrival feed.
- Do not render markers in fixture fallback mode unless a smoke-test stub explicitly returns `/api/trains`.
- Do not include train markers in saved-commute matching, line status, push notifications, surface notices, or global accessibility outages.
- Use fresh snapshots only. If the GTFS-RT cache is stale, disabled, or unmapped, return an empty marker list with `fresh: false`.
- Skip ambiguous schematic placement, especially ambiguous Line 1 Union-bound branch placement, instead of inventing a segment.

## Execution Preconditions

- Start from a clean branch or an isolated worktree created for this feature.
- Before editing, run `git status --short` and inspect any dirty files.
- If files in this plan already contain unrelated user changes, preserve those changes and commit only the feature edits made during execution.
- Do not run `git reset --hard`, `git checkout --`, or destructive cleanup commands while executing this plan.
- Use the commit commands as scoped examples. If the worktree has unrelated modifications in those paths, stage hunks interactively or use an equivalent non-destructive staging method.

## File Structure

Backend files:

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayModels.java`
  - Add `stopSequence` and `stationSortOrder` to `GtfsRtSubwayStationArrival`.
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexer.java`
  - Preserve GTFS stop sequence and station topology order in cached arrivals.
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalCache.java`
  - Expose a fresh snapshot accessor for marker derivation.
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarker.java`
  - Public backend marker read model.
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarkerSnapshot.java`
  - Public backend marker snapshot read model.
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`
  - Converts fresh trip-update arrivals into schematic train markers.
- Create: `backend/src/main/java/com/calebhabesh/linewatch/train/TrainController.java`
  - Exposes `GET /api/trains`.
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexerTest.java`
  - Assert added cache metadata.
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`
  - Cover interpolation, stale snapshots, provider gating, and ambiguity.
- Create: `backend/src/test/java/com/calebhabesh/linewatch/train/TrainControllerTest.java`
  - Cover API shape and source labeling.

Frontend files:

- Create: `frontend/src/app/train-markers.ts`
  - Types, empty snapshot, API fetcher, refresh interval helper.
- Modify: `frontend/src/components/LineWatchShell.tsx`
  - Store opt-in toggle, poll `/api/trains`, pass markers to the map, add mobile Display toggle.
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
  - Add mobile Display row for estimated trains.
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
  - Add desktop map toggle and render estimated train marker layer.
- Modify: `frontend/src/app/globals.css`
  - Style markers, toggle state, high contrast, reduced motion, and mobile performance mode.
- Modify: `frontend/tests/map-layering.test.mjs`
  - Assert marker layer order and guardrails.
- Create: `frontend/tests/train-markers.test.mjs`
  - Test fetch fallback and refresh interval parsing.
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
  - Add a train-marker stub response.
- Modify: `frontend/tests/smoke/api-stub.mjs`
  - Serve `/api/trains`.
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
  - Add one smoke check that enabling the layer renders a marker.

Docs:

- Modify: `README.md`
  - Document the opt-in estimated train marker layer and its limitation.
- Modify together if agent guidance changes: `AGENTS.md`, `GEMINI.md`
  - Only change these if the implementation changes current project reality or guardrails.

---

### Task 1: Preserve Stop Metadata In The Live GTFS-RT Arrival Cache

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayModels.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexer.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexerTest.java`

- [ ] **Step 1: Write the failing cache-metadata assertions**

In `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexerTest.java`, update the first test extraction to include `stopSequence` and `stationSortOrder`:

```java
assertThat(snapshot.arrivals())
    .extracting(
        GtfsRtSubwayStationArrival::stationId,
        GtfsRtSubwayStationArrival::lineId,
        GtfsRtSubwayStationArrival::direction,
        GtfsRtSubwayStationArrival::predictedAt,
        GtfsRtSubwayStationArrival::departureAt,
        GtfsRtSubwayStationArrival::vehicleId,
        GtfsRtSubwayStationArrival::tripId,
        GtfsRtSubwayStationArrival::stopId,
        GtfsRtSubwayStationArrival::stopSequence,
        GtfsRtSubwayStationArrival::stationSortOrder
    )
    .containsExactly(
        tuple("st-george", "line-2", "Eastbound", epoch(1782988036), epoch(1782988051), "232", "126789", "13756", 18, 15),
        tuple("bay", "line-2", "Eastbound", epoch(1782988096), null, "232", "126789", "13753", 19, 16)
    );
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayArrivalIndexerTest test
```

Expected: compilation fails because `GtfsRtSubwayStationArrival::stopSequence` and `stationSortOrder` do not exist.

- [ ] **Step 3: Extend the cached arrival record**

In `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayModels.java`, replace `GtfsRtSubwayStationArrival` with this record:

```java
record GtfsRtSubwayStationArrival(
    String stationId,
    String lineId,
    String direction,
    OffsetDateTime predictedAt,
    OffsetDateTime departureAt,
    String vehicleId,
    String tripId,
    String stopId,
    int stopSequence,
    int stationSortOrder
) {
    GtfsRtSubwayStationArrival(
        String stationId,
        String lineId,
        String direction,
        OffsetDateTime predictedAt,
        String vehicleId,
        String tripId,
        String stopId
    ) {
        this(stationId, lineId, direction, predictedAt, null, vehicleId, tripId, stopId, 0, 0);
    }

    GtfsRtSubwayStationArrival(
        String stationId,
        String lineId,
        String direction,
        OffsetDateTime predictedAt,
        OffsetDateTime departureAt,
        String vehicleId,
        String tripId,
        String stopId
    ) {
        this(stationId, lineId, direction, predictedAt, departureAt, vehicleId, tripId, stopId, 0, 0);
    }

    OffsetDateTime visibleUntil() {
        return departureAt != null ? departureAt : predictedAt;
    }
}
```

- [ ] **Step 4: Populate metadata in the indexer**

In `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexer.java`, replace the `arrivals.add(new GtfsRtSubwayStationArrival(...))` block with:

```java
arrivals.add(new GtfsRtSubwayStationArrival(
    mapping.stationId(),
    trip.lineId(),
    trip.direction(),
    stopUpdate.predictedAt(),
    stopUpdate.departureAt(),
    trip.vehicleId(),
    trip.tripId(),
    stopUpdate.stopId(),
    stopUpdate.stopSequence(),
    mapping.sortOrder()
));
```

- [ ] **Step 5: Run the focused passing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayArrivalIndexerTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayModels.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexer.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalIndexerTest.java
git commit -m "feat: retain gtfs realtime stop metadata"
```

---

### Task 2: Expose Fresh Live Snapshot Access For Train Marker Reads

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalCache.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalProviderTest.java`

- [ ] **Step 1: Add failing assertions to an existing cache-backed test**

In `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalProviderTest.java`, add this test method:

```java
@Test
void exposesFreshSnapshotOnlyWhileGtfsRtFeedIsFresh() {
    OffsetDateTime now = OffsetDateTime.now(clock);
    GtfsRtSubwayArrivalSnapshot freshSnapshot = new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
        new GtfsRtSubwayStationArrival(
            "finch-west",
            "line-1",
            "Northbound",
            now.plusMinutes(3),
            "123",
            "126607",
            "13791"
        )
    ));

    cache.replace(freshSnapshot);

    assertThat(cache.freshSnapshot()).contains(freshSnapshot);

    GtfsRtSubwayArrivalSnapshot staleSnapshot = new GtfsRtSubwayArrivalSnapshot(now.minusMinutes(6), now.minusMinutes(6), freshSnapshot.arrivals());
    cache.replace(staleSnapshot);

    assertThat(cache.freshSnapshot()).isEmpty();
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayArrivalProviderTest test
```

Expected: compilation fails because `freshSnapshot()` does not exist.

- [ ] **Step 3: Add the fresh snapshot accessor**

In `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalCache.java`, add this method below `snapshot()`:

```java
public Optional<GtfsRtSubwayArrivalSnapshot> freshSnapshot() {
    GtfsRtSubwayArrivalSnapshot snapshot = current.get();
    return isFresh(snapshot) ? Optional.of(snapshot) : Optional.empty();
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayArrivalProviderTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalCache.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayArrivalProviderTest.java
git commit -m "feat: expose fresh gtfs realtime arrival snapshots"
```

---

### Task 3: Build The Backend Estimated Train Marker Service

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarker.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarkerSnapshot.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GtfsRtSubwayTrainMarkerServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-02T10:00:00Z"), ZoneOffset.UTC);

    private ArrivalProperties properties;
    private GtfsRtSubwayArrivalCache cache;
    private LineSegmentRepository lineSegmentRepository;
    private CommuteTravelTimeRepository travelTimeRepository;
    private GtfsRtSubwayTrainMarkerService service;

    @BeforeEach
    void setUp() {
        properties = new ArrivalProperties();
        properties.setProvider(ArrivalProperties.ProviderMode.LIVE);
        properties.setScheduleHorizon(java.time.Duration.ofMinutes(90));
        cache = new GtfsRtSubwayArrivalCache(properties, CLOCK);
        lineSegmentRepository = mock(LineSegmentRepository.class);
        travelTimeRepository = mock(CommuteTravelTimeRepository.class);
        service = new GtfsRtSubwayTrainMarkerService(
            cache,
            lineSegmentRepository,
            travelTimeRepository,
            properties,
            CLOCK
        );
    }

    @Test
    void estimatesMarkerBetweenPreviousTopologyStationAndNextPredictedStop() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isTrue();
        assertThat(snapshot.source()).isEqualTo("TTC GTFS-RT subway trip updates");
        assertThat(snapshot.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.id()).isEqualTo("line-2:126789:232:bay");
            assertThat(marker.lineId()).isEqualTo("line-2");
            assertThat(marker.direction()).isEqualTo("Eastbound");
            assertThat(marker.travelDirection()).isEqualTo("forward");
            assertThat(marker.segmentId()).isEqualTo("line-2-st-george-bay");
            assertThat(marker.fromStationId()).isEqualTo("st-george");
            assertThat(marker.toStationId()).isEqualTo("bay");
            assertThat(marker.nextStationId()).isEqualTo("bay");
            assertThat(marker.progress()).isBetween(0.32, 0.34);
            assertThat(marker.segmentTravelSeconds()).isEqualTo(120);
            assertThat(marker.predictedAt()).isEqualTo(now.plusSeconds(80));
            assertThat(marker.vehicleId()).isEqualTo("232");
            assertThat(marker.tripId()).isEqualTo("126789");
        });
    }

    @Test
    void returnsNoMarkersWhenLiveProviderIsDisabled() {
        properties.setProvider(ArrivalProperties.ProviderMode.SCHEDULED);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(OffsetDateTime.now(CLOCK), OffsetDateTime.now(CLOCK), List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", OffsetDateTime.now(CLOCK).plusSeconds(80), "232", "126789", "13753")
        )));

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isFalse();
        assertThat(snapshot.markers()).isEmpty();
        assertThat(snapshot.message()).isEqualTo("Live GTFS-RT train markers are disabled.");
    }

    @Test
    void skipsAmbiguousNextStationPlacement() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival("union", "line-1", "Southbound", now.plusSeconds(60), "999", "trip-union", "stop-union")
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 220, "southbound"),
            segment("line-1-king-union", "line-1", "king", "union", 221, "southbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("no-active-gtfs-import");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isTrue();
        assertThat(snapshot.markers()).isEmpty();
    }

    private LineSegmentEntity segment(String id, String lineId, String stationAId, String stationBId, int sortOrder, String forwardDirection) {
        return new LineSegmentEntity(id, lineId, stationAId, stationBId, null, null, sortOrder, forwardDirection, null, false, null, null);
    }
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayTrainMarkerServiceTest test
```

Expected: compilation fails because the marker records and service do not exist.

- [ ] **Step 3: Add the public marker record**

Create `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarker.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import java.time.OffsetDateTime;

public record EstimatedTrainMarker(
    String id,
    String lineId,
    String direction,
    String travelDirection,
    String segmentId,
    String fromStationId,
    String toStationId,
    String nextStationId,
    double progress,
    int segmentTravelSeconds,
    OffsetDateTime predictedAt,
    String vehicleId,
    String tripId,
    OffsetDateTime feedCreatedAt,
    OffsetDateTime updatedAt
) {}
```

- [ ] **Step 4: Add the public marker snapshot record**

Create `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarkerSnapshot.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import java.time.OffsetDateTime;
import java.util.List;

public record EstimatedTrainMarkerSnapshot(
    boolean fresh,
    String source,
    String message,
    String disclaimer,
    OffsetDateTime feedCreatedAt,
    OffsetDateTime generatedAt,
    List<EstimatedTrainMarker> markers
) {
    public EstimatedTrainMarkerSnapshot {
        markers = List.copyOf(markers);
    }

    public static EstimatedTrainMarkerSnapshot unavailable(
        String source,
        String message,
        String disclaimer,
        OffsetDateTime generatedAt
    ) {
        return new EstimatedTrainMarkerSnapshot(false, source, message, disclaimer, null, generatedAt, List.of());
    }
}
```

- [ ] **Step 5: Add the train marker service**

Create `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository.SegmentTravelTime;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class GtfsRtSubwayTrainMarkerService {
    private static final int DEFAULT_SEGMENT_SECONDS = 120;
    private static final double MIN_PROGRESS = 0.08;
    private static final double MAX_PROGRESS = 0.92;
    private static final Duration PAST_TOLERANCE = Duration.ofSeconds(30);
    private static final String DISCLAIMER =
        "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.";

    private final GtfsRtSubwayArrivalCache cache;
    private final LineSegmentRepository lineSegmentRepository;
    private final CommuteTravelTimeRepository travelTimeRepository;
    private final ArrivalProperties properties;
    private final Clock clock;
    private volatile WeightSnapshot weightSnapshot = new WeightSnapshot("", Map.of());

    public GtfsRtSubwayTrainMarkerService(
        GtfsRtSubwayArrivalCache cache,
        LineSegmentRepository lineSegmentRepository,
        CommuteTravelTimeRepository travelTimeRepository,
        ArrivalProperties properties,
        Clock clock
    ) {
        this.cache = cache;
        this.lineSegmentRepository = lineSegmentRepository;
        this.travelTimeRepository = travelTimeRepository;
        this.properties = properties;
        this.clock = clock;
    }

    public EstimatedTrainMarkerSnapshot estimatedMarkers() {
        OffsetDateTime generatedAt = OffsetDateTime.now(clock);
        String source = properties.getLiveSourceName();

        if (properties.getProvider() != ArrivalProperties.ProviderMode.LIVE) {
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "Live GTFS-RT train markers are disabled.",
                DISCLAIMER,
                generatedAt
            );
        }

        Optional<GtfsRtSubwayArrivalSnapshot> freshSnapshot = cache.freshSnapshot();
        if (freshSnapshot.isEmpty()) {
            return EstimatedTrainMarkerSnapshot.unavailable(
                source,
                "No fresh TTC GTFS-RT subway trip update snapshot is available.",
                DISCLAIMER,
                generatedAt
            );
        }

        GtfsRtSubwayArrivalSnapshot snapshot = freshSnapshot.get();
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, SegmentTravelTime> segmentWeights = segmentWeights();

        List<EstimatedTrainMarker> markers = groupedArrivals(snapshot.arrivals())
            .values()
            .stream()
            .map(rows -> markerForTrain(rows, snapshot, segments, segmentWeights, generatedAt))
            .flatMap(Optional::stream)
            .sorted(Comparator
                .comparing(EstimatedTrainMarker::lineId)
                .thenComparing(EstimatedTrainMarker::direction)
                .thenComparing(EstimatedTrainMarker::segmentId)
                .thenComparing(EstimatedTrainMarker::id))
            .toList();

        return new EstimatedTrainMarkerSnapshot(
            true,
            source,
            markers.isEmpty()
                ? "Fresh TTC GTFS-RT subway trip updates are available, but no markers could be placed on the schematic map."
                : "Fresh TTC GTFS-RT subway trip updates are available.",
            DISCLAIMER,
            snapshot.feedCreatedAt(),
            generatedAt,
            markers
        );
    }

    private Map<String, List<GtfsRtSubwayStationArrival>> groupedArrivals(List<GtfsRtSubwayStationArrival> arrivals) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        OffsetDateTime cutoff = now.minus(PAST_TOLERANCE);
        OffsetDateTime horizon = now.plus(properties.getScheduleHorizon());

        return arrivals.stream()
            .filter(arrival -> arrival.predictedAt() != null)
            .filter(arrival -> !arrival.visibleUntil().isBefore(cutoff))
            .filter(arrival -> !arrival.predictedAt().isAfter(horizon))
            .sorted(Comparator
                .comparing(GtfsRtSubwayStationArrival::predictedAt)
                .thenComparingInt(GtfsRtSubwayStationArrival::stopSequence)
                .thenComparing(GtfsRtSubwayStationArrival::stationId))
            .collect(Collectors.groupingBy(
                this::trainKey,
                LinkedHashMap::new,
                Collectors.toList()
            ));
    }

    private Optional<EstimatedTrainMarker> markerForTrain(
        List<GtfsRtSubwayStationArrival> rows,
        GtfsRtSubwayArrivalSnapshot snapshot,
        List<LineSegmentEntity> segments,
        Map<String, SegmentTravelTime> segmentWeights,
        OffsetDateTime generatedAt
    ) {
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        GtfsRtSubwayStationArrival next = rows.getFirst();
        Optional<SegmentCandidate> segment = segmentEndingAt(next.lineId(), next.direction(), next.stationId(), segments);
        if (segment.isEmpty()) {
            return Optional.empty();
        }

        int travelSeconds = travelSeconds(segment.get().segment(), segmentWeights);
        long secondsToNext = Math.max(0, Duration.between(generatedAt, next.predictedAt()).toSeconds());
        double rawProgress = (travelSeconds - secondsToNext) / (double) travelSeconds;
        double progress = clamp(rawProgress, MIN_PROGRESS, MAX_PROGRESS);

        return Optional.of(new EstimatedTrainMarker(
            markerId(next),
            next.lineId(),
            next.direction(),
            segment.get().travelDirection(),
            segment.get().segment().getId(),
            segment.get().fromStationId(),
            segment.get().toStationId(),
            next.stationId(),
            progress,
            travelSeconds,
            next.predictedAt(),
            next.vehicleId(),
            next.tripId(),
            snapshot.feedCreatedAt(),
            generatedAt
        ));
    }

    private Optional<SegmentCandidate> segmentEndingAt(
        String lineId,
        String direction,
        String nextStationId,
        List<LineSegmentEntity> segments
    ) {
        String directionWire = wireDirection(direction);
        if (directionWire.isBlank()) {
            return Optional.empty();
        }

        List<SegmentCandidate> candidates = new ArrayList<>();
        for (LineSegmentEntity segment : segments) {
            if (!lineId.equals(segment.getLineId())) {
                continue;
            }
            String forward = normalize(segment.getForwardDirection());
            if (directionWire.equals(forward) && nextStationId.equals(segment.getStationBId())) {
                candidates.add(new SegmentCandidate(segment, "forward", segment.getStationAId(), segment.getStationBId()));
            } else if (opposite(directionWire).equals(forward) && nextStationId.equals(segment.getStationAId())) {
                candidates.add(new SegmentCandidate(segment, "reverse", segment.getStationBId(), segment.getStationAId()));
            }
        }

        return candidates.size() == 1 ? Optional.of(candidates.getFirst()) : Optional.empty();
    }

    private Map<String, SegmentTravelTime> segmentWeights() {
        String signature = normalizeIdentity(travelTimeRepository.activeScheduleSignature());
        WeightSnapshot current = weightSnapshot;
        if (current.signature().equals(signature)) {
            return current.weights();
        }

        synchronized (this) {
            current = weightSnapshot;
            if (current.signature().equals(signature)) {
                return current.weights();
            }

            Map<String, SegmentTravelTime> combined = new LinkedHashMap<>(emptyWhenNull(travelTimeRepository.findSeededFallbackSegmentWeights()));
            combined.putAll(emptyWhenNull(travelTimeRepository.findActiveScheduledSegmentWeights()));
            WeightSnapshot next = new WeightSnapshot(signature, Map.copyOf(combined));
            weightSnapshot = next;
            return next.weights();
        }
    }

    private int travelSeconds(LineSegmentEntity segment, Map<String, SegmentTravelTime> segmentWeights) {
        SegmentTravelTime weight = segmentWeights.get(segment.getId());
        if (weight != null && weight.travelSeconds() > 0) {
            return weight.travelSeconds();
        }
        return DEFAULT_SEGMENT_SECONDS;
    }

    private Map<String, SegmentTravelTime> emptyWhenNull(Map<String, SegmentTravelTime> weights) {
        return weights == null ? Map.of() : weights;
    }

    private String trainKey(GtfsRtSubwayStationArrival arrival) {
        return arrival.lineId() + "|" + normalize(arrival.direction()) + "|" + trainIdentity(arrival);
    }

    private String markerId(GtfsRtSubwayStationArrival arrival) {
        return arrival.lineId() + ":" + trainIdentity(arrival) + ":" + arrival.stationId();
    }

    private String trainIdentity(GtfsRtSubwayStationArrival arrival) {
        String tripId = normalizeIdentity(arrival.tripId());
        String vehicleId = normalizeIdentity(arrival.vehicleId());
        if (!tripId.isBlank() && !vehicleId.isBlank()) {
            return tripId + ":" + vehicleId;
        }
        if (!tripId.isBlank()) {
            return tripId;
        }
        if (!vehicleId.isBlank()) {
            return vehicleId;
        }
        return normalizeIdentity(arrival.stopId()) + ":" + arrival.stopSequence();
    }

    private String normalizeIdentity(String value) {
        return value == null ? "" : value.trim();
    }

    private String wireDirection(String direction) {
        String normalized = normalize(direction);
        if (normalized.startsWith("northbound")) return "northbound";
        if (normalized.startsWith("southbound")) return "southbound";
        if (normalized.startsWith("eastbound")) return "eastbound";
        if (normalized.startsWith("westbound")) return "westbound";
        return "";
    }

    private String opposite(String directionWire) {
        return switch (directionWire) {
            case "northbound" -> "southbound";
            case "southbound" -> "northbound";
            case "eastbound" -> "westbound";
            case "westbound" -> "eastbound";
            default -> "";
        };
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private record SegmentCandidate(
        LineSegmentEntity segment,
        String travelDirection,
        String fromStationId,
        String toStationId
    ) {}

    private record WeightSnapshot(
        String signature,
        Map<String, SegmentTravelTime> weights
    ) {}
}
```

- [ ] **Step 6: Run the focused passing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayTrainMarkerServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarker.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/live/EstimatedTrainMarkerSnapshot.java \
  backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java
git commit -m "feat: derive schematic train markers"
```

---

### Task 4: Add `GET /api/trains`

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/train/TrainController.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/train/TrainControllerTest.java`

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/calebhabesh/linewatch/train/TrainControllerTest.java`:

```java
package com.calebhabesh.linewatch.train;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarker;
import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarkerSnapshot;
import com.calebhabesh.linewatch.arrival.live.GtfsRtSubwayTrainMarkerService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TrainControllerTest {
    private final GtfsRtSubwayTrainMarkerService markerService = mock(GtfsRtSubwayTrainMarkerService.class);
    private final TrainController controller = new TrainController(markerService);

    @Test
    void returnsEstimatedTrainMarkerSnapshot() {
        OffsetDateTime generatedAt = OffsetDateTime.parse("2026-07-02T10:00:00Z");
        OffsetDateTime feedCreatedAt = generatedAt.minusSeconds(10);
        OffsetDateTime predictedAt = generatedAt.plusSeconds(80);
        when(markerService.estimatedMarkers()).thenReturn(new EstimatedTrainMarkerSnapshot(
            true,
            "TTC GTFS-RT subway trip updates",
            "Fresh TTC GTFS-RT subway trip updates are available.",
            "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
            feedCreatedAt,
            generatedAt,
            List.of(new EstimatedTrainMarker(
                "line-2:126789:232:bay",
                "line-2",
                "Eastbound",
                "forward",
                "line-2-st-george-bay",
                "st-george",
                "bay",
                "bay",
                0.333,
                120,
                predictedAt,
                "232",
                "126789",
                feedCreatedAt,
                generatedAt
            ))
        ));

        TrainController.TrainResponse response = controller.trains();

        assertThat(response.fresh()).isTrue();
        assertThat(response.source()).isEqualTo("TTC GTFS-RT subway trip updates");
        assertThat(response.disclaimer()).contains("not physical train positions");
        assertThat(response.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.id()).isEqualTo("line-2:126789:232:bay");
            assertThat(marker.lineId()).isEqualTo("line-2");
            assertThat(marker.progress()).isEqualTo(0.333);
            assertThat(marker.segmentTravelSeconds()).isEqualTo(120);
        });
    }
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TrainControllerTest test
```

Expected: compilation fails because `TrainController` does not exist.

- [ ] **Step 3: Add the controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/train/TrainController.java`:

```java
package com.calebhabesh.linewatch.train;

import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarker;
import com.calebhabesh.linewatch.arrival.live.EstimatedTrainMarkerSnapshot;
import com.calebhabesh.linewatch.arrival.live.GtfsRtSubwayTrainMarkerService;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trains")
public class TrainController {
    private final GtfsRtSubwayTrainMarkerService markerService;

    public TrainController(GtfsRtSubwayTrainMarkerService markerService) {
        this.markerService = markerService;
    }

    @GetMapping
    public TrainResponse trains() {
        EstimatedTrainMarkerSnapshot snapshot = markerService.estimatedMarkers();
        return new TrainResponse(
            snapshot.fresh(),
            snapshot.source(),
            snapshot.message(),
            snapshot.disclaimer(),
            snapshot.feedCreatedAt(),
            snapshot.generatedAt(),
            snapshot.markers().stream().map(TrainMarkerResponse::from).toList()
        );
    }

    public record TrainResponse(
        boolean fresh,
        String source,
        String message,
        String disclaimer,
        OffsetDateTime feedCreatedAt,
        OffsetDateTime generatedAt,
        List<TrainMarkerResponse> markers
    ) {}

    public record TrainMarkerResponse(
        String id,
        String lineId,
        String direction,
        String travelDirection,
        String segmentId,
        String fromStationId,
        String toStationId,
        String nextStationId,
        double progress,
        int segmentTravelSeconds,
        OffsetDateTime predictedAt,
        String vehicleId,
        String tripId,
        OffsetDateTime feedCreatedAt,
        OffsetDateTime updatedAt
    ) {
        static TrainMarkerResponse from(EstimatedTrainMarker marker) {
            return new TrainMarkerResponse(
                marker.id(),
                marker.lineId(),
                marker.direction(),
                marker.travelDirection(),
                marker.segmentId(),
                marker.fromStationId(),
                marker.toStationId(),
                marker.nextStationId(),
                marker.progress(),
                marker.segmentTravelSeconds(),
                marker.predictedAt(),
                marker.vehicleId(),
                marker.tripId(),
                marker.feedCreatedAt(),
                marker.updatedAt()
            );
        }
    }
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=TrainControllerTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/train/TrainController.java \
  backend/src/test/java/com/calebhabesh/linewatch/train/TrainControllerTest.java
git commit -m "feat: expose estimated train markers api"
```

---

### Task 5: Add Frontend Train Marker Fetching

**Files:**
- Create: `frontend/src/app/train-markers.ts`
- Create: `frontend/tests/train-markers.test.mjs`

- [ ] **Step 1: Write the failing frontend data tests**

Create `frontend/tests/train-markers.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
} from "../src/app/train-markers.ts";

describe("estimated train marker data adapter", () => {
  it("returns backend marker snapshots", async () => {
    const result = await getEstimatedTrainMarkers({
      fetcher: async () => new Response(JSON.stringify({
        fresh: true,
        source: "TTC GTFS-RT subway trip updates",
        message: "Fresh TTC GTFS-RT subway trip updates are available.",
        disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
        feedCreatedAt: "2026-07-02T09:59:50Z",
        generatedAt: "2026-07-02T10:00:00Z",
        markers: [{
          id: "line-2:126789:232:bay",
          lineId: "line-2",
          direction: "Eastbound",
          travelDirection: "forward",
          segmentId: "line-2-st-george-bay",
          fromStationId: "st-george",
          toStationId: "bay",
          nextStationId: "bay",
          progress: 0.333,
          segmentTravelSeconds: 120,
          predictedAt: "2026-07-02T10:01:20Z",
          vehicleId: "232",
          tripId: "126789",
          feedCreatedAt: "2026-07-02T09:59:50Z",
          updatedAt: "2026-07-02T10:00:00Z",
        }],
      }), { status: 200 }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.data.fresh, true);
    assert.equal(result.data.markers[0].segmentId, "line-2-st-george-bay");
  });

  it("falls back to an empty snapshot when the endpoint is unavailable", async () => {
    const result = await getEstimatedTrainMarkers({
      fetcher: async () => new Response("nope", { status: 503 }),
    });

    assert.equal(result.source, "fallback");
    assert.deepEqual(result.data, EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  });

  it("uses a bounded refresh interval", () => {
    assert.equal(estimatedTrainMarkerRefreshMs("9000"), 9000);
    assert.equal(estimatedTrainMarkerRefreshMs("2000"), 5000);
    assert.equal(estimatedTrainMarkerRefreshMs("bad"), 10000);
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
npm --prefix frontend run test:fixtures -- train-markers
```

If the fixture test script does not forward a filename filter, run:

```bash
node --import tsx --test frontend/tests/train-markers.test.mjs
```

Expected: FAIL because `frontend/src/app/train-markers.ts` does not exist.

- [ ] **Step 3: Add the train marker adapter**

Create `frontend/src/app/train-markers.ts`:

```ts
import { apiUrl } from "./api-client";

export type EstimatedTrainMarker = {
  id: string;
  lineId: string;
  direction: string;
  travelDirection: "forward" | "reverse" | "bidirectional";
  segmentId: string;
  fromStationId: string;
  toStationId: string;
  nextStationId: string;
  progress: number;
  segmentTravelSeconds: number;
  predictedAt: string;
  vehicleId?: string | null;
  tripId?: string | null;
  feedCreatedAt?: string | null;
  updatedAt?: string | null;
};

export type EstimatedTrainSnapshot = {
  fresh: boolean;
  source: string;
  message: string;
  disclaimer: string;
  feedCreatedAt?: string | null;
  generatedAt?: string | null;
  markers: EstimatedTrainMarker[];
};

export type EstimatedTrainDataResult = {
  source: "backend" | "fallback";
  data: EstimatedTrainSnapshot;
};

export type EstimatedTrainFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

export const EMPTY_ESTIMATED_TRAIN_SNAPSHOT: EstimatedTrainSnapshot = {
  fresh: false,
  source: "TTC GTFS-RT subway trip updates",
  message: "Estimated train markers are unavailable.",
  disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: null,
  generatedAt: null,
  markers: [],
};

const DEFAULT_TRAIN_MARKER_REFRESH_MS = 10_000;
const MIN_TRAIN_MARKER_REFRESH_MS = 5_000;

export function estimatedTrainMarkerRefreshMs(configured = process.env.NEXT_PUBLIC_LINEWATCH_TRAIN_MARKER_REFRESH_MS) {
  const parsed = Number(configured);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TRAIN_MARKER_REFRESH_MS;
  }
  return Math.max(MIN_TRAIN_MARKER_REFRESH_MS, parsed);
}

export async function getEstimatedTrainMarkers(
  options: EstimatedTrainFetchOptions = {},
): Promise<EstimatedTrainDataResult> {
  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(apiUrl("/api/trains", options.apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      throw new Error(`Estimated train markers request failed with ${response.status}`);
    }
    return { source: "backend", data: (await response.json()) as EstimatedTrainSnapshot };
  } catch {
    return { source: "fallback", data: EMPTY_ESTIMATED_TRAIN_SNAPSHOT };
  }
}
```

- [ ] **Step 4: Run the focused passing test**

Run:

```bash
node --import tsx --test frontend/tests/train-markers.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/train-markers.ts frontend/tests/train-markers.test.mjs
git commit -m "feat: add estimated train marker client"
```

---

### Task 6: Wire The Toggle And Polling State Into The Shell

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/MobileMoreSheet.tsx`

- [ ] **Step 1: Add source-level failing assertions**

In `frontend/tests/map-layering.test.mjs`, add this test near the other `InteractiveTtcMap` shell assertions:

```js
it("keeps estimated train markers opt-in and independently polled", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

  assert.match(shellSource, /linewatch-estimated-trains-enabled-v1/);
  assert.match(shellSource, /getEstimatedTrainMarkers/);
  assert.match(shellSource, /estimatedTrainMarkerRefreshMs/);
  assert.match(shellSource, /estimatedTrainsEnabled=\{estimatedTrainsEnabled\}/);
  assert.match(shellSource, /estimatedTrainMarkers=\{estimatedTrainSnapshot\.markers\}/);
  assert.match(moreSheetSource, /Estimated Trains/);
  assert.match(moreSheetSource, /aria-pressed=\{estimatedTrainsEnabled\}/);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: FAIL because the shell does not fetch or toggle estimated train markers.

- [ ] **Step 3: Add shell imports and state**

In `frontend/src/components/LineWatchShell.tsx`, extend imports:

```ts
import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  type EstimatedTrainSnapshot,
} from "../app/train-markers";
```

Add constants near the other storage/refresh constants:

```ts
const ESTIMATED_TRAINS_STORAGE_KEY = "linewatch-estimated-trains-enabled-v1";
```

Add state after `mapPresentationMode`:

```ts
const [estimatedTrainsEnabled, setEstimatedTrainsEnabled] = useState(false);
const [estimatedTrainSnapshot, setEstimatedTrainSnapshot] = useState<EstimatedTrainSnapshot>(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
```

- [ ] **Step 4: Add persistence and polling effects**

In `frontend/src/components/LineWatchShell.tsx`, add these effects after the mobile detection effects:

```ts
useEffect(() => {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(ESTIMATED_TRAINS_STORAGE_KEY);
  if (stored === "true") {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstimatedTrainsEnabled(true);
  }
}, []);

useEffect(() => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ESTIMATED_TRAINS_STORAGE_KEY, estimatedTrainsEnabled ? "true" : "false");
}, [estimatedTrainsEnabled]);

useEffect(() => {
  let cancelled = false;
  let intervalId: number | null = null;

  const refresh = async () => {
    if (!estimatedTrainsEnabled || document.visibilityState !== "visible") {
      return;
    }
    const result = await getEstimatedTrainMarkers();
    if (!cancelled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEstimatedTrainSnapshot(result.data);
    }
  };

  if (estimatedTrainsEnabled) {
    refresh();
    intervalId = window.setInterval(refresh, estimatedTrainMarkerRefreshMs());
  } else {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstimatedTrainSnapshot(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  }

  return () => {
    cancelled = true;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
  };
}, [estimatedTrainsEnabled]);
```

Add a status label near other memoized labels:

```ts
const estimatedTrainStatusLabel = estimatedTrainsEnabled
  ? estimatedTrainSnapshot.fresh
    ? `${estimatedTrainSnapshot.markers.length} shown`
    : "Waiting"
  : "Off";
```

- [ ] **Step 5: Pass props to map and mobile More**

In the `InteractiveTtcMap` call, add:

```tsx
estimatedTrainsEnabled={estimatedTrainsEnabled}
estimatedTrainMarkers={estimatedTrainSnapshot.markers}
onToggleEstimatedTrains={() => setEstimatedTrainsEnabled((current) => !current)}
```

In the `MobileMoreSheet` call, add:

```tsx
estimatedTrainsEnabled={estimatedTrainsEnabled}
estimatedTrainStatusLabel={estimatedTrainStatusLabel}
onToggleEstimatedTrains={() => setEstimatedTrainsEnabled((current) => !current)}
```

- [ ] **Step 6: Extend `MobileMoreSheet` props and Display row**

In `frontend/src/components/MobileMoreSheet.tsx`, add these props to `Props`:

```ts
estimatedTrainsEnabled: boolean;
estimatedTrainStatusLabel: string;
onToggleEstimatedTrains: () => void;
```

Destructure them in `MobileMoreSheet`.

In the Display section, after Reduced Motion, add:

```tsx
<button type="button" className="mobile-more-row" aria-pressed={estimatedTrainsEnabled} onClick={onToggleEstimatedTrains}>
  <MapIcon size={18} className="text-slate-500 dark:text-slate-400" />
  <span className="mobile-more-install-copy">
    <span>Estimated Trains</span>
    <span>{estimatedTrainStatusLabel}</span>
  </span>
</button>
```

- [ ] **Step 7: Run the passing source test**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/src/components/MobileMoreSheet.tsx frontend/tests/map-layering.test.mjs
git commit -m "feat: add estimated train marker toggle"
```

---

### Task 7: Render Markers On The Interactive SVG Map

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add failing map-layer assertions**

In `frontend/tests/map-layering.test.mjs`, add:

```js
it("renders estimated train markers below station labels and dims them during focused map states", () => {
  assert.match(interactiveMapSource, /aria-label="Estimated train markers"/);
  assert.match(interactiveMapSource, /function EstimatedTrainMarkerLayer/);
  assert.match(interactiveMapSource, /visualTravelDirection\(\{ \.\.\.segment, travelDirection: marker\.travelDirection \}\)/);
  assert.match(interactiveMapSource, /pathPointAtProgress/);
  assert.match(interactiveMapSource, /data-train-marker-line-id=\{marker\.lineId\}/);
  assert.match(globalCss, /\.estimated-train-marker-core/);
  assert.match(globalCss, /\.estimated-train-marker-layer\[data-muted="true"\]/);
  assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-halo/);

  const overlayIndex = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
  const trainIndex = interactiveMapSource.indexOf('aria-label="Estimated train markers"');
  const stationLayerIndex = interactiveMapSource.indexOf("{/* Top Layer: Stations (layer6) and text */}");

  assert.ok(overlayIndex > -1);
  assert.ok(trainIndex > overlayIndex);
  assert.ok(stationLayerIndex > trainIndex);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: FAIL because the marker layer does not exist.

- [ ] **Step 3: Add map props and imports**

In `frontend/src/components/InteractiveTtcMap.tsx`, import the marker types and icon:

```ts
import type { EstimatedTrainMarker } from "../app/train-markers";
import { ZoomIn, ZoomOut, Locate, Sun, Moon, TrainFront } from "lucide-react";
```

Update the component props:

```ts
estimatedTrainsEnabled?: boolean;
estimatedTrainMarkers?: EstimatedTrainMarker[];
onToggleEstimatedTrains?: () => void;
```

Destructure defaults:

```ts
estimatedTrainsEnabled = false,
estimatedTrainMarkers = [],
onToggleEstimatedTrains,
```

- [ ] **Step 4: Add a desktop map control button**

Inside `.desktop-map-control-rail`, after the recenter button block and before the zoom divider, add:

```tsx
{onToggleEstimatedTrains ? (
  <>
    <div className="map-control-divider" aria-hidden="true" />
    <button
      onClick={onToggleEstimatedTrains}
      className={`map-control-button train-layer-toggle ${estimatedTrainsEnabled ? "active" : ""}`}
      title={estimatedTrainsEnabled ? "Hide estimated train markers" : "Show estimated train markers"}
      aria-label={estimatedTrainsEnabled ? "Hide estimated train markers" : "Show estimated train markers"}
      aria-pressed={estimatedTrainsEnabled}
      type="button"
    >
      <TrainFront size={20} className="transition-colors" />
      <span className="text-[10px] font-black uppercase tracking-widest transition-colors">Trains</span>
    </button>
  </>
) : null}
```

- [ ] **Step 5: Render the train marker layer in the SVG**

In the main SVG, after the disruption overlays group and before the station/text layer, add:

```tsx
<g aria-label="Estimated train markers">
  <EstimatedTrainMarkerLayer
    enabled={estimatedTrainsEnabled}
    markers={estimatedTrainMarkers}
    segments={renderedNetworkSegments}
    muted={Boolean(selection || selectedStationId || commutePathPreview)}
  />
</g>
```

- [ ] **Step 6: Add marker rendering helpers**

Near other helper components in `frontend/src/components/InteractiveTtcMap.tsx`, add:

```tsx
function EstimatedTrainMarkerLayer({
  enabled,
  markers,
  segments,
  muted,
}: {
  enabled: boolean;
  markers: EstimatedTrainMarker[];
  segments: RenderedNetworkSegment[];
  muted: boolean;
}) {
  if (!enabled || markers.length === 0) return null;

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  return (
    <g className="estimated-train-marker-layer" data-muted={muted ? "true" : "false"} pointerEvents="none">
      {markers.flatMap((marker) => {
        const segment = segmentById.get(marker.segmentId);
        if (!segment?.pathD) return [];

        const visualDirection = visualTravelDirection({ ...segment, travelDirection: marker.travelDirection });
        const pathProgress = visualDirection === "reverse" ? 1 - marker.progress : marker.progress;
        const point = pathPointAtProgress(segment.pathD, pathProgress);
        if (!point) return [];

        return [
          <g
            key={marker.id}
            className={`estimated-train-marker estimated-train-marker-${marker.lineId}`}
            data-train-marker-id={marker.id}
            data-train-marker-line-id={marker.lineId}
            data-train-marker-segment-id={marker.segmentId}
            transform={`translate(${point.x} ${point.y})`}
          >
            <title>{`${lineLabelForTrainMarker(marker.lineId)} ${marker.direction} estimated train near ${marker.nextStationId}`}</title>
            <circle className="estimated-train-marker-halo" r="34" />
            <circle className="estimated-train-marker-core" r="18" />
            <path className="estimated-train-marker-glyph" d="M -7 -8 H 7 Q 10 -8 10 -5 V 5 Q 10 8 7 8 H -7 Q -10 8 -10 5 V -5 Q -10 -8 -7 -8 Z M -5 -4 H 5 M -5 3 H 5" />
          </g>,
        ];
      })}
    </g>
  );
}

function pathPointAtProgress(pathD: string, progress: number): MapPoint | null {
  if (typeof document === "undefined") return null;
  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    return path.getPointAtLength(Math.max(0, Math.min(1, progress)) * length);
  } catch {
    return null;
  }
}

function lineLabelForTrainMarker(lineId: string) {
  switch (lineId) {
    case "line-1":
      return "Line 1";
    case "line-2":
      return "Line 2";
    case "line-4":
      return "Line 4";
    case "line-5":
      return "Line 5";
    case "line-6":
      return "Line 6";
    default:
      return "Train";
  }
}
```

- [ ] **Step 7: Add marker CSS**

In `frontend/src/app/globals.css`, add near the map overlay CSS:

```css
.train-layer-toggle.active {
  background: rgba(37, 99, 235, 0.14);
  color: #2563eb;
}

.dark .train-layer-toggle.active {
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
}

.high-contrast .train-layer-toggle.active {
  background: #ffffff !important;
  color: #000000 !important;
}

.estimated-train-marker-layer {
  opacity: 1;
  transition: opacity 160ms ease;
}

.estimated-train-marker-layer[data-muted="true"] {
  opacity: 0.24;
}

.estimated-train-marker {
  color: #111827;
}

.estimated-train-marker-halo {
  fill: currentColor;
  opacity: 0.16;
  stroke: #ffffff;
  stroke-opacity: 0.64;
  stroke-width: 4;
}

.estimated-train-marker-core {
  fill: currentColor;
  stroke: #ffffff;
  stroke-width: 5;
}

.estimated-train-marker-glyph {
  fill: none;
  stroke: #ffffff;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.8;
}

.estimated-train-marker-line-1 {
  color: #f8c300;
}

.estimated-train-marker-line-2 {
  color: #00923f;
}

.estimated-train-marker-line-4 {
  color: #a21a68;
}

.estimated-train-marker-line-5 {
  color: #eb8738;
}

.estimated-train-marker-line-6 {
  color: #969594;
}

.high-contrast .estimated-train-marker-halo {
  opacity: 0.2;
  stroke: #000000;
}

.high-contrast .estimated-train-marker-core {
  stroke: #000000;
}

.high-contrast .estimated-train-marker-glyph {
  stroke: #000000;
}

.motion-paused .estimated-train-marker-layer,
.linewatch-shell.mobile-performance-mode .estimated-train-marker-layer {
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .estimated-train-marker-halo {
  display: none;
}
```

- [ ] **Step 8: Run the passing map-layer test**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/map-layering.test.mjs
git commit -m "feat: render estimated train markers"
```

---

### Task 8: Add Smoke Stub Coverage

**Files:**
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a stub train response**

In `frontend/tests/smoke/api-stub-data.mjs`, export:

```js
export const estimatedTrainsResponse = {
  fresh: true,
  source: "TTC GTFS-RT subway trip updates",
  message: "Fresh TTC GTFS-RT subway trip updates are available.",
  disclaimer: "Estimated train markers are schematic placements inferred from TTC GTFS-RT trip updates and LineWatchTO topology. They are not physical train positions.",
  feedCreatedAt: "2026-06-04T15:59:50Z",
  generatedAt: "2026-06-04T16:00:00Z",
  markers: [
    {
      id: "line-1:smoke-trip:smoke-vehicle:stub-davisville",
      lineId: "line-1",
      direction: "Southbound",
      travelDirection: "forward",
      segmentId: "stub-line-1-eglinton-davisville",
      fromStationId: "stub-eglinton",
      toStationId: "stub-davisville",
      nextStationId: "stub-davisville",
      progress: 0.45,
      segmentTravelSeconds: 120,
      predictedAt: "2026-06-04T16:01:06Z",
      vehicleId: "smoke-vehicle",
      tripId: "smoke-trip",
      feedCreatedAt: "2026-06-04T15:59:50Z",
      updatedAt: "2026-06-04T16:00:00Z",
    },
  ],
};
```

- [ ] **Step 2: Serve `/api/trains` from the smoke stub**

In `frontend/tests/smoke/api-stub.mjs`, import `estimatedTrainsResponse` and add this route before the station routes:

```js
if (request.method === "GET" && url.pathname === "/api/trains") {
  sendJson(request, response, 200, estimatedTrainsResponse);
  return;
}
```

- [ ] **Step 3: Add the smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, add:

```ts
test("renders estimated train markers only after the layer is enabled", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(0);

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /Estimated Trains/ }).click();
    await page.getByRole("button", { name: "Close more options" }).click();
  } else {
    await page.getByRole("button", { name: "Show estimated train markers" }).click();
  }

  await expect(page.locator(".estimated-train-marker-core")).toHaveCount(1);
  await expect(page.locator('[data-train-marker-line-id="line-1"]')).toBeVisible();
});
```

- [ ] **Step 4: Run the smoke test**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If the full smoke suite is too slow during development, run the Playwright grep command configured in `frontend/package.json` against the new test title, then run the full command before final verification.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/smoke/api-stub-data.mjs frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover estimated train marker layer"
```

---

### Task 9: Update Documentation And Agent Reality

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README current feature claims**

In `README.md`, add one current-capability bullet near the station arrivals or map feature bullets:

```markdown
- Opt-in estimated train markers can display schematic train blips on the TTC-style map when the live subway GTFS-RT arrival provider has a fresh mapped snapshot. These markers are inferred from trip updates, line topology, and segment travel-time estimates; they are not physical train positions.
```

In the limitations section, add:

```markdown
- Estimated train markers are schematic placements inferred from arrival predictions. They should not be treated as exact train locations or live train movement.
```

- [ ] **Step 2: Update AGENTS and GEMINI together**

In both `AGENTS.md` and `GEMINI.md`, update Current Reality with:

```markdown
- An opt-in estimated train marker layer is implemented for the schematic map. It uses fresh mapped TTC GTFS-RT Subway Trip Updates, existing rapid-transit topology, and segment travel-time estimates to place approximate blips between SVG station anchors. It is disabled by default and must be described as schematic/estimated, not as exact physical train positions.
```

Update guardrails in both files with:

```markdown
Do not claim on-map train blips are exact live train positions. They are schematic estimates inferred from fresh mapped GTFS-RT Subway Trip Updates and LineWatchTO topology, and the layer is empty when live snapshots are disabled, stale, unmapped, or unavailable.
```

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document estimated train marker limits"
```

---

### Task 10: Full Verification

**Files:**
- No new files.
- Run verification commands from the repository root.

- [ ] **Step 1: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Run smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 7: Manual live-mode check**

Run the local live backend with GTFS schedule import and live arrival provider configured:

```bash
scripts/dev-live-backend.sh
```

Run the frontend:

```bash
scripts/dev-live-frontend.sh
```

In the browser:

- Enable **Estimated Trains**.
- Confirm markers appear only when `/api/trains` returns `fresh: true`.
- Confirm the layer remains empty when the backend is in scheduled/demo arrival mode.
- Confirm station detail and disruption overlays remain readable with the layer enabled.
- Confirm mobile More can toggle the layer and mobile map text does not overlap.

- [ ] **Step 8: Final commit**

If verification required fixes after previous commits:

```bash
git add backend frontend README.md AGENTS.md GEMINI.md
git commit -m "fix: stabilize estimated train marker feature"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: The plan covers backend data derivation, endpoint exposure, frontend fetching, opt-in UI, map rendering, smoke coverage, and documentation.
- Placeholder scan: No task relies on unspecified implementation details.
- Type consistency: Backend uses `EstimatedTrainMarker` and `EstimatedTrainMarkerSnapshot`; frontend uses `EstimatedTrainMarker` and `EstimatedTrainSnapshot`; API field names match exactly.
- User-facing language: The plan consistently uses “estimated train markers” and “schematic placements,” not exact live train positions.
- Cache safety: `/api/trains` is independent from dashboard/map Redis cache, so marker polling is not trapped behind the 30-second dashboard cache.
