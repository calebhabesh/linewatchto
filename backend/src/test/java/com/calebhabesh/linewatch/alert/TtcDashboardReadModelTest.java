package com.calebhabesh.linewatch.alert;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.dashboard.DashboardResponses;
import com.calebhabesh.linewatch.dashboard.TtcDashboardService;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.map.MapDashboardService;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.performance.TtcPerformanceService;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import com.calebhabesh.linewatch.status.StatusController;
import com.calebhabesh.linewatch.status.StatusDashboardService;
import tools.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

class TtcDashboardReadModelTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final AlertRepository alertRepository = mock(AlertRepository.class);
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final AlertActivePeriodRepository periodRepository = mock(AlertActivePeriodRepository.class);
    private final TtcClosureProjector closureProjector = mock(TtcClosureProjector.class);
    private final ReducedSpeedZoneProjector reducedSpeedZoneProjector = mock(ReducedSpeedZoneProjector.class);
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final TransitLineRepository transitLineRepository = mock(TransitLineRepository.class);
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);

    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();

    private IngestionFreshness ingestionFreshness;
    private AlertDashboardService alertDashboardService;
    private DashboardCacheService cacheService;
    private MapDashboardService mapDashboardService;
    private StatusDashboardService statusDashboardService;
    private TtcPerformanceService performanceService;
    private TtcDashboardService ttcDashboardService;

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(valueOperations);
        when(reducedSpeedZoneProjector.project(any(), any()))
            .thenReturn(new ReducedSpeedZoneProjector.Projection(List.of(), Map.of()));

        AlertIngestionProperties ingestionProperties = new AlertIngestionProperties();
        ingestionFreshness = new IngestionFreshness(ingestionRunStore, ingestionProperties, CLOCK);

        alertDashboardService = new AlertDashboardService(
            alertRepository,
            lineSegmentRepository,
            new AlertSegmentMatcher(),
            reducedSpeedZoneProjector,
            ingestionFreshness,
            periodRepository,
            CLOCK,
            closureProjector
        );

        cacheService = new DashboardCacheService(redis, objectMapper, cacheProperties);

        mapDashboardService = new MapDashboardService(
            stationRepository,
            lineSegmentRepository,
            alertDashboardService,
            cacheService,
            cacheProperties,
            ingestionFreshness,
            ingestionRunStore
        );

        statusDashboardService = new StatusDashboardService(
            transitLineRepository,
            alertRepository,
            ingestionRunStore,
            ingestionFreshness,
            alertDashboardService,
            CLOCK,
            cacheService,
            cacheProperties
        );

        performanceService = mock(TtcPerformanceService.class);

        ttcDashboardService = new TtcDashboardService(
            mapDashboardService,
            statusDashboardService,
            alertDashboardService,
            performanceService,
            ingestionFreshness,
            ingestionRunStore
        );
    }

    @Test
    void createReadModelDeduplicatesRepositoryQueriesAndProjections() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot snapshot = new IngestionRunSnapshot(
            100L, "success", completedAt.minusSeconds(5), completedAt, 10, 10, 0, 0, completedAt, null
        );
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(snapshot));
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(snapshot));

        List<LineSegmentEntity> segments = List.of(
            segment("seg-1", "line-1", "finch", "sheppard", 1),
            segment("seg-2", "line-1", "sheppard", "bloor", 2)
        );
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(segments);

        AlertEntity suspension = createAlert("alt-1", "active-alert", "suspension", "Suspension", "finch", "sheppard");
        AlertEntity delay = createAlert("alt-2", "active-alert", "delay", "Delay", "sheppard", "bloor");
        when(alertRepository.findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE))
            .thenReturn(List.of(suspension, delay));

        AlertEntity planned = createAlert("alt-planned", "planned-closure", "planned", "Planned", "finch", "bloor");
        when(alertRepository.findByActiveTrueAndType(AlertDashboardService.PLANNED_CLOSURE_TYPE))
            .thenReturn(List.of(planned));

        when(periodRepository.findByAlertIds(List.of("alt-planned")))
            .thenReturn(Map.of("alt-planned", List.of()));

        when(closureProjector.project(anyList(), any(), anyList(), any(OffsetDateTime.class)))
            .thenReturn(List.of());

        ReducedSpeedZoneProjector.Projection emptyRszProjection =
            new ReducedSpeedZoneProjector.Projection(List.of(), Map.of());
        when(reducedSpeedZoneProjector.project(anyList(), anyList()))
            .thenReturn(emptyRszProjection);

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc())
            .thenReturn(List.of(new StationEntity("finch", "Finch", 100, 200, false, 1, null)));
        when(transitLineRepository.findAllByOrderBySortOrderAsc())
            .thenReturn(List.of(new TransitLineEntity("line-1", "1", "Yonge-University", "#FFD700", 1)));

        // Create the read model once
        TtcDashboardReadModel readModel = alertDashboardService.createReadModel(Optional.of(snapshot));

        assertThat(readModel).isNotNull();
        assertThat(readModel.dashboardLive()).isTrue();

        // Verify initial load queries: exactly 1 read per table/projector
        verify(lineSegmentRepository, times(1)).findAllByOrderBySortOrderAsc();
        verify(alertRepository, times(1)).findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE);
        verify(alertRepository, times(1)).findByActiveTrueAndType(AlertDashboardService.PLANNED_CLOSURE_TYPE);
        verify(periodRepository, times(1)).findByAlertIds(List.of("alt-planned"));
        verify(closureProjector, times(1)).project(anyList(), any(), anyList(), any(OffsetDateTime.class));
        verify(reducedSpeedZoneProjector, times(1)).project(anyList(), anyList());

        // Now consume through all dashboard components passing the read model
        StatusController.StatusResponse status = statusDashboardService.buildStatus(readModel);
        MapController.MapResponse map = mapDashboardService.buildMap(readModel);
        List<AlertDashboardService.ActiveAlertDto> activeAlerts = alertDashboardService.activeAlerts(readModel);
        List<AlertDashboardService.DelayAlertDto> delays = alertDashboardService.delays(readModel);
        List<AlertDashboardService.ReducedSpeedZoneDto> rszs = alertDashboardService.reducedSpeedZones(readModel);
        List<AlertDashboardService.PlannedClosureDto> plannedClosures = alertDashboardService.plannedClosures(readModel);
        List<AlertDashboardService.PlannedClosureDto> activeClosures = alertDashboardService.activePlannedClosures(readModel);
        Map<String, List<AlertDashboardService.SegmentImpact>> impacts = alertDashboardService.activeSegmentImpacts(readModel);
        List<AlertDashboardService.StationNodeImpact> nodeImpacts = alertDashboardService.activeStationNodeImpacts(readModel);

        assertThat(status).isNotNull();
        assertThat(map).isNotNull();
        assertThat(activeAlerts).isNotEmpty();
        assertThat(delays).isNotEmpty();

        // Verify ZERO additional queries were made to repositories and ZERO additional projections
        verify(lineSegmentRepository, times(1)).findAllByOrderBySortOrderAsc();
        verify(alertRepository, times(1)).findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE);
        verify(alertRepository, times(1)).findByActiveTrueAndType(AlertDashboardService.PLANNED_CLOSURE_TYPE);
        verify(periodRepository, times(1)).findByAlertIds(List.of("alt-planned"));
        verify(closureProjector, times(1)).project(anyList(), any(), anyList(), any(OffsetDateTime.class));
        verify(reducedSpeedZoneProjector, times(1)).project(anyList(), anyList());
        verify(stationRepository, times(1)).findAllByOrderBySortOrderAscNameAsc();
        verify(transitLineRepository, times(1)).findAllByOrderBySortOrderAsc();
    }

    @Test
    void exactJsonParityBetweenStandaloneAndReadModelBuilders() throws Exception {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot snapshot = new IngestionRunSnapshot(
            100L, "success", completedAt.minusSeconds(5), completedAt, 10, 10, 0, 0, completedAt, null
        );
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(snapshot));
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(snapshot));

        List<LineSegmentEntity> segments = List.of(
            segment("seg-1", "line-1", "finch", "sheppard", 1),
            segment("seg-2", "line-1", "sheppard", "bloor", 2)
        );
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(segments);

        AlertEntity suspension = createAlert("alt-1", "active-alert", "suspension", "Suspension", "finch", "sheppard");
        AlertEntity delay = createAlert("alt-2", "active-alert", "delay", "Delay", "sheppard", "bloor");
        when(alertRepository.findByActiveTrueAndType(AlertDashboardService.ACTIVE_ALERT_TYPE))
            .thenReturn(List.of(suspension, delay));
        when(alertRepository.findByActiveTrueAndType(AlertDashboardService.PLANNED_CLOSURE_TYPE))
            .thenReturn(List.of());

        ReducedSpeedZoneProjector.Projection emptyRszProjection =
            new ReducedSpeedZoneProjector.Projection(List.of(), Map.of());
        when(reducedSpeedZoneProjector.project(anyList(), anyList()))
            .thenReturn(emptyRszProjection);

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc())
            .thenReturn(List.of(new StationEntity("finch", "Finch", 100, 200, false, 1, null)));
        when(transitLineRepository.findAllByOrderBySortOrderAsc())
            .thenReturn(List.of(new TransitLineEntity("line-1", "1", "Yonge-University", "#FFD700", 1)));

        // 1. Build standalone
        StatusController.StatusResponse standaloneStatus = statusDashboardService.buildStatus();
        MapController.MapResponse standaloneMap = mapDashboardService.buildMap();
        List<AlertDashboardService.ActiveAlertDto> standaloneActiveAlerts = alertDashboardService.activeAlerts();
        List<AlertDashboardService.DelayAlertDto> standaloneDelays = alertDashboardService.delays();
        List<AlertDashboardService.ReducedSpeedZoneDto> standaloneRszs = alertDashboardService.reducedSpeedZones();
        List<AlertDashboardService.PlannedClosureDto> standalonePlanned = alertDashboardService.plannedClosures();

        DashboardResponses.DashboardResponse standaloneResponse = new DashboardResponses.DashboardResponse(
            "ttc",
            "available",
            List.of("ttc-live-alerts", "ttc-scheduled-service"),
            "Fresh TTC dashboard data loaded from the last successful ingestion snapshot.",
            standaloneMap,
            standaloneStatus,
            standaloneActiveAlerts,
            standaloneDelays,
            standaloneRszs,
            standalonePlanned,
            null
        );

        // 2. Build via read model
        TtcDashboardReadModel readModel = alertDashboardService.createReadModel(Optional.of(snapshot));
        StatusController.StatusResponse readModelStatus = statusDashboardService.buildStatus(readModel);
        MapController.MapResponse readModelMap = mapDashboardService.buildMap(readModel);
        List<AlertDashboardService.ActiveAlertDto> readModelActiveAlerts = alertDashboardService.activeAlerts(readModel);
        List<AlertDashboardService.DelayAlertDto> readModelDelays = alertDashboardService.delays(readModel);
        List<AlertDashboardService.ReducedSpeedZoneDto> readModelRszs = alertDashboardService.reducedSpeedZones(readModel);
        List<AlertDashboardService.PlannedClosureDto> readModelPlanned = alertDashboardService.plannedClosures(readModel);

        DashboardResponses.DashboardResponse readModelResponse = new DashboardResponses.DashboardResponse(
            "ttc",
            "available",
            List.of("ttc-live-alerts", "ttc-scheduled-service"),
            "Fresh TTC dashboard data loaded from the last successful ingestion snapshot.",
            readModelMap,
            readModelStatus,
            readModelActiveAlerts,
            readModelDelays,
            readModelRszs,
            readModelPlanned,
            null
        );

        String standaloneJson = objectMapper.writeValueAsString(standaloneResponse);
        String readModelJson = objectMapper.writeValueAsString(readModelResponse);

        assertThat(readModelJson).isEqualTo(standaloneJson);
    }

    @Test
    void preservesNestedMapAndStatusCacheHitsOnFullDashboardMiss() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot snapshot = new IngestionRunSnapshot(
            100L, "success", completedAt.minusSeconds(5), completedAt, 10, 10, 0, 0, completedAt, null
        );
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(snapshot));

        MapController.MapResponse cachedMap = new MapController.MapResponse(List.of(), List.of(), List.of());
        StatusController.StatusResponse cachedStatus = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("12:00 PM", "Jun 1, 2026", true, "succeeded just now"),
            List.of()
        );

        // Populate Redis cache for nested keys
        try {
            when(valueOperations.get("linewatch:dashboard:v1:map")).thenReturn(objectMapper.writeValueAsString(cachedMap));
            when(valueOperations.get("linewatch:dashboard:v1:status")).thenReturn(objectMapper.writeValueAsString(cachedStatus));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        AtomicBoolean readModelLoaded = new AtomicBoolean(false);

        MapController.MapResponse retrievedMap = mapDashboardService.getMap(() -> {
            readModelLoaded.set(true);
            return alertDashboardService.createReadModel();
        });

        StatusController.StatusResponse retrievedStatus = statusDashboardService.getStatus(() -> {
            readModelLoaded.set(true);
            return alertDashboardService.createReadModel();
        });

        // The nested cache hits must return the cached DTOs WITHOUT invoking the read model supplier
        assertThat(retrievedMap.stations()).isEmpty();
        assertThat(retrievedStatus.lines()).isEmpty();
        assertThat(readModelLoaded.get()).isFalse();

        // Zero repository reads took place
        verifyNoInteractions(stationRepository);
        verifyNoInteractions(transitLineRepository);
        verifyNoInteractions(lineSegmentRepository);
    }

    @Test
    void redisOutageFallbackGracefullyComputesWithReadModel() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot snapshot = new IngestionRunSnapshot(
            100L, "success", completedAt.minusSeconds(5), completedAt, 10, 10, 0, 0, completedAt, null
        );
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(snapshot));

        // Simulate Redis outage: get throws RedisConnectionFailureException
        when(valueOperations.get(any())).thenThrow(new RedisConnectionFailureException("Redis connection refused"));

        List<LineSegmentEntity> segments = List.of(segment("seg-1", "line-1", "stn-a", "stn-b", 1));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(segments);
        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
        when(transitLineRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());
        when(alertRepository.findByActiveTrueAndType(any())).thenReturn(List.of());

        TtcDashboardReadModel readModel = alertDashboardService.createReadModel(Optional.of(snapshot));

        // Both calls must fall back to computation using the read model without throwing
        MapController.MapResponse map = mapDashboardService.getMap(() -> readModel);
        StatusController.StatusResponse status = statusDashboardService.getStatus(() -> readModel);

        assertThat(map).isNotNull();
        assertThat(status).isNotNull();
        assertThat(map.segments()).hasSize(1);
    }

    @Test
    void offlineModeWhenSnapshotStaleOrMissing() {
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.empty());
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("seg-1", "line-1", "stn-a", "stn-b", 1)
        ));

        TtcDashboardReadModel readModel = alertDashboardService.createReadModel(Optional.empty());

        assertThat(readModel.dashboardLive()).isFalse();
        assertThat(readModel.activeAlerts()).isEmpty();
        assertThat(readModel.delays()).isEmpty();
        assertThat(readModel.reducedSpeedZones()).isEmpty();
        assertThat(readModel.plannedClosures()).isEmpty();
        assertThat(readModel.activePlannedClosures()).isEmpty();
        assertThat(readModel.segmentImpacts()).isEmpty();
        assertThat(readModel.stationNodeImpacts()).isEmpty();

        // No queries to alert repositories or periods were made
        verify(alertRepository, times(0)).findByActiveTrueAndType(any());
        verify(periodRepository, times(0)).findByAlertIds(any());
        verifyNoInteractions(closureProjector);
        verifyNoInteractions(reducedSpeedZoneProjector);
    }

    @Test
    void fullDashboardIntegratesReadModelAndReportsAvailabilityCorrectly() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:58:00Z");
        IngestionRunSnapshot snapshot = new IngestionRunSnapshot(
            100L, "success", completedAt.minusSeconds(5), completedAt, 10, 10, 0, 0, completedAt, null
        );
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(snapshot));
        when(ingestionRunStore.findLatest()).thenReturn(Optional.of(snapshot));

        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());
        when(alertRepository.findByActiveTrueAndType(any())).thenReturn(List.of());
        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
        when(transitLineRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());

        TtcPerformanceResponses.SnapshotResponse perf = new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC", "url", "title", "date", completedAt, false, "perf", List.of()
        );
        when(performanceService.performance()).thenReturn(perf);

        DashboardResponses.DashboardResponse dashboard = ttcDashboardService.dashboard();

        assertThat(dashboard).isNotNull();
        assertThat(dashboard.networkId()).isEqualTo("ttc");
        assertThat(dashboard.availability()).isEqualTo("available");
        assertThat(dashboard.sourceSystems()).containsExactly("ttc-live-alerts", "ttc-scheduled-service");
        assertThat(dashboard.performance()).isEqualTo(perf);
    }

    private LineSegmentEntity segment(String id, String lineId, String stnA, String stnB, int sort) {
        return new LineSegmentEntity(id, lineId, stnA, stnB, null, "M 0 0", sort);
    }

    private AlertEntity createAlert(String id, String type, String severity, String title, String stnA, String stnB) {
        AlertEntity alert = new AlertEntity();
        ReflectionTestUtils.setField(alert, "id", id);
        ReflectionTestUtils.setField(alert, "type", type);
        ReflectionTestUtils.setField(alert, "severity", severity);
        ReflectionTestUtils.setField(alert, "impactKind", severity.equals("delay") ? "delay" : severity);
        ReflectionTestUtils.setField(alert, "title", title);
        ReflectionTestUtils.setField(alert, "description", title + " description");
        ReflectionTestUtils.setField(alert, "active", true);
        ReflectionTestUtils.setField(alert, "startStationId", stnA);
        ReflectionTestUtils.setField(alert, "endStationId", stnB);
        ReflectionTestUtils.setField(alert, "activePeriodStart", OffsetDateTime.now(CLOCK).minusMinutes(10));
        ReflectionTestUtils.setField(alert, "sourceUpdatedAt", OffsetDateTime.now(CLOCK).minusMinutes(5));
        ReflectionTestUtils.setField(alert, "line", new TransitLineEntity("line-1", "1", "Yonge-University", "#FFD700", 1));
        return alert;
    }
}
