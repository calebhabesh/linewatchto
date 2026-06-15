package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/surface-notices")
public class SurfaceServiceNoticeController {
    private final SurfaceServiceNoticeService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public SurfaceServiceNoticeController(
        SurfaceServiceNoticeService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse surfaceNotices(
        @RequestParam(name = "category", required = false) String category,
        @RequestParam(name = "query", required = false) String query,
        @RequestParam(name = "limit", required = false) Integer limit
    ) {
        boolean cacheable = (query == null || query.isBlank()) && (limit == null || limit == 100);
        if (cacheable) {
            String cacheKey = "surface-notices:" + (category != null ? category.toLowerCase() : "all");
            return cache.getOrCompute(
                cacheKey,
                new TypeReference<SurfaceServiceNoticeResponses.SurfaceServiceNoticesResponse>() {},
                cacheProperties.getAlertsTtl(),
                () -> service.getSurfaceNotices(category, query, limit)
            );
        }
        return service.getSurfaceNotices(category, query, limit);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
