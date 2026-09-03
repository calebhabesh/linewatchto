package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.status.StatusController;
import com.calebhabesh.linewatch.regional.RegionalDashboardService;
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
    private final RegionalDashboardService regionalDashboardService;

    public DashboardController(
        MapController mapController,
        StatusController statusController,
        AlertDashboardService alertDashboardService,
        PerformanceController performanceController,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        IngestionFreshness ingestionFreshness,
        IngestionRunStore ingestionRunStore,
        RegionalDashboardService regionalDashboardService
    ) {
        this.mapController = mapController;
        this.statusController = statusController;
        this.alertDashboardService = alertDashboardService;
        this.performanceController = performanceController;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.ingestionFreshness = ingestionFreshness;
        this.ingestionRunStore = ingestionRunStore;
        this.regionalDashboardService = regionalDashboardService;
    }

    @GetMapping
    public DashboardResponses.DashboardResponse dashboard(
        @RequestParam(defaultValue = "ttc") String network
    ) {
        String networkId = normalizeNetwork(network);
        if (RegionalNetworkCatalog.NETWORK_ID.equals(networkId)) {
            Duration ttl = regionalDashboardService.remainingFreshness()
                .map(remaining -> remaining.compareTo(cacheProperties.getFullDashboardTtl()) < 0
                    ? remaining
                    : cacheProperties.getFullDashboardTtl())
                .orElse(cacheProperties.getFullDashboardTtl());
            return cache.getOrCompute(
                "dashboard:full:regional",
                new TypeReference<DashboardResponses.DashboardResponse>() {},
                ttl,
                regionalDashboardService::dashboard
            );
        }

        Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatestSuccessful())
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
        StatusController.StatusResponse status = statusController.getStatus();
        boolean live = status.generatedAt().live();
        String availability = live ? ttcAvailability() : "unavailable";
        return new DashboardResponses.DashboardResponse(
            "ttc",
            availability,
            List.of("ttc-live-alerts", "ttc-scheduled-service"),
            ttcMessage(availability),
            mapController.getMap(),
            status,
            alertDashboardService.activeAlerts(),
            alertDashboardService.delays(),
            alertDashboardService.reducedSpeedZones(),
            alertDashboardService.plannedClosures(),
            performanceController.performance()
        );
    }

    private String ttcAvailability() {
        return ingestionRunStore.findLatest()
            .filter(run -> "failed".equalsIgnoreCase(run.status()))
            .map(ignored -> "degraded")
            .orElse("available");
    }

    private String ttcMessage(String availability) {
        return switch (availability) {
            case "degraded" -> "The latest TTC refresh failed; LineWatchTO is retaining the last successful fresh snapshot.";
            case "unavailable" -> "TTC service-alert data is unavailable because the last successful snapshot is missing or stale.";
            default -> "Fresh TTC dashboard data loaded from the last successful ingestion snapshot.";
        };
    }

    private String normalizeNetwork(String network) {
        String normalized = network == null ? "ttc" : network.trim().toLowerCase();
        if (!"ttc".equals(normalized) && !RegionalNetworkCatalog.NETWORK_ID.equals(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported network.");
        }
        return normalized;
    }
}
