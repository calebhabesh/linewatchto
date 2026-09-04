package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import com.calebhabesh.linewatch.ingestion.AlertIngestionProperties;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.Optional;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/ingestion")
public class IngestionHealthController {
    private final IngestionRunStore store;
    private final IngestionFreshness ingestionFreshness;
    private final DashboardCacheService cache;
    private final DashboardCacheProperties cacheProperties;
    private final AlertIngestionProperties ingestionProperties;
    private final TtcFeedAvailabilityService availabilityService;

    public IngestionHealthController(
        IngestionRunStore store,
        IngestionFreshness ingestionFreshness,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties,
        AlertIngestionProperties ingestionProperties,
        TtcFeedAvailabilityService availabilityService
    ) {
        this.store = store;
        this.ingestionFreshness = ingestionFreshness;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
        this.ingestionProperties = ingestionProperties;
        this.availabilityService = availabilityService;
    }

    @GetMapping
    public IngestionHealthResponse ingestion() {
        return cache.getOrCompute(
            "health:ingestion",
            new TypeReference<IngestionHealthResponse>() {},
            cacheProperties.getIngestionHealthTtl(),
            this::buildIngestion
        );
    }

    private IngestionHealthResponse buildIngestion() {
        return store.findLatest()
            .map(this::toResponse)
            .orElseGet(() -> new IngestionHealthResponse(
                "not-run", false, null, null, 0, 0, 0, 0, null,
                ingestionProperties.isSubwayClosureSupplementEnabled(), false, 0,
                availabilityService.summarize(), publicSourceEndpoint()
            ));
    }

    private IngestionHealthResponse toResponse(IngestionRunSnapshot run) {
        return new IngestionHealthResponse(
            run.status(),
            ingestionFreshness.isDashboardFresh(),
            run.startedAt(),
            run.completedAt(),
            run.recordsFetched(),
            run.recordsStaged(),
            run.recordsNormalized(),
            run.recordsUnmatched(),
            run.sourceFeedUpdatedAt(),
            ingestionProperties.isSubwayClosureSupplementEnabled(),
            run.subwayClosureSupplementAvailable(),
            run.subwayClosureRecordsFetched(),
            availabilityService.summarize(),
            publicSourceEndpoint()
        );
    }

    private String publicSourceEndpoint() {
        URI endpoint = ingestionProperties.getUrl();
        if (endpoint == null
            || !"https".equalsIgnoreCase(endpoint.getScheme())
            || endpoint.getHost() == null
            || !(endpoint.getHost().equalsIgnoreCase("ttc.ca")
                || endpoint.getHost().toLowerCase(java.util.Locale.ROOT).endsWith(".ttc.ca"))) {
            return null;
        }
        String path = endpoint.getRawPath() == null ? "" : endpoint.getRawPath();
        return "https://" + endpoint.getHost().toLowerCase(java.util.Locale.ROOT) + path;
    }

    public record IngestionHealthResponse(
        String status,
        boolean dashboardLive,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        int recordsFetched,
        int recordsStaged,
        int recordsNormalized,
        int recordsUnmatched,
        OffsetDateTime sourceFeedUpdatedAt,
        boolean subwayClosureSupplementEnabled,
        boolean subwayClosureSupplementAvailable,
        int subwayClosureRecordsFetched,
        TtcFeedAvailabilityService.TtcFeedAvailability feedAvailability,
        String sourceEndpoint
    ) {}
}
