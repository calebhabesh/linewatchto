package com.calebhabesh.linewatch.dashboard;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.regional.RegionalDashboardService;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import tools.jackson.core.type.TypeReference;
import java.time.Duration;
import java.util.Objects;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final TtcDashboardService ttcDashboardService;
    private final RegionalDashboardService regionalDashboardService;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public DashboardController(
        TtcDashboardService ttcDashboardService,
        RegionalDashboardService regionalDashboardService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.ttcDashboardService = Objects.requireNonNull(ttcDashboardService, "ttcDashboardService must not be null");
        this.regionalDashboardService = Objects.requireNonNull(regionalDashboardService, "regionalDashboardService must not be null");
        this.cache = Objects.requireNonNull(cache, "cache must not be null");
        this.cacheProperties = Objects.requireNonNull(cacheProperties, "cacheProperties must not be null");
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
            Duration boundary = regionalDashboardService.nextTransition().orElse(ttl);
            if (boundary.compareTo(ttl) < 0) ttl = boundary;
            return cache.getOrCompute(
                "dashboard:full:regional",
                new TypeReference<DashboardResponses.DashboardResponse>() {},
                ttl,
                regionalDashboardService::dashboard
            );
        }

        Duration ttl = ttcDashboardService.remainingFreshness()
            .map(remaining -> remaining.compareTo(cacheProperties.getFullDashboardTtl()) < 0
                ? remaining
                : cacheProperties.getFullDashboardTtl())
            .orElse(cacheProperties.getFullDashboardTtl());

        return cache.getOrCompute(
            "dashboard:full:ttc",
            new TypeReference<DashboardResponses.DashboardResponse>() {},
            ttl,
            ttcDashboardService::dashboard
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
