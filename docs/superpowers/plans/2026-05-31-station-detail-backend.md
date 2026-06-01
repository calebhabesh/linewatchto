# Station Detail Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build clickable station details backed by Spring endpoints and seeded PostgreSQL data, with responsive right-dock desktop and bottom-sheet mobile UI.

**Architecture:** Add a station domain to the Spring backend with Flyway-owned tables and seed data for stations, lines, access status, and station impacts. Add a frontend station data adapter that fetches backend station payloads when available and falls back to local demo fixtures, then render station hit targets on the existing SVG-backed map.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring Web, Spring Data JPA, Flyway, PostgreSQL/PostGIS container, Next.js App Router, React, TypeScript, Tailwind CSS, Node built-in test runner.

---

## Scope Check

This plan covers one feature slice: station detail inspection. It intentionally does not implement live TTC arrivals, live accessibility ingestion, full GTFS import, or full `/api/map` replacement.

Frontend responsiveness is included in this slice because the station panel changes desktop/mobile layout, pointer targets, and map control overlap. Animated slow-zone tracers, pulsing alert nodes, and shuttle tracers should come after this plan, using the station and impact contracts introduced here.

## File Structure

Backend files:

- Create `backend/src/main/resources/db/migration/V1__station_detail_seed.sql`: schema and seed data.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationController.java`: `/api/stations` endpoints.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`: station read-model assembly.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`: API response records.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationNotFoundException.java`: not-found signal.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/TransitLineEntity.java`: JPA line entity.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationEntity.java`: JPA station entity.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationLineEntity.java`: JPA station-line join entity.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationAccessStatusEntity.java`: JPA access status entity.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationImpactEntity.java`: JPA impact entity.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/TransitLineRepository.java`: line repository.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationRepository.java`: station repository.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationLineRepository.java`: station-line repository.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationAccessStatusRepository.java`: access repository.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationImpactRepository.java`: impact repository.
- Create `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`: controller unit tests.
- Create `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`: service unit tests.

Frontend files:

- Create `frontend/src/app/station-data.ts`: station API types, backend fetcher, and fallback fixtures.
- Create `frontend/src/components/StationDetailPanel.tsx`: responsive station detail dock/sheet.
- Modify `frontend/src/components/InteractiveTtcMap.tsx`: station marker overlay and selection events.
- Modify `frontend/src/components/LineWatchShell.tsx`: station state, loading/error state, panel wiring.
- Modify `frontend/src/app/globals.css`: station marker, selected pulse, panel animation, reduced-motion styles.
- Create `frontend/tests/station-data.test.mjs`: station adapter and fixture tests.
- Create `frontend/tests/station-panel-layout.test.mjs`: source-level responsive layout tests.
- Modify `frontend/tests/map-layering.test.mjs`: verify station hit targets exist above map overlays.
- Modify `README.md`: document station backend scope and demo arrival limitation.

## Task 1: Backend API Contract Tests

**Files:**

- Create: `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/station/StationNotFoundException.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/station/StationController.java`

- [ ] **Step 1: Write the failing controller test.**

```java
package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class StationControllerTest {

    @Test
    void stationsReturnsSummaries() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        StationResponses.StationListResponse response = controller.stations();

        assertThat(response.generatedAt()).isEqualTo("seeded-demo");
        assertThat(response.stations()).hasSize(1);
        assertThat(response.stations().getFirst().id()).isEqualTo("union");
        assertThat(response.stations().getFirst().hasActiveImpact()).isTrue();
    }

    @Test
    void stationReturnsDetailForKnownStation() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        ResponseEntity<StationResponses.StationDetailResponse> response = controller.station("union");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().id()).isEqualTo("union");
        assertThat(response.getBody().dataMode()).isEqualTo("seeded-demo");
        assertThat(response.getBody().disclaimer()).contains("Arrivals are demo placeholders");
    }

    @Test
    void stationReturnsNotFoundForUnknownStation() {
        StationService service = new StubStationService();
        StationController controller = new StationController(service);

        ResponseEntity<StationResponses.StationDetailResponse> response = controller.station("missing");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNull();
    }

    private static final class StubStationService extends StationService {
        StubStationService() {
            super(null, null, null, null, null);
        }

        @Override
        public StationResponses.StationListResponse stationSummaries() {
            return new StationResponses.StationListResponse(
                "seeded-demo",
                List.of(new StationResponses.StationSummaryResponse(
                    "union",
                    "Union",
                    4311,
                    3597,
                    true,
                    List.of("line-1"),
                    true,
                    "normal"
                ))
            );
        }

        @Override
        public StationResponses.StationDetailResponse stationDetail(String id) {
            if (!id.equals("union")) {
                throw new StationNotFoundException(id);
            }

            return new StationResponses.StationDetailResponse(
                "union",
                "Union",
                4311,
                3597,
                true,
                List.of(new StationResponses.StationLineResponse(
                    "line-1",
                    "1",
                    "Yonge-University",
                    "#f4c430",
                    "Northbound / Southbound"
                )),
                new StationResponses.StationAccessResponse(
                    "normal",
                    "No station access advisories in demo data.",
                    "Fixture seed"
                ),
                List.of(new StationResponses.StationImpactResponse(
                    "impact-union-weekend",
                    "planned-closure",
                    "planned",
                    "Weekend signal upgrades",
                    "Planned work affects Line 1 north of Eglinton. Union remains open.",
                    "Fixture seed",
                    "Planned TTC closure fixture"
                )),
                List.of(new StationResponses.StationArrivalResponse(
                    "line-1",
                    "Northbound",
                    2,
                    "Demo arrival"
                )),
                "seeded-demo",
                "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions."
            );
        }
    }
}
```

- [ ] **Step 2: Run the test and confirm it fails because station classes do not exist.**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationControllerTest
```

Expected: compilation failure mentioning missing `StationController`, `StationService`, or `StationResponses`.

- [ ] **Step 3: Add response records and exception.**

Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`:

