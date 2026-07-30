package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.regional.RegionalSurfaceServiceNoticeService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/surface-notices")
public class SurfaceServiceNoticeController {
    private final SurfaceServiceNoticeService service;
    private final RegionalSurfaceServiceNoticeService regionalService;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public SurfaceServiceNoticeController(
        SurfaceServiceNoticeService service,
        RegionalSurfaceServiceNoticeService regionalService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.regionalService = regionalService;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse surfaceNotices(
        @RequestParam(name = "network", defaultValue = "ttc") String network,
        @RequestParam(name = "category", required = false) String category,
        @RequestParam(name = "query", required = false) String query,
        @RequestParam(name = "limit", required = false) Integer limit
    ) {
        String networkId = network == null ? "ttc" : network.trim().toLowerCase();
        if (!networkId.equals("ttc") && !networkId.equals("regional")) {
            throw new IllegalArgumentException("Invalid network: " + network);
        }
        boolean cacheable = (query == null || query.isBlank()) && (limit == null || limit == 100);
        if (cacheable) {
            String cacheKey = "surface-notices:" + networkId + ":" + (category != null ? category.toLowerCase() : "all");
            return cache.getOrCompute(
                cacheKey,
                new TypeReference<SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse>() {},
                cacheProperties.getAlertsTtl(),
                () -> getSurfaceNotices(networkId, category, query, limit)
            );
        }
        return getSurfaceNotices(networkId, category, query, limit);
    }

    private SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse getSurfaceNotices(
        String network, String category, String query, Integer limit
    ) {
        return network.equals("regional")
            ? regionalService.getSurfaceNotices(category, query, limit)
            : service.getSurfaceNotices(category, query, limit);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
