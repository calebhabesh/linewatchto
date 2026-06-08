package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final AlertDashboardService dashboardService;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public AlertController(
        AlertDashboardService dashboardService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.dashboardService = dashboardService;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public Object getAlerts(@RequestParam(required = false) String type) {
        if ("planned".equals(type)) {
            return cache.getOrCompute("alerts:planned", new TypeReference<java.util.List<AlertDashboardService.PlannedClosureDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::plannedClosures);
        }
        if ("delay".equals(type)) {
            return cache.getOrCompute("alerts:delay", new TypeReference<java.util.List<AlertDashboardService.DelayAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::delays);
        }
        if ("slowdown".equals(type)) {
            return cache.getOrCompute("alerts:slowdown", new TypeReference<java.util.List<AlertDashboardService.ReducedSpeedZoneDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::reducedSpeedZones);
        }
        if ("raw".equals(type)) {
            return cache.getOrCompute("alerts:raw", new TypeReference<java.util.List<RawAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::rawAlerts);
        }

        return cache.getOrCompute("alerts:active", new TypeReference<java.util.List<AlertDashboardService.ActiveAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::activeAlerts);
    }
}