```java
package com.calebhabesh.linewatch.station;

import java.util.List;

public final class StationResponses {
    private StationResponses() {
    }

    public record StationListResponse(
        String generatedAt,
        List<StationSummaryResponse> stations
    ) {
    }

    public record StationSummaryResponse(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        List<String> lineIds,
        boolean hasActiveImpact,
        String accessStatus
    ) {
    }

    public record StationDetailResponse(
        String id,
        String name,
        int mapX,
        int mapY,
        boolean interchange,
        List<StationLineResponse> lines,
        StationAccessResponse access,
        List<StationImpactResponse> impacts,
        List<StationArrivalResponse> arrivals,
        String dataMode,
        String disclaimer
    ) {
    }

    public record StationLineResponse(
        String id,
        String number,
        String name,
        String color,
        String platformLabel
    ) {
    }

    public record StationAccessResponse(
        String status,
        String summary,
        String updatedAgo
    ) {
    }

    public record StationImpactResponse(
        String id,
        String type,
        String severity,
        String title,
        String summary,
        String updatedAgo,
        String source
    ) {
    }

    public record StationArrivalResponse(
        String lineId,
        String direction,
        int minutes,
        String label
    ) {
    }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationNotFoundException.java`:

```java
package com.calebhabesh.linewatch.station;

public class StationNotFoundException extends RuntimeException {
    public StationNotFoundException(String stationId) {
        super("Unknown station: " + stationId);
    }
}
```

- [ ] **Step 4: Add controller shell.**

Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationController.java`:

```java
package com.calebhabesh.linewatch.station;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:3001"})
public class StationController {
    private final StationService stationService;

    public StationController(StationService stationService) {
        this.stationService = stationService;
    }

    @GetMapping
    public StationResponses.StationListResponse stations() {
        return stationService.stationSummaries();
    }

    @GetMapping("/{id}")
    public ResponseEntity<StationResponses.StationDetailResponse> station(@PathVariable String id) {
        try {
            return ResponseEntity.ok(stationService.stationDetail(id));
        } catch (StationNotFoundException exception) {
            return ResponseEntity.notFound().build();
        }
    }
}
```

- [ ] **Step 5: Run the test and confirm it now fails because `StationService` does not exist.**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationControllerTest
```

Expected: compilation failure mentioning missing `StationService`.

- [ ] **Step 6: Commit this contract checkpoint after Task 2 passes.**

Use this commit after Task 2 has added `StationService` and the controller test passes:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/station backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java
git commit -m "test: define station detail api contract"
```

## Task 2: Backend Service Tests and Minimal Service

**Files:**

- Create: `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`
- Create: entity and repository shells listed in the file structure section

- [ ] **Step 1: Write the failing service test.**

Create `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`:

```java
package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class StationServiceTest {
    @Mock
    private StationRepository stationRepository;
    @Mock
    private TransitLineRepository transitLineRepository;
    @Mock
    private StationLineRepository stationLineRepository;
    @Mock
    private StationAccessStatusRepository accessStatusRepository;
    @Mock
    private StationImpactRepository impactRepository;

    @InjectMocks
    private StationService stationService;

    @Test
    void stationSummariesIncludeLineIdsAccessStatusAndActiveImpactFlag() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10);
        StationLineEntity stationLine = new StationLineEntity(1L, "union", "line-1", "Northbound / Southbound", 1);
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "normal",
            "No station access advisories in demo data.",
            "Fixture seed"
        );
        StationImpactEntity impact = new StationImpactEntity(
            "impact-union-delay",
            "union",
            "active-alert",
            "delay",
            "Slow trains",
            "Trains are moving slowly through Union.",
            "Fixture seed",
            "TTC service alert fixture",
            1
        );

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of(union));
        when(stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()).thenReturn(List.of(stationLine));
        when(accessStatusRepository.findAll()).thenReturn(List.of(access));
        when(impactRepository.findAll()).thenReturn(List.of(impact));

        StationResponses.StationListResponse response = stationService.stationSummaries();

        assertThat(response.generatedAt()).isEqualTo("seeded-demo");
        assertThat(response.stations()).hasSize(1);
        StationResponses.StationSummaryResponse summary = response.stations().getFirst();
        assertThat(summary.id()).isEqualTo("union");
        assertThat(summary.lineIds()).containsExactly("line-1");
        assertThat(summary.accessStatus()).isEqualTo("normal");
        assertThat(summary.hasActiveImpact()).isTrue();
    }

    @Test
    void stationDetailIncludesLinesAccessImpactsArrivalsAndDisclaimer() {
        StationEntity union = new StationEntity("union", "Union", 4311, 3597, true, 10);
        TransitLineEntity line = new TransitLineEntity("line-1", "1", "Yonge-University", "#f4c430", 1);
        StationLineEntity stationLine = new StationLineEntity(1L, "union", "line-1", "Northbound / Southbound", 1);
        StationAccessStatusEntity access = new StationAccessStatusEntity(
            "union",
            "normal",
            "No station access advisories in demo data.",
            "Fixture seed"
        );
        StationImpactEntity impact = new StationImpactEntity(
            "impact-union-weekend",
            "union",
            "planned-closure",
            "planned",
            "Weekend signal upgrades",
            "Planned work affects Line 1 north of Eglinton. Union remains open.",
            "Fixture seed",
            "Planned TTC closure fixture",
            1
        );

        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(stationLineRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(stationLine));
        when(transitLineRepository.findAllById(List.of("line-1"))).thenReturn(List.of(line));
        when(accessStatusRepository.findById("union")).thenReturn(Optional.of(access));
        when(impactRepository.findByStationIdOrderBySortOrderAsc("union")).thenReturn(List.of(impact));

        StationResponses.StationDetailResponse response = stationService.stationDetail("union");

        assertThat(response.id()).isEqualTo("union");
        assertThat(response.lines()).extracting(StationResponses.StationLineResponse::id).containsExactly("line-1");
        assertThat(response.access().status()).isEqualTo("normal");
        assertThat(response.impacts()).extracting(StationResponses.StationImpactResponse::id).containsExactly("impact-union-weekend");
        assertThat(response.arrivals()).isNotEmpty();
        assertThat(response.arrivals().getFirst().label()).isEqualTo("Demo arrival");
        assertThat(response.disclaimer()).contains("not live TTC predictions");
    }

    @Test
    void stationDetailThrowsForUnknownStation() {
        when(stationRepository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> stationService.stationDetail("missing"))
            .isInstanceOf(StationNotFoundException.class)
            .hasMessageContaining("missing");
    }
}
```

- [ ] **Step 2: Run the test and verify it fails because repositories and entities do not exist.**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationServiceTest
```

Expected: compilation failure mentioning `StationEntity`, `StationRepository`, or related station classes.

- [ ] **Step 3: Add JPA entities and repositories with constructor support for tests.**

Each entity should include a protected no-arg constructor for JPA and a public constructor matching the tests above.

Create these repository interfaces in `backend/src/main/java/com/calebhabesh/linewatch/station/`:

```java
package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationRepository extends JpaRepository<StationEntity, String> {
    List<StationEntity> findAllByOrderBySortOrderAscNameAsc();
}
```

