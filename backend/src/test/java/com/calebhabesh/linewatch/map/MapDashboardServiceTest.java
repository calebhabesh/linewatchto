package com.calebhabesh.linewatch.map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MapDashboardServiceTest {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-06-01T12:00:00Z"),
        ZoneOffset.UTC
    );

    private final StationRepository stationRepository = mock(StationRepository.class);
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final AlertDashboardService dashboardService = mock(AlertDashboardService.class);
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final IngestionFreshness freshness = new IngestionFreshness(
        ingestionRunStore,
        new AlertIngestionProperties(),
        CLOCK
    );
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();

    private final MapDashboardService service = new MapDashboardService(
        stationRepository,
        lineSegmentRepository,
        dashboardService,
        cache,
        cacheProperties,
        freshness,
        ingestionRunStore
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void appliesActiveAlertImpactToMatchingNetworkSegment() {
        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of(
            new StationEntity("jane", "Jane", 100, 200, false, 1, null)
        ));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            new LineSegmentEntity(
                "line-2-jane-ossington",
                "line-2",
                "jane",
                "ossington",
                null,
                "M 0 0 L 1 1",
                10,
                "eastbound",
                null,
                false,
                "station-jane",
                "station-ossington"
            )
        ));
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of(
            "line-2-jane-ossington",
            List.of(new AlertDashboardService.SegmentImpact(
                "delay",
                "delay-line-2-jane-ossington",
                "forward",
                List.of("delay-line-2-jane-ossington")
            ))
        ));
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of(
            new AlertDashboardService.StationNodeImpact(
                "sheppard-yonge",
                "delay",
                "delay-line-4-sheppard-yonge",
                "Delay at Sheppard-Yonge"
            )
        ));

        MapController.MapResponse response = service.getMap();

        assertThat(response.stations()).singleElement().satisfies(station -> {
            assertThat(station.id()).isEqualTo("jane");
            assertThat(station.name()).isEqualTo("Jane");
        });

        assertThat(response.segments()).singleElement().satisfies(segment -> {
            assertThat(segment.id()).isEqualTo("line-2-jane-ossington");
            assertThat(segment.overlay()).isEqualTo("delay");
            assertThat(segment.travelDirection()).isEqualTo("forward");
            assertThat(segment.impacts()).hasSize(1);
        });

        assertThat(response.stationNodeImpacts()).singleElement().satisfies(nodeImpact -> {
            assertThat(nodeImpact.stationId()).isEqualTo("sheppard-yonge");
            assertThat(nodeImpact.kind()).isEqualTo("delay");
        });
    }

    @Test
    void cachesMapPayloadWithFreshnessBoundedTtl() {
        OffsetDateTime completedAt = OffsetDateTime.parse("2026-06-01T11:50:15Z");
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(new IngestionRunSnapshot(
            10L, "success", completedAt.minusSeconds(1), completedAt, 5, 5, 0, 0, completedAt, null
        )));

        when(stationRepository.findAllByOrderBySortOrderAscNameAsc()).thenReturn(List.of());
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());
        when(dashboardService.activeSegmentImpacts()).thenReturn(Map.of());
        when(dashboardService.activeStationNodeImpacts()).thenReturn(List.of());

        service.getMap();

        verify(cache).getOrCompute(
            eq("map"),
            any(),
            eq(Duration.ofSeconds(15)),
            any()
        );
    }

    @Test
    void constructorRejectsNullArguments() {
        assertThatThrownBy(() -> new MapDashboardService(
            null, lineSegmentRepository, dashboardService, cache, cacheProperties, freshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, null, dashboardService, cache, cacheProperties, freshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, lineSegmentRepository, null, cache, cacheProperties, freshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, lineSegmentRepository, dashboardService, null, cacheProperties, freshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, lineSegmentRepository, dashboardService, cache, null, freshness, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, lineSegmentRepository, dashboardService, cache, cacheProperties, null, ingestionRunStore
        )).isInstanceOf(NullPointerException.class);

        assertThatThrownBy(() -> new MapDashboardService(
            stationRepository, lineSegmentRepository, dashboardService, cache, cacheProperties, freshness, null
        )).isInstanceOf(NullPointerException.class);
    }
}
