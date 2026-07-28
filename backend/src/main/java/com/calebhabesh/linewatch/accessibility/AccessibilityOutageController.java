package com.calebhabesh.linewatch.accessibility;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.calebhabesh.linewatch.regional.RegionalAccessibilityOutageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/accessibility-outages")
public class AccessibilityOutageController {
    private final AccessibilityOutageService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final RegionalAccessibilityOutageService regionalService;

    public AccessibilityOutageController(
        AccessibilityOutageService service,
        RegionalAccessibilityOutageService regionalService,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.regionalService = regionalService;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public AccessibilityOutageResponses.AccessibilityOutagesResponse outages(
        @RequestParam(name = "asset", required = false) String asset,
        @RequestParam(name = "network", defaultValue = "ttc") String network
    ) {
        String normalizedNetwork = network.toLowerCase(java.util.Locale.CANADA);
        if (!normalizedNetwork.equals("ttc") && !normalizedNetwork.equals("regional")) {
            throw new IllegalArgumentException("Invalid network: " + network);
        }
        String cacheKey = "accessibility-outages:" + normalizedNetwork + ":" + (asset != null ? asset.toLowerCase() : "all");
        return cache.getOrCompute(
            cacheKey,
            new TypeReference<AccessibilityOutageResponses.AccessibilityOutagesResponse>() {},
            cacheProperties.getAlertsTtl(),
            () -> normalizedNetwork.equals("regional")
                ? regionalService.getAccessibilityOutages(asset)
                : service.getAccessibilityOutages(asset)
        );
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgumentException(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
}