```java
package com.calebhabesh.linewatch.station;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TransitLineRepository extends JpaRepository<TransitLineEntity, String> {
}
```

```java
package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationLineRepository extends JpaRepository<StationLineEntity, Long> {
    List<StationLineEntity> findAllByOrderByStationIdAscSortOrderAsc();
    List<StationLineEntity> findByStationIdOrderBySortOrderAsc(String stationId);
}
```

```java
package com.calebhabesh.linewatch.station;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationAccessStatusRepository extends JpaRepository<StationAccessStatusEntity, String> {
}
```

```java
package com.calebhabesh.linewatch.station;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StationImpactRepository extends JpaRepository<StationImpactEntity, String> {
    List<StationImpactEntity> findByStationIdOrderBySortOrderAsc(String stationId);
}
```

Entity field mappings:

- `TransitLineEntity`: `id`, `number`, `name`, `color`, `sortOrder`.
- `StationEntity`: `id`, `name`, `mapX`, `mapY`, `interchange`, `sortOrder`.
- `StationLineEntity`: `id`, `stationId`, `lineId`, `platformLabel`, `sortOrder`.
- `StationAccessStatusEntity`: `stationId`, `status`, `summary`, `updatedAgo`.
- `StationImpactEntity`: `id`, `stationId`, `type`, `severity`, `title`, `summary`, `updatedAgo`, `source`, `sortOrder`.

Use `@Table` names `transit_lines`, `stations`, `station_lines`, `station_access_statuses`, and `station_impacts`. Use `@Column(name = "sort_order")`, `@Column(name = "map_x")`, `@Column(name = "map_y")`, `@Column(name = "station_id")`, `@Column(name = "line_id")`, `@Column(name = "platform_label")`, and `@Column(name = "updated_ago")` where Java names differ from SQL names.

- [ ] **Step 4: Add the service implementation.**

Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`:

```java
package com.calebhabesh.linewatch.station;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

@Service
public class StationService {
    private static final String DATA_MODE = "seeded-demo";
    private static final String DISCLAIMER =
        "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions.";

    private final StationRepository stationRepository;
    private final TransitLineRepository transitLineRepository;
    private final StationLineRepository stationLineRepository;
    private final StationAccessStatusRepository accessStatusRepository;
    private final StationImpactRepository impactRepository;

    public StationService(
        StationRepository stationRepository,
        TransitLineRepository transitLineRepository,
        StationLineRepository stationLineRepository,
        StationAccessStatusRepository accessStatusRepository,
        StationImpactRepository impactRepository
    ) {
        this.stationRepository = stationRepository;
        this.transitLineRepository = transitLineRepository;
        this.stationLineRepository = stationLineRepository;
        this.accessStatusRepository = accessStatusRepository;
        this.impactRepository = impactRepository;
    }

    public StationResponses.StationListResponse stationSummaries() {
        List<StationEntity> stations = stationRepository.findAllByOrderBySortOrderAscNameAsc();
        Map<String, List<String>> lineIdsByStation = stationLineRepository.findAllByOrderByStationIdAscSortOrderAsc()
            .stream()
            .collect(Collectors.groupingBy(
                StationLineEntity::getStationId,
                Collectors.mapping(StationLineEntity::getLineId, Collectors.toList())
            ));
        Map<String, String> accessByStation = accessStatusRepository.findAll()
            .stream()
            .collect(Collectors.toMap(StationAccessStatusEntity::getStationId, StationAccessStatusEntity::getStatus));
        Map<String, Boolean> activeImpactByStation = impactRepository.findAll()
            .stream()
            .collect(Collectors.toMap(
                StationImpactEntity::getStationId,
                impact -> impact.getType().equals("active-alert"),
                Boolean::logicalOr
            ));

        List<StationResponses.StationSummaryResponse> summaries = stations.stream()
            .map(station -> new StationResponses.StationSummaryResponse(
                station.getId(),
                station.getName(),
                station.getMapX(),
                station.getMapY(),
                station.isInterchange(),
                lineIdsByStation.getOrDefault(station.getId(), List.of()),
                activeImpactByStation.getOrDefault(station.getId(), false),
                accessByStation.getOrDefault(station.getId(), "normal")
            ))
            .toList();

        return new StationResponses.StationListResponse(DATA_MODE, summaries);
    }

    public StationResponses.StationDetailResponse stationDetail(String id) {
        StationEntity station = stationRepository.findById(id)
            .orElseThrow(() -> new StationNotFoundException(id));

        List<StationLineEntity> stationLines = stationLineRepository.findByStationIdOrderBySortOrderAsc(id);
        List<String> lineIds = stationLines.stream().map(StationLineEntity::getLineId).toList();
        Map<String, TransitLineEntity> linesById = transitLineRepository.findAllById(lineIds)
            .stream()
            .collect(Collectors.toMap(TransitLineEntity::getId, Function.identity()));

        List<StationResponses.StationLineResponse> lines = stationLines.stream()
            .map(stationLine -> toLineResponse(stationLine, linesById.get(stationLine.getLineId())))
            .sorted(Comparator.comparing(StationResponses.StationLineResponse::id))
            .toList();

        StationResponses.StationAccessResponse access = accessStatusRepository.findById(id)
            .map(this::toAccessResponse)
            .orElse(new StationResponses.StationAccessResponse(
                "normal",
                "No station access advisories in demo data.",
                "Fixture seed"
            ));

        List<StationResponses.StationImpactResponse> impacts = impactRepository.findByStationIdOrderBySortOrderAsc(id)
            .stream()
            .map(this::toImpactResponse)
            .toList();

        List<StationResponses.StationArrivalResponse> arrivals = lines.stream()
            .flatMap(line -> List.of(
                new StationResponses.StationArrivalResponse(line.id(), "Northbound / Eastbound", 2, "Demo arrival"),
                new StationResponses.StationArrivalResponse(line.id(), "Southbound / Westbound", 5, "Demo arrival")
            ).stream())
            .toList();

        return new StationResponses.StationDetailResponse(
            station.getId(),
            station.getName(),
            station.getMapX(),
            station.getMapY(),
            station.isInterchange(),
            lines,
            access,
            impacts,
            arrivals,
            DATA_MODE,
            DISCLAIMER
        );
    }

    private StationResponses.StationLineResponse toLineResponse(
        StationLineEntity stationLine,
        TransitLineEntity line
    ) {
        if (line == null) {
            throw new IllegalStateException("Station line references unknown transit line: " + stationLine.getLineId());
        }

        return new StationResponses.StationLineResponse(
            line.getId(),
            line.getNumber(),
            line.getName(),
            line.getColor(),
            stationLine.getPlatformLabel()
        );
    }

