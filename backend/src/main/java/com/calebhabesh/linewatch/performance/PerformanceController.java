package com.calebhabesh.linewatch.performance;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/performance")
public class PerformanceController {
    private final TtcPerformanceService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public PerformanceController(
        TtcPerformanceService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public TtcPerformanceResponses.SnapshotResponse performance() {
        return cache.getOrCompute(
            "performance",
            new TypeReference<TtcPerformanceResponses.SnapshotResponse>() {},
            cacheProperties.getPerformanceTtl(),
            service::current
        );
    }
}
