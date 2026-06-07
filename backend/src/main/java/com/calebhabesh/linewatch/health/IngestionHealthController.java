package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.util.Optional;
import java.time.OffsetDateTime;
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

    public IngestionHealthController(
        IngestionRunStore store,
        IngestionFreshness ingestionFreshness,
        DashboardCacheService cache,
        DashboardCacheProperties cacheProperties
    ) {
        this.store = store;
        this.ingestionFreshness = ingestionFreshness;
        this.cache = cache;
        this.cacheProperties = cacheProperties;
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
                "not-run", false, null, null, 0, 0, 0, 0, null, null
            ));
    }

    private IngestionHealthResponse toResponse(IngestionRunSnapshot run) {
        return new IngestionHealthResponse(
            run.status(),
            ingestionFreshness.isFresh(Optional.of(run)),
            run.startedAt(),
            run.completedAt(),
            run.recordsFetched(),
            run.recordsStaged(),
            run.recordsNormalized(),
            run.recordsUnmatched(),
            run.sourceFeedUpdatedAt(),
            run.errorMessage()
        );
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
        String errorMessage
    ) {}
}