    private StationResponses.StationAccessResponse toAccessResponse(StationAccessStatusEntity access) {
        return new StationResponses.StationAccessResponse(
            access.getStatus(),
            access.getSummary(),
            access.getUpdatedAgo()
        );
    }

    private StationResponses.StationImpactResponse toImpactResponse(StationImpactEntity impact) {
        return new StationResponses.StationImpactResponse(
            impact.getId(),
            impact.getType(),
            impact.getSeverity(),
            impact.getTitle(),
            impact.getSummary(),
            impact.getUpdatedAgo(),
            impact.getSource()
        );
    }
}
```

- [ ] **Step 5: Run backend station tests.**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationControllerTest,StationServiceTest
```

Expected: both tests pass.

- [ ] **Step 6: Commit service checkpoint.**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/station backend/src/test/java/com/calebhabesh/linewatch/station
git commit -m "feat: add station detail read model"
```

## Task 3: Flyway Schema and Seed Data

**Files:**

- Create: `backend/src/main/resources/db/migration/V1__station_detail_seed.sql`

- [ ] **Step 1: Add schema and seed migration.**

Create `backend/src/main/resources/db/migration/V1__station_detail_seed.sql` with these table definitions and seed values. Keep `science-centre` out of the first clickable seed because the edited SVG currently does not expose a `station-science-centre` id.

```sql
create table transit_lines (
    id varchar(32) primary key,
    number varchar(8) not null,
    name varchar(120) not null,
    color varchar(16) not null,
    sort_order integer not null
);

create table stations (
    id varchar(80) primary key,
    name varchar(160) not null,
    map_x integer not null,
    map_y integer not null,
    interchange boolean not null default false,
    sort_order integer not null
);

create table station_lines (
    id bigserial primary key,
    station_id varchar(80) not null references stations(id),
    line_id varchar(32) not null references transit_lines(id),
    platform_label varchar(160) not null,
    sort_order integer not null,
    unique (station_id, line_id)
);

create table station_access_statuses (
    station_id varchar(80) primary key references stations(id),
    status varchar(24) not null,
    summary varchar(280) not null,
    updated_ago varchar(80) not null,
    check (status in ('normal', 'advisory', 'outage'))
);

create table station_impacts (
    id varchar(120) primary key,
    station_id varchar(80) not null references stations(id),
    type varchar(32) not null,
    severity varchar(32) not null,
    title varchar(160) not null,
    summary varchar(360) not null,
    updated_ago varchar(80) not null,
    source varchar(120) not null,
    sort_order integer not null,
    check (type in ('active-alert', 'planned-closure')),
    check (severity in ('delay', 'suspension', 'planned'))
);

insert into transit_lines (id, number, name, color, sort_order) values
('line-1', '1', 'Yonge-University', '#f4c430', 1),
('line-2', '2', 'Bloor-Danforth', '#14a44d', 2),
('line-4', '4', 'Sheppard', '#b84ed8', 4),
('line-5', '5', 'Eglinton Crosstown', '#f57c00', 5),
('line-6', '6', 'Finch West', '#969594', 6);

insert into stations (id, name, map_x, map_y, interchange, sort_order) values
('vaughan-metropolitan-centre', 'Vaughan Metropolitan Centre', 1874, 284, false, 10),
('spadina', 'Spadina', 3740, 2564, true, 20),
('st-george', 'St George', 4078, 2602, true, 30),
('union', 'Union', 4311, 3597, true, 40),
('king', 'King', 4547, 3362, false, 45),
('bloor-yonge', 'Bloor-Yonge', 4546, 2602, true, 50),
('eglinton', 'Eglinton', 4547, 1808, true, 60),
('york-mills', 'York Mills', 4547, 1246, false, 70),
('sheppard-yonge', 'Sheppard-Yonge', 4546, 1086, true, 80),
('north-york-centre', 'North York Centre', 4547, 926, false, 90),
('finch', 'Finch', 4546, 760, false, 100),
('kipling', 'Kipling', 1076, 2601, false, 110),
('sherbourne', 'Sherbourne', 4862, 2603, false, 120),
('castle-frank', 'Castle Frank', 5115, 2603, false, 130),
('kennedy', 'Kennedy', 7346, 1808, true, 140),
('don-mills', 'Don Mills', 5928, 1084, false, 150),
('mount-dennis', 'Mount Dennis', 1977, 1804, false, 160),
('humber-college', 'Humber College', 287, 1157, false, 170),
('finch-west', 'Finch West', 2510, 840, true, 180);

insert into station_lines (station_id, line_id, platform_label, sort_order) values
('vaughan-metropolitan-centre', 'line-1', 'Southbound', 1),
('spadina', 'line-1', 'Northbound / Southbound', 1),
('spadina', 'line-2', 'Eastbound / Westbound', 2),
('st-george', 'line-1', 'Northbound / Southbound', 1),
('st-george', 'line-2', 'Eastbound / Westbound', 2),
('union', 'line-1', 'Northbound / Southbound', 1),
('king', 'line-1', 'Northbound / Southbound', 1),
('bloor-yonge', 'line-1', 'Northbound / Southbound', 1),
('bloor-yonge', 'line-2', 'Eastbound / Westbound', 2),
('eglinton', 'line-1', 'Northbound / Southbound', 1),
('eglinton', 'line-5', 'Eastbound / Westbound', 2),
('york-mills', 'line-1', 'Northbound / Southbound', 1),
('sheppard-yonge', 'line-1', 'Northbound / Southbound', 1),
('sheppard-yonge', 'line-4', 'Eastbound / Westbound', 2),
('north-york-centre', 'line-1', 'Northbound / Southbound', 1),
('finch', 'line-1', 'Southbound', 1),
('kipling', 'line-2', 'Eastbound', 1),
('sherbourne', 'line-2', 'Eastbound / Westbound', 1),
('castle-frank', 'line-2', 'Eastbound / Westbound', 1),
('kennedy', 'line-2', 'Eastbound / Westbound', 1),
('kennedy', 'line-5', 'Eastbound / Westbound', 2),
('don-mills', 'line-4', 'Eastbound / Westbound', 1),
('mount-dennis', 'line-5', 'Eastbound / Westbound', 1),
('humber-college', 'line-6', 'Eastbound / Westbound', 1),
('finch-west', 'line-6', 'Eastbound / Westbound', 1);

insert into station_access_statuses (station_id, status, summary, updated_ago)
select id, 'normal', 'No station access advisories in seeded demo data.', 'Fixture seed'
from stations;

