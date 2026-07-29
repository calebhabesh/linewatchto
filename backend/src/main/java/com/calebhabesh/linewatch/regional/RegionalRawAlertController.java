package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/regional/alerts/raw")
public class RegionalRawAlertController {
    private final RegionalAlertStore alertStore;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public RegionalRawAlertController(
        RegionalAlertStore alertStore,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.alertStore = alertStore;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public List<RawAlertDto> getRawAlerts() {
        return cache.getOrCompute(
            "alerts:raw:regional",
            new TypeReference<List<RawAlertDto>>() {},
            cacheProperties.getAlertsTtl(),
            alertStore::findRawAlerts
        );
    }
}
