package com.calebhabesh.linewatch.announcement;

import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import tools.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/announcements")
public class TtcAnnouncementController {
    private final TtcAnnouncementService service;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;

    public TtcAnnouncementController(
        TtcAnnouncementService service,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.service = service;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
    }

    @GetMapping
    public TtcAnnouncementResponses.Response announcements(
        @RequestParam(name = "query", required = false) String query,
        @RequestParam(name = "limit", required = false) Integer limit
    ) {
        boolean cacheable = (query == null || query.isBlank()) && limit == null;
        if (!cacheable) {
            return service.getAnnouncements(query, limit);
        }
        return cache.getOrCompute(
            "ttc-announcements",
            new TypeReference<TtcAnnouncementResponses.Response>() {},
            cacheProperties.getAlertsTtl(),
            () -> service.getAnnouncements(null, null)
        );
    }
}