update station_access_statuses
set status = 'advisory',
    summary = 'One elevator advisory is included as seeded demo data.',
    updated_ago = 'Fixture seed'
where station_id = 'st-george';

insert into station_impacts (id, station_id, type, severity, title, summary, updated_ago, source, sort_order) values
('impact-finch-suspension', 'finch', 'active-alert', 'suspension', 'Signal problem', 'No subway service southbound toward Eglinton in seeded demo data.', 'Updated 4 min ago', 'TTC service alert fixture', 1),
('impact-york-mills-suspension', 'york-mills', 'active-alert', 'suspension', 'Signal problem', 'Line 1 service is suspended through York Mills in seeded demo data.', 'Updated 4 min ago', 'TTC service alert fixture', 1),
('impact-eglinton-suspension', 'eglinton', 'active-alert', 'suspension', 'Signal problem', 'Line 1 service is suspended north of Eglinton in seeded demo data.', 'Updated 4 min ago', 'TTC service alert fixture', 1),
('impact-sherbourne-delay', 'sherbourne', 'active-alert', 'delay', 'Track issues', 'Eastbound trains are moving slower than usual in seeded demo data.', 'Updated 8 min ago', 'TTC service alert fixture', 1),
('impact-castle-frank-delay', 'castle-frank', 'active-alert', 'delay', 'Track issues', 'Eastbound trains are moving slower than usual in seeded demo data.', 'Updated 8 min ago', 'TTC service alert fixture', 1),
('impact-union-weekend', 'union', 'planned-closure', 'planned', 'Weekend signal upgrades', 'Planned work affects Line 1 north of Eglinton. Union remains open.', 'Fixture seed', 'Planned TTC closure fixture', 1),
('impact-kipling-weekend', 'kipling', 'planned-closure', 'planned', 'Planned track work', 'Late-week track work affects west-end Line 2 service in seeded demo data.', 'Fixture seed', 'Planned TTC closure fixture', 1);
```

- [ ] **Step 2: Run backend tests.**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [ ] **Step 3: Validate migration against local PostgreSQL.**

Run:

```bash
docker compose up -d postgres redis
mvn -f backend/pom.xml spring-boot:run
```

Expected: Spring Boot starts without Flyway or JPA validation errors. Stop it with `Ctrl+C` after startup succeeds.

- [ ] **Step 4: Verify station endpoint manually.**

Run while backend is running:

```bash
curl http://localhost:8080/api/stations/union
```

Expected: JSON includes `"id":"union"`, `"dataMode":"seeded-demo"`, and a disclaimer containing `Arrivals are demo placeholders`.

- [ ] **Step 5: Commit migration checkpoint.**

```bash
git add backend/src/main/resources/db/migration/V1__station_detail_seed.sql
git commit -m "feat: seed station detail data"
```

## Task 4: Frontend Station Data Adapter

**Files:**

- Create: `frontend/src/app/station-data.ts`
- Create: `frontend/tests/station-data.test.mjs`

- [ ] **Step 1: Write failing station data tests.**

Create `frontend/tests/station-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackStationDetails,
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
} from "../src/app/station-data.ts";

