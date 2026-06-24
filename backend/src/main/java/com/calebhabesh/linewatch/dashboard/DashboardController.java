package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.map.MapController;
import com.calebhabesh.linewatch.performance.PerformanceController;
import com.calebhabesh.linewatch.status.StatusController;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    public DashboardResponses.DashboardResponse dashboard() {
        Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatest())
            .map(remaining -> remaining.compareTo(cacheProperties.getFullDashboardTtl()) < 0
                ? remaining
                : cacheProperties.getFullDashboardTtl())
            .orElse(cacheProperties.getFullDashboardTtl());

        return cache.getOrCompute(
            "dashboard:full",
            new TypeReference<DashboardResponses.DashboardResponse>() {},
            ttl,
            this::buildDashboard
        );
    }

    private DashboardResponses.DashboardResponse buildDashboard() {
        return new DashboardResponses.DashboardResponse(
            mapController.getMap(),
            statusController.getStatus(),
            alertDashboardService.activeAlerts(),
            alertDashboardService.delays(),
            alertDashboardService.reducedSpeedZones(),
            alertDashboardService.plannedClosures(),
            performanceController.performance()
        );
    }
}
