package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reliability")
public class ReliabilityController {
    private static final TypeReference<ReliabilityResponses.ReliabilityResponse> RESPONSE_TYPE =
        new TypeReference<>() {};

    private final ReliabilityService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public ReliabilityController(
        ReliabilityService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping("/lines")
    public ReliabilityResponses.ReliabilityResponse lines(
        @RequestParam(defaultValue = "ttc") String network
    ) {
        String networkId = ReliabilityService.normalizeNetwork(network);
        return cache.getOrCompute(
            "reliability:lines:" + networkId,
            RESPONSE_TYPE,
            cacheProperties.getReliabilityTtl(),
            () -> service.lines(networkId)
        );
    }

    @GetMapping("/stations/{stationId}")
    public ReliabilityResponses.ReliabilityResponse station(
        @PathVariable String stationId,
        @RequestParam(defaultValue = "ttc") String network
    ) {
        String networkId = ReliabilityService.normalizeNetwork(network);
        String normalizedStationId = ReliabilityService.normalizeStationId(stationId);
        return cache.getOrCompute(
            "reliability:station:" + networkId + ":" + normalizedStationId,
            RESPONSE_TYPE,
            cacheProperties.getReliabilityTtl(),
            () -> service.station(networkId, normalizedStationId)
        );
    }
}
