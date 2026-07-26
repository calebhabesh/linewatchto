package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.status.StatusController;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final MapController mapController;
    private final StatusController statusController;
    private final AlertDashboardService alertDashboardService;
    private final PerformanceController performanceController;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final IngestionFreshness ingestionFreshness;
    private final IngestionRunStore ingestionRunStore;

    public DashboardController(
        MapController mapController,
        StatusController statusController,
        AlertDashboardService alertDashboardService,
        PerformanceController performanceController,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore
    ) {
        this.mapController = mapController;
        this.statusController = statusController;
        this.alertDashboardService = alertDashboardService;
        this.performanceController = performanceController;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.ingestionFreshness = ingestionFreshness;
        this.ingestionRunStore = ingestionRunStore;
    }

    @GetMapping
    public DashboardResponses.DashboardResponse dashboard(
        @RequestParam(defaultValue = "ttc") String network
    ) {
        String networkId = normalizeNetwork(network);
        if (RegionalNetworkCatalog.NETWORK_ID.equals(networkId)) {
            return cache.getOrCompute(
                "dashboard:full:regional",
                new TypeReference<DashboardResponses.DashboardResponse>() {},
                cacheProperties.getFullDashboardTtl(),
                this::buildRegionalDashboard
            );
        }

        Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatest())
            .map(remaining -> remaining.compareTo(cacheProperties.getFullDashboardTtl()) < 0
                ? remaining
                : cacheProperties.getFullDashboardTtl())
            .orElse(cacheProperties.getFullDashboardTtl());

        return cache.getOrCompute(
            "dashboard:full:ttc",
            new TypeReference<DashboardResponses.DashboardResponse>() {},
            ttl,
            this::buildDashboard
        );
    }

    private DashboardResponses.DashboardResponse buildDashboard() {
        return new DashboardResponses.DashboardResponse(
            "ttc",
            "available",
            List.of("ttc-live-alerts", "ttc-scheduled-service"),
            "TTC dashboard data is freshness-gated; inspect status.generatedAt.live before making live claims.",
            mapController.getMap(),
            statusController.getStatus(),
            alertDashboardService.activeAlerts(),
            alertDashboardService.delays(),
            alertDashboardService.reducedSpeedZones(),
            alertDashboardService.plannedClosures(),
            performanceController.performance()
        );
    }

    private DashboardResponses.DashboardResponse buildRegionalDashboard() {
        List<MapController.StationDto> stations = RegionalNetworkCatalog.stations().stream()
            .map(station -> new MapController.StationDto(
                station.id(),
                station.name(),
                station.mapX(),
                station.mapY(),
                station.interchange()
            ))
            .toList();
        List<StatusController.LineStatusDto> lines = RegionalNetworkCatalog.routes().stream()
            .map(route -> new StatusController.LineStatusDto(
                route.id(),
                route.number(),
                route.name(),
                route.name() + " corridor",
                route.color(),
                "ready",
                "Data unavailable",
                "Metrolinx realtime ingestion is not configured.",
                "Not configured"
            ))
            .toList();

        return new DashboardResponses.DashboardResponse(
            RegionalNetworkCatalog.NETWORK_ID,
            "unavailable",
            List.of("metrolinx-go", "metrolinx-up"),
            "Regional realtime ingestion is not configured. Static catalog data is provided for interface use only.",
            new MapController.MapResponse(stations, List.of(), List.of()),
            new StatusController.StatusResponse(
                new StatusController.GeneratedAtDto("Unavailable", "Regional source not configured", false, "not configured"),
                lines
            ),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            new com.calebhabesh.linewatch.performance.TtcPerformanceResponses.SnapshotResponse(
                "disabled",
                "Unavailable",
                "",
                "Regional performance unavailable",
                "Not available",
                null,
                false,
                "Regional reliability aggregation is not implemented.",
                List.of()
            )
        );
    }

    private String normalizeNetwork(String network) {
        String normalized = network == null ? "ttc" : network.trim().toLowerCase();
        if (!"ttc".equals(normalized) && !RegionalNetworkCatalog.NETWORK_ID.equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported network.");
        }
        return normalized;
    }
}
