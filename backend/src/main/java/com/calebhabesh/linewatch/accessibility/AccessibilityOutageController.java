package com.calebhabesh.linewatch.accessibility;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/accessibility-outages")
public class AccessibilityOutageController {
    private final AccessibilityOutageService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public AccessibilityOutageController(
        AccessibilityOutageService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public AccessibilityOutageResponses.AccessibilityOutagesResponse outages(
        @RequestParam(name = "asset", required = false) String asset
    ) {
        String cacheKey = "accessibility-outages:" + (asset != null ? asset.toLowerCase() : "all");
        return cache.getOrCompute(
            cacheKey,
            new TypeReference<AccessibilityOutageResponses.AccessibilityOutagesResponse>() {},
            cacheProperties.getAlertsTtl(),
            () -> service.getAccessibilityOutages(asset)
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
