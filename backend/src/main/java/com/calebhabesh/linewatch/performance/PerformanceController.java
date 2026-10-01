package com.calebhabesh.linewatch.performance;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import tools.jackson.core.type.TypeReference;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/performance")
public class PerformanceController {
    private final TtcPerformanceService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    @Autowired
    public PerformanceController(TtcPerformanceService service) {
        this(service, null, null);
    }

    public PerformanceController(
        TtcPerformanceService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = Objects.requireNonNull(service, "service must not be null");
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public TtcPerformanceResponses.SnapshotResponse performance() {
        if (cache != null && cacheProperties != null) {
            return cache.getOrComputeIf(
                "performance",
                new TypeReference<TtcPerformanceResponses.SnapshotResponse>() {},
                cacheProperties.getPerformanceTtl(),
                TtcPerformanceService::isCacheableSnapshot,
                service::current
            );
        }
        return service.performance();
    }
}
