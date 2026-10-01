package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import tools.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alert-history")
public class AlertHistoryController {
    private static final TypeReference<AlertHistoryResponses.AlertHistoryResponse> RESPONSE_TYPE =
        new TypeReference<>() {};

    private final AlertHistoryService historyService;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public AlertHistoryController(
        AlertHistoryService historyService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.historyService = historyService;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public AlertHistoryResponses.AlertHistoryResponse getAlertHistory(
        @RequestParam(required = false, defaultValue = "ttc") String network,
        @RequestParam(required = false, defaultValue = "today") String period,
        @RequestParam(required = false, defaultValue = "5000") Integer limit
    ) {
        String normalizedNetwork = AlertHistoryService.normalizeNetwork(network);
        String normalizedPeriod = AlertHistoryService.normalizePeriod(period);
        int normalizedLimit = AlertHistoryService.normalizeLimit(limit);
        String cacheKey = "alert-history:" + normalizedNetwork + ":" + normalizedPeriod + ":" + normalizedLimit;
        return cache.getOrCompute(
            cacheKey,
            RESPONSE_TYPE,
            cacheProperties.getAlertHistoryTtl(),
            () -> historyService.history(normalizedNetwork, normalizedPeriod, normalizedLimit)
        );
    }
}
