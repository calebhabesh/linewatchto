package com.calebhabesh.linewatch.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.regional.RegionalDashboardService;
import com.calebhabesh.linewatch.status.StatusController;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DashboardControllerTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T12:00:00Z"), ZoneOffset.UTC);

    private final MapController mapController = mock(MapController.class);
    private final StatusController statusController = mock(StatusController.class);
    private final AlertDashboardService alertDashboardService = mock(AlertDashboardService.class);
    private final PerformanceController performanceController = mock(PerformanceController.class);
    private final DashboardCacheService cache = mock(DashboardCacheService.class);
    private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
    private final IngestionRunStore ingestionRunStore = mock(IngestionRunStore.class);
    private final RegionalDashboardService regionalDashboardService = mock(RegionalDashboardService.class);
    private final IngestionFreshness ingestionFreshness = new IngestionFreshness(
        ingestionRunStore,
        new AlertIngestionProperties(),
        CLOCK
    );
    private final DashboardController controller = new DashboardController(
        mapController,
        statusController,
        alertDashboardService,
        performanceController,
        cache,
        cacheProperties,
        ingestionFreshness,
        ingestionRunStore,
        regionalDashboardService
    );

    @BeforeEach
    void setUp() {
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
        when(regionalDashboardService.dashboard()).thenReturn(regionalUnavailableDashboard());
    }

    @Test
    void returnsCombinedPublicDashboardPayload() {
        MapController.MapResponse map = new MapController.MapResponse(List.of(), List.of(), List.of());
        StatusController.StatusResponse status = new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "2 minutes ago"),
            List.of()
        );
        TtcPerformanceResponses.SnapshotResponse performance = new TtcPerformanceResponses.SnapshotResponse(
            "disabled",
            "TTC.ca",
            "https://www.ttc.ca/",
            "On-time performance",
            "Disabled",
            null,
            false,
            "Performance metrics disabled.",
            List.of()
        );

        when(mapController.getMap()).thenReturn(map);
        when(statusController.getStatus()).thenReturn(status);
        when(alertDashboardService.activeAlerts()).thenReturn(List.of());
        when(alertDashboardService.delays()).thenReturn(List.of());
        when(alertDashboardService.reducedSpeedZones()).thenReturn(List.of());
        when(alertDashboardService.plannedClosures()).thenReturn(List.of());
        when(performanceController.performance()).thenReturn(performance);

        DashboardResponses.DashboardResponse response = controller.dashboard("ttc");

        assertThat(response.networkId()).isEqualTo("ttc");
        assertThat(response.map()).isSameAs(map);
        assertThat(response.status()).isSameAs(status);
        assertThat(response.activeAlerts()).isEmpty();
        assertThat(response.delays()).isEmpty();
        assertThat(response.reducedSpeedZones()).isEmpty();
        assertThat(response.plannedClosures()).isEmpty();
        assertThat(response.performance()).isSameAs(performance);
    }

    @Test
    void cachesAggregatePayloadWithFreshnessBoundedTtl() {
        OffsetDateTime started = OffsetDateTime.parse("2026-06-01T11:59:30Z");
        when(ingestionRunStore.findLatestSuccessful()).thenReturn(Optional.of(new IngestionRunSnapshot(
            42L,
            "success",
            started,
            started.plusSeconds(1),
            10,
            10,
            5,
            0,
            started,
            null
        )));
        when(mapController.getMap()).thenReturn(new MapController.MapResponse(List.of(), List.of(), List.of()));
        when(statusController.getStatus()).thenReturn(new StatusController.StatusResponse(
            new StatusController.GeneratedAtDto("8:00 AM", "Jun 1, 2026", true, "30 seconds ago"),
            List.of()
        ));
        when(performanceController.performance()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "disabled",
            "TTC.ca",
            "https://www.ttc.ca/",
            "On-time performance",
            "Disabled",
            null,
            false,
            "Performance metrics disabled.",
            List.of()
        ));

        controller.dashboard("ttc");

        verify(cache).getOrCompute(
            org.mockito.ArgumentMatchers.eq("dashboard:full:ttc"),
            any(),
            org.mockito.ArgumentMatchers.eq(Duration.ofSeconds(30)),
            any()
        );
    }

    @Test
    void returnsSourceHonestRegionalCatalogWithoutRealtimeClaims() {
        DashboardResponses.DashboardResponse response = controller.dashboard("regional");

        assertThat(response.networkId()).isEqualTo("regional");
        assertThat(response.availability()).isEqualTo("unavailable");
        assertThat(response.status().generatedAt().live()).isFalse();
        assertThat(response.status().lines()).hasSize(8);
        assertThat(response.map().stations()).hasSize(72);
        assertThat(response.activeAlerts()).isEmpty();
        assertThat(response.message()).contains("not configured");
    }

    @Test
    void delegatesDirectlyToTtcDashboardServiceWhenConstructedWithPrimaryConstructor() {
        TtcDashboardService ttcService = mock(TtcDashboardService.class);
        DashboardController primaryController = new DashboardController(
            ttcService,
            regionalDashboardService,
            cache,
            cacheProperties
        );
        DashboardResponses.DashboardResponse expected = new DashboardResponses.DashboardResponse(
            "ttc", "available", List.of(), "ok", null, null, List.of(), List.of(), List.of(), List.of(), null
        );
        when(ttcService.remainingFreshness()).thenReturn(Optional.of(Duration.ofSeconds(20)));
        when(ttcService.dashboard()).thenReturn(expected);

        DashboardResponses.DashboardResponse response = primaryController.dashboard("ttc");

        assertThat(response).isSameAs(expected);
        verify(cache).getOrCompute(
            org.mockito.ArgumentMatchers.eq("dashboard:full:ttc"),
            any(),
            org.mockito.ArgumentMatchers.eq(Duration.ofSeconds(20)),
            any()
        );
    }

    private DashboardResponses.DashboardResponse regionalUnavailableDashboard() {
        return new DashboardResponses.DashboardResponse(
            "regional", "unavailable", List.of("metrolinx-go-service-alerts", "metrolinx-up-gtfs-alerts"),
            "Regional realtime ingestion is not configured.",
            new MapController.MapResponse(
                com.calebhabesh.linewatch.regional.RegionalNetworkCatalog.stations().stream()
                    .map(station -> new MapController.StationDto(station.id(), station.name(), 0, 0, station.interchange()))
                    .toList(),
                List.of(), List.of()
            ),
            new StatusController.StatusResponse(
                new StatusController.GeneratedAtDto("Unavailable", "Regional source not configured", false, "not configured"),
                com.calebhabesh.linewatch.regional.RegionalNetworkCatalog.routes().stream()
                    .map(route -> new StatusController.LineStatusDto(route.id(), route.number(), route.name(), route.name(), route.color(), "ready", "Data unavailable", "Not configured", "Not configured"))
                    .toList()
            ),
            List.of(), List.of(), List.of(), List.of(),
            new TtcPerformanceResponses.SnapshotResponse("disabled", "Unavailable", "", "Regional performance unavailable", "Not available", null, false, "Unavailable", List.of())
        );
    }
}
