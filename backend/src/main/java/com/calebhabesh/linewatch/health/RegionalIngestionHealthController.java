package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/regional-ingestion")
public class RegionalIngestionHealthController {
    private final MetrolinxProperties properties;
    private final RegionalIngestionRunStore runStore;
    private final RegionalIngestionFreshness freshness;

    public RegionalIngestionHealthController(
        MetrolinxProperties properties,
        RegionalIngestionRunStore runStore,
        RegionalIngestionFreshness freshness
    ) {
        this.properties = properties;
        this.runStore = runStore;
        this.freshness = freshness;
    }

    @GetMapping
    public RegionalIngestionHealthResponse health() {
        Optional<IngestionRunSnapshot> latest = runStore.findLatest();
        IngestionRunSnapshot run = latest.orElse(null);
        return new RegionalIngestionHealthResponse(
            "Metrolinx Open API",
            properties.isEnabled(),
            properties.isConfigured(),
            freshness.remainingFreshness(latest).isPresent(),
            run == null ? "not-run" : run.status(),
            run == null ? null : run.startedAt(),
            run == null ? null : run.completedAt(),
            run == null ? null : run.sourceFeedUpdatedAt(),
            run == null ? 0 : run.recordsFetched(),
            run == null ? 0 : run.recordsNormalized(),
            run == null ? null : run.errorMessage()
        );
    }

    public record RegionalIngestionHealthResponse(
        String source,
        boolean enabled,
        boolean configured,
        boolean fresh,
        String status,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        OffsetDateTime sourceUpdatedAt,
        int recordsFetched,
        int recordsNormalized,
        String errorMessage
    ) {}
}