describe("station data adapter", () => {
  it("uses backend station summaries when fetch succeeds", async () => {
    const response = await getStationSummaries({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            generatedAt: "seeded-demo",
            stations: [
              {
                id: "union",
                name: "Union",
                mapX: 4311,
                mapY: 3597,
                interchange: true,
                lineIds: ["line-1"],
                hasActiveImpact: true,
                accessStatus: "normal",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.stations[0].id, "union");
  });

  it("falls back to local station detail when backend fetch fails", async () => {
    const response = await getStationDetail("union", {
      fetcher: async () => {
        throw new Error("backend offline");
      },
    });

    assert.equal(response.source, "fallback");
    assert.equal(response.data.id, "union");
    assert.match(response.data.disclaimer, /demo placeholders/);
  });

  it("does not preserve the old misspelled eglinton id", () => {
    const ids = [
      ...fallbackStationSummaries.stations.map((station) => station.id),
      ...Object.keys(fallbackStationDetails),
    ];

    assert.ok(ids.includes("eglinton"));
    assert.ok(!ids.includes("eglington"));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run:

```bash
node --test frontend/tests/station-data.test.mjs
```

Expected: failure because `frontend/src/app/station-data.ts` does not exist.

- [ ] **Step 3: Add station data adapter.**

Create `frontend/src/app/station-data.ts` with:

```ts
export type StationAccessStatus = "normal" | "advisory" | "outage";
export type StationImpactType = "active-alert" | "planned-closure";
export type StationImpactSeverity = "delay" | "suspension" | "planned";

export type StationSummary = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lineIds: string[];
  hasActiveImpact: boolean;
  accessStatus: StationAccessStatus;
};

export type StationListResponse = {
  generatedAt: string;
  stations: StationSummary[];
};

export type StationLine = {
  id: string;
  number: string;
  name: string;
  color: string;
  platformLabel: string;
};

export type StationAccess = {
  status: StationAccessStatus;
  summary: string;
  updatedAgo: string;
};

export type StationImpact = {
  id: string;
  type: StationImpactType;
  severity: StationImpactSeverity;
  title: string;
  summary: string;
  updatedAgo: string;
  source: string;
};

export type StationArrival = {
  lineId: string;
  direction: string;
  minutes: number;
  label: string;
};

export type StationDetail = {
  id: string;
  name: string;
  mapX: number;
  mapY: number;
  interchange: boolean;
  lines: StationLine[];
  access: StationAccess;
  impacts: StationImpact[];
  arrivals: StationArrival[];
  dataMode: "seeded-demo";
  disclaimer: string;
};

export type StationDataResult<T> = {
  source: "backend" | "fallback";
  data: T;
};

export type StationFetchOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ?? "http://localhost:8080";

export const fallbackStationSummaries: StationListResponse = {
  generatedAt: "fallback-demo",
  stations: [
    {
      id: "union",
      name: "Union",
      mapX: 4311,
      mapY: 3597,
      interchange: true,
      lineIds: ["line-1"],
      hasActiveImpact: true,
      accessStatus: "normal",
    },
    {
      id: "st-george",
      name: "St George",
      mapX: 4078,
      mapY: 2602,
      interchange: true,
      lineIds: ["line-1", "line-2"],
      hasActiveImpact: false,
      accessStatus: "advisory",
    },
    {
      id: "eglinton",
      name: "Eglinton",
      mapX: 4547,
      mapY: 1808,
      interchange: true,
      lineIds: ["line-1", "line-5"],
      hasActiveImpact: true,
      accessStatus: "normal",
    },
    {
      id: "sherbourne",
      name: "Sherbourne",
      mapX: 4862,
      mapY: 2603,
      interchange: false,
      lineIds: ["line-2"],
      hasActiveImpact: true,
      accessStatus: "normal",
    },
  ],
};

export const fallbackStationDetails: Record<string, StationDetail> = {
  union: {
    id: "union",
    name: "Union",
    mapX: 4311,
    mapY: 3597,
    interchange: true,
    lines: [
      {
        id: "line-1",
        number: "1",
        name: "Yonge-University",
        color: "#f4c430",
        platformLabel: "Northbound / Southbound",
      },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [
      {
        id: "impact-union-weekend",
        type: "planned-closure",
        severity: "planned",
        title: "Weekend signal upgrades",
        summary: "Planned work affects Line 1 north of Eglinton. Union remains open.",
        updatedAgo: "Fallback fixture",
        source: "Planned TTC closure fixture",
      },
    ],
    arrivals: [
      { lineId: "line-1", direction: "Northbound", minutes: 2, label: "Demo arrival" },
      { lineId: "line-1", direction: "Southbound", minutes: 5, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  "st-george": {
    id: "st-george",
    name: "St George",
    mapX: 4078,
    mapY: 2602,
    interchange: true,
    lines: [
      { id: "line-1", number: "1", name: "Yonge-University", color: "#f4c430", platformLabel: "Northbound / Southbound" },
      { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#14a44d", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "advisory",
      summary: "One elevator advisory is included as fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [],
    arrivals: [
      { lineId: "line-1", direction: "Northbound", minutes: 3, label: "Demo arrival" },
      { lineId: "line-2", direction: "Eastbound", minutes: 4, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  eglinton: {
    id: "eglinton",
    name: "Eglinton",
    mapX: 4547,
    mapY: 1808,
    interchange: true,
    lines: [
      { id: "line-1", number: "1", name: "Yonge-University", color: "#f4c430", platformLabel: "Northbound / Southbound" },
      { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#f57c00", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [
      {
        id: "impact-eglinton-suspension",
        type: "active-alert",
        severity: "suspension",
        title: "Signal problem",
        summary: "Line 1 service is suspended north of Eglinton in fallback demo data.",
        updatedAgo: "Updated 4 min ago",
        source: "TTC service alert fixture",
      },
    ],
    arrivals: [
      { lineId: "line-1", direction: "Southbound", minutes: 6, label: "Demo arrival" },
      { lineId: "line-5", direction: "Eastbound", minutes: 8, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
  sherbourne: {
    id: "sherbourne",
    name: "Sherbourne",
    mapX: 4862,
    mapY: 2603,
    interchange: false,
    lines: [
      { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#14a44d", platformLabel: "Eastbound / Westbound" },
    ],
    access: {
      status: "normal",
      summary: "No station access advisories in fallback demo data.",
      updatedAgo: "Fallback fixture",
    },
    impacts: [
      {
        id: "impact-sherbourne-delay",
        type: "active-alert",
        severity: "delay",
        title: "Track issues",
        summary: "Eastbound trains are moving slower than usual in fallback demo data.",
        updatedAgo: "Updated 8 min ago",
        source: "TTC service alert fixture",
      },
    ],
    arrivals: [
      { lineId: "line-2", direction: "Eastbound", minutes: 4, label: "Demo arrival" },
      { lineId: "line-2", direction: "Westbound", minutes: 7, label: "Demo arrival" },
    ],
    dataMode: "seeded-demo",
    disclaimer: "Station details use fallback demo data. Arrivals are demo placeholders, not live TTC predictions.",
  },
};

export async function getStationSummaries(
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationListResponse>> {
  const fetcher = options.fetcher ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  try {
    const response = await fetcher(`${apiBaseUrl}/api/stations`);
    if (!response.ok) {
      throw new Error(`Station summaries request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationListResponse };
  } catch {
    return { source: "fallback", data: fallbackStationSummaries };
  }
}

export async function getStationDetail(
  id: string,
  options: StationFetchOptions = {}
): Promise<StationDataResult<StationDetail | null>> {
  const fetcher = options.fetcher ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;

  try {
    const response = await fetcher(`${apiBaseUrl}/api/stations/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return { source: "backend", data: null };
    }
    if (!response.ok) {
      throw new Error(`Station detail request failed with ${response.status}`);
    }

    return { source: "backend", data: (await response.json()) as StationDetail };
  } catch {
    return { source: "fallback", data: fallbackStationDetails[id] ?? null };
  }
}
```

- [ ] **Step 4: Run station data tests.**

Run:

```bash
node --test frontend/tests/station-data.test.mjs
```

Expected: station data tests pass.

- [ ] **Step 5: Commit adapter checkpoint.**

```bash
git add frontend/src/app/station-data.ts frontend/tests/station-data.test.mjs
git commit -m "feat: add station data adapter"
```

## Task 5: Station Detail Panel

**Files:**

- Create: `frontend/src/components/StationDetailPanel.tsx`
- Create: `frontend/tests/station-panel-layout.test.mjs`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing responsive layout source test.**

Create `frontend/tests/station-panel-layout.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("station detail panel layout", () => {
  it("uses a right dock on desktop and a bottom sheet on mobile", () => {
    assert.match(panelSource, /station-detail-panel/);
    assert.match(panelSource, /md:right-6/);
    assert.match(panelSource, /md:top-\[104px\]/);
    assert.match(panelSource, /bottom-0/);
    assert.match(panelSource, /rounded-t-lg/);
  });

  it("labels demo arrivals and backend fallback state", () => {
    assert.match(panelSource, /Demo arrival/);
    assert.match(panelSource, /source === "fallback"/);
    assert.match(panelSource, /not live TTC predictions/);
  });

  it("defines station marker and reduced motion styles", () => {
    assert.match(globalCss, /\.station-hit-target/);
    assert.match(globalCss, /\.station-hit-target\.selected/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
  });
});
```

- [ ] **Step 2: Run the layout test and verify it fails.**

Run:

```bash
node --test frontend/tests/station-panel-layout.test.mjs
```

Expected: failure because `StationDetailPanel.tsx` and station marker CSS do not exist.

- [ ] **Step 3: Create station detail panel component.**

Create `frontend/src/components/StationDetailPanel.tsx`:

```tsx
"use client";

import { AlertTriangle, Accessibility, Clock3, X } from "lucide-react";
import type { StationDataResult, StationDetail } from "../app/station-data";

type Props = {
  stationResult: StationDataResult<StationDetail | null> | null;
  loading: boolean;
  selectedStationName?: string;
  onClose: () => void;
};

export function StationDetailPanel({ stationResult, loading, selectedStationName, onClose }: Props) {
  const station = stationResult?.data ?? null;
  const source = stationResult?.source;

  return (
    <aside
      className="station-detail-panel fixed left-0 right-0 bottom-0 z-30 max-h-[64vh] overflow-y-auto rounded-t-lg border border-black/10 bg-white p-4 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#0a0c10] dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-6 md:w-[min(calc(100vw-48px),390px)] md:max-h-none md:rounded-lg"
      aria-live="polite"
      aria-label={station ? `${station.name} station details` : "Station details"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Station
          </span>
          <h2 className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">
            {station?.name ?? selectedStationName ?? "Station details"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          aria-label="Close station details"
        >
          <X size={20} />
        </button>
      </div>

      {loading && (
        <div className="mt-4 rounded-lg border border-black/10 bg-slate-100 p-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Loading station details...
        </div>
      )}

      {!loading && !station && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Station detail is unavailable for this stop.
        </div>
      )}

      {!loading && station && (
        <div className="mt-4 flex flex-col gap-4">
          {source === "fallback" && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Backend unavailable. Showing local fallback station data.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {station.lines.map((line) => (
              <span
                key={line.id}
                className="inline-flex min-h-8 items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-xs font-black dark:border-white/10"
                style={{ backgroundColor: line.color, color: line.id === "line-1" ? "#000000" : "#ffffff" }}
                title={line.platformLabel}
              >
                {line.number}
                <span>{line.name}</span>
              </span>
            ))}
          </div>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <Accessibility size={16} />
              Access
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{station.access.summary}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {station.access.updatedAgo}
            </p>
          </section>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <AlertTriangle size={16} />
              Station impacts
            </h3>
            {station.impacts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No seeded impacts for this station.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {station.impacts.map((impact) => (
                  <div key={impact.id} className="rounded-md border border-black/10 bg-white p-2 text-sm dark:border-white/10 dark:bg-[#12151c]">
                    <strong className="block text-slate-900 dark:text-white">{impact.title}</strong>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{impact.summary}</p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {impact.source} / {impact.updatedAgo}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-black/10 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <h3 className="flex items-center gap-2 text-sm font-black">
              <Clock3 size={16} />
              Demo arrivals
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {station.arrivals.map((arrival, index) => (
                <div key={`${arrival.lineId}-${arrival.direction}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-white p-2 text-sm dark:bg-[#12151c]">
                  <span className="min-w-0 break-words">{arrival.direction}</span>
                  <strong className="shrink-0">{arrival.minutes} min</strong>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{station.disclaimer}</p>
          </section>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Add station marker CSS.**

Append to `frontend/src/app/globals.css`:

```css
.station-hit-target {
  cursor: pointer;
  fill: rgba(59, 130, 246, 0.01);
  outline: none;
  pointer-events: auto;
  stroke: rgba(255, 255, 255, 0.72);
  stroke-width: 10;
}

.station-hit-target:hover,
.station-hit-target:focus-visible {
  fill: rgba(59, 130, 246, 0.18);
  stroke: rgba(59, 130, 246, 0.95);
}

.station-hit-target.has-impact {
  stroke: rgba(245, 158, 11, 0.9);
}

.station-hit-target.access-advisory,
.station-hit-target.access-outage {
  stroke: rgba(239, 68, 68, 0.9);
}

.station-hit-target.selected {
  animation: station-selected-pulse 1.8s ease-in-out infinite;
  fill: rgba(59, 130, 246, 0.28);
  stroke: rgba(96, 165, 250, 1);
}

@keyframes station-selected-pulse {
  0%,
  100% {
    stroke-opacity: 0.65;
    stroke-width: 10;
  }

  50% {
    stroke-opacity: 1;
    stroke-width: 22;
  }
}

@media (prefers-reduced-motion: reduce) {
  .station-hit-target.selected {
    animation: none;
  }
}
```

- [ ] **Step 5: Run panel layout test.**

Run:

```bash
node --test frontend/tests/station-panel-layout.test.mjs
```

Expected: station panel layout test passes.

- [ ] **Step 6: Commit panel checkpoint.**

```bash
git add frontend/src/components/StationDetailPanel.tsx frontend/src/app/globals.css frontend/tests/station-panel-layout.test.mjs
git commit -m "feat: add responsive station detail panel"
```

## Task 6: Map Station Hit Targets and Shell Wiring

**Files:**

- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Update map layering test before code changes.**

Modify `frontend/tests/map-layering.test.mjs` to add:

```js
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");

it("renders station hit targets above disruption overlays", () => {
  assert.match(interactiveMapSource, /aria-label="Station hit targets"/);
  assert.match(interactiveMapSource, /station-hit-target/);
  assert.match(interactiveMapSource, /onSelectStationId/);
});
```

- [ ] **Step 2: Run map layering test and verify it fails.**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: failure because station hit targets do not exist.

- [ ] **Step 3: Modify `InteractiveTtcMap` props and station overlay.**

Add imports:

```ts
import type { StationSummary } from "../app/station-data";
```

Add props:

```ts
stations,
selectedStationId,
onSelectStationId,
```

with types:

```ts
stations: StationSummary[];
selectedStationId: string | null;
onSelectStationId: (id: string | null) => void;
```

Render a top SVG group after disruption overlays:

```tsx
<g aria-label="Station hit targets">
  {stations.map((station) => {
    const selected = selectedStationId === station.id;
    const radius = station.interchange ? 96 : 76;

    return (
      <circle
        key={station.id}
        aria-label={`${station.name} station details`}
        className={`station-hit-target ${selected ? "selected" : ""} ${
          station.hasActiveImpact ? "has-impact" : ""
        } access-${station.accessStatus}`}
        cx={station.mapX}
        cy={station.mapY}
        r={radius}
        onClick={(event) => {
          event.stopPropagation();
          onSelectStationId(selected ? null : station.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectStationId(selected ? null : station.id);
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        role="button"
        tabIndex={0}
      />
    );
  })}
</g>
```

- [ ] **Step 4: Modify `LineWatchShell` state and station loading.**

Add imports:

```ts
import { useState, useEffect } from "react";
import {
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
  type StationDataResult,
  type StationDetail,
  type StationSummary,
} from "../app/station-data";
import { StationDetailPanel } from "./StationDetailPanel";
```

Add state:

```ts
const [stationSummaries, setStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
const [stationResult, setStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
const [stationLoading, setStationLoading] = useState(false);
```

Load summaries:

```ts
useEffect(() => {
  let cancelled = false;

  getStationSummaries().then((result) => {
    if (!cancelled) {
      setStationSummaries(result.data.stations);
    }
  });

  return () => {
    cancelled = true;
  };
}, []);
```

Load selected detail:

```ts
useEffect(() => {
  let cancelled = false;

  if (!selectedStationId) {
    setStationResult(null);
    setStationLoading(false);
    return () => {
      cancelled = true;
    };
  }

  setStationLoading(true);
  getStationDetail(selectedStationId).then((result) => {
    if (!cancelled) {
      setStationResult(result);
      setStationLoading(false);
    }
  });

  return () => {
    cancelled = true;
  };
}, [selectedStationId]);
```

When selecting alerts or closures from menus, clear `selectedStationId` only when the view switches to a panel that occupies the left-side focus. Keep station selection when toggling theme or zoom.

Pass station props to `InteractiveTtcMap`:

```tsx
<InteractiveTtcMap
  selectedAlertId={selectedAlertId}
  selectedClosureId={selectedClosureId}
  selectedStationId={selectedStationId}
  stations={stationSummaries}
  onSelectAlertId={setSelectedAlertId}
  onSelectClosureId={setSelectedClosureId}
  onSelectStationId={(id) => {
    setSelectedStationId(id);
    setSelectedAlertId(null);
    setSelectedClosureId(null);
  }}
  isDark={isDark}
  onToggleTheme={() => setIsDark(!isDark)}
  layoutResetSignal={0}
/>
```

Render station panel:

```tsx
{selectedStationId && (
  <StationDetailPanel
    stationResult={stationResult}
    loading={stationLoading}
    selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
    onClose={() => setSelectedStationId(null)}
  />
)}
```

- [ ] **Step 5: Run map and station tests.**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs frontend/tests/station-panel-layout.test.mjs frontend/tests/station-data.test.mjs
```

Expected: tests pass.

- [ ] **Step 6: Commit wiring checkpoint.**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/src/components/LineWatchShell.tsx frontend/tests/map-layering.test.mjs
git commit -m "feat: wire station selection into map"
```

## Task 7: Responsiveness and Interaction Hardening

**Files:**

- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/StationDetailPanel.tsx`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/station-panel-layout.test.mjs`

- [ ] **Step 1: Extend tests for responsive constraints.**

Add assertions to `frontend/tests/station-panel-layout.test.mjs`:

```js
it("keeps the station panel constrained and touch friendly", () => {
  assert.match(panelSource, /max-h-\[64vh\]/);
  assert.match(panelSource, /h-11 w-11/);
  assert.match(panelSource, /overflow-y-auto/);
  assert.doesNotMatch(panelSource, /backdrop-blur/);
});
```

Add assertions to `frontend/tests/drawer-layout.test.mjs`:

```js
it("keeps station detail separate from the left-side floating panels", () => {
  assert.match(shellSource, /StationDetailPanel/);
  assert.match(shellSource, /selectedStationId/);
  assert.match(shellSource, /setSelectedStationId\(null\)/);
});
```

- [ ] **Step 2: Run tests and verify failures reflect missing or incomplete constraints.**

Run:

```bash
node --test frontend/tests/drawer-layout.test.mjs frontend/tests/station-panel-layout.test.mjs
```

Expected: failures only for missing station responsiveness assertions.

- [ ] **Step 3: Ensure controls do not overlap on common viewports.**

Apply these code constraints:

- Keep station panel `z-30`; existing header/menu stays `z-40`.
- Keep map main viewport `z-10`.
- Keep legend at `z-20`; mobile bottom sheet can cover it intentionally while open.
- Use `md:right-6 md:top-[104px] md:bottom-6 md:w-[min(calc(100vw-48px),390px)]` for desktop dock.
- Use `left-0 right-0 bottom-0 max-h-[64vh] rounded-t-lg` for mobile sheet.
- Keep close button `h-11 w-11`.

- [ ] **Step 4: Run tests.**

Run:

```bash
node --test frontend/tests/drawer-layout.test.mjs frontend/tests/station-panel-layout.test.mjs
```

Expected: tests pass.

- [ ] **Step 5: Commit responsiveness checkpoint.**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/src/components/StationDetailPanel.tsx frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/drawer-layout.test.mjs frontend/tests/station-panel-layout.test.mjs
git commit -m "fix: harden station detail responsive layout"
```

## Task 8: Documentation and Verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README current status.**

Add these bullets under implemented frontend/backend status after the feature is complete:

```markdown
- Clickable/tappable station detail overlays for supported rapid transit stations.
- Backend `/api/stations` and `/api/stations/{id}` endpoints backed by Flyway-seeded PostgreSQL station data.
- Station detail panel with desktop right dock and mobile bottom sheet behavior.
- Seeded station access and station impact records.
- Demo station arrivals clearly labeled as placeholders, not live TTC predictions.
```

Add this limitation under not implemented:

```markdown
- Live train arrival predictions and live station accessibility ingestion.
```

- [ ] **Step 2: Run backend verification.**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [ ] **Step 3: Run frontend verification.**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all frontend checks pass.

- [ ] **Step 4: Run local full-stack smoke check.**

Run:

```bash
docker compose up -d postgres redis
mvn -f backend/pom.xml spring-boot:run
```

In a second terminal, run:

```bash
curl http://localhost:8080/api/stations
curl http://localhost:8080/api/stations/union
```

Expected: both commands return JSON with seeded station data.

- [ ] **Step 5: Start frontend and manually inspect.**

Run:

```bash
npm --prefix frontend run dev
```

Expected manual behavior:

- Clicking Union opens the station panel.
- Desktop width uses a right dock.
- Mobile width uses a bottom sheet.
- The panel labels arrivals as demo placeholders.
- If the backend is stopped, station detail still opens from fallback data and shows fallback copy.

- [ ] **Step 6: Commit documentation and final verified feature.**

```bash
git add README.md
git commit -m "docs: document station detail backend slice"
```

## Plan Self-Review

- Spec coverage: backend endpoints, Flyway data, station panel, map hit targets, fallback behavior, responsive layout, demo arrival disclaimer, and verification are each mapped to tasks.
- Placeholder scan: the plan avoids unresolved placeholder markers and gives concrete file paths, SQL, tests, and commands.
- Type consistency: backend response record names match frontend API types; station ids use `eglinton`, not the old `eglington` typo; route ids stay in the existing `line-1` format.
