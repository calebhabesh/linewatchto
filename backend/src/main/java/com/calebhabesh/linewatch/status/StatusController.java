package com.calebhabesh.linewatch.status;

import com.calebhabesh.linewatch.alert.AlertDashboardService;
import com.calebhabesh.linewatch.alert.AlertRepository;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import java.time.Clock;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/status")
public class StatusController {

    private final StatusDashboardService statusDashboardService;

    @Autowired
    public StatusController(StatusDashboardService statusDashboardService) {
        this.statusDashboardService = Objects.requireNonNull(statusDashboardService, "statusDashboardService must not be null");
    }

    public StatusController(
        TransitLineRepository transitLineRepository,
        AlertRepository alertRepository,
        IngestionRunStore ingestionRunStore,
        IngestionFreshness ingestionFreshness,
        AlertDashboardService alertDashboardService,
        Clock clock,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this(new StatusDashboardService(
            transitLineRepository,
            alertRepository,
            ingestionRunStore,
            ingestionFreshness,
            alertDashboardService,
            clock,
            cache,
            cacheProperties
        ));
    }

    @GetMapping
    public StatusResponse getStatus() {
        return statusDashboardService.getStatus();
    }

    public record StatusResponse(GeneratedAtDto generatedAt, List<LineStatusDto> lines) {}
    public record GeneratedAtDto(String time, String date, boolean live, String lastPoll) {}
    public record LineStatusDto(String id, String number, String name, String route, String color, String status, String statusLabel, String summary, String updatedAgo) {}
}
