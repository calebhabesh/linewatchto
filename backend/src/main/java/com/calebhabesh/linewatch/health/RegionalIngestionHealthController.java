package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.MetrolinxSourceSystem;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
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
        Map<String, RegionalIngestionRunStore.SourceStatus> sourceStatuses = run == null
            ? Map.of()
            : runStore.findSourceStatuses(run.id()).stream().collect(Collectors.toMap(
                RegionalIngestionRunStore.SourceStatus::sourceSystem,
                Function.identity()
            ));
        List<CollectionHealth> collections = MetrolinxSourceSystem.descriptors().stream()
            .map(descriptor -> collectionHealth(descriptor, sourceStatuses.get(descriptor.sourceSystem()), run))
            .toList();
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
            collections
        );
    }

    private CollectionHealth collectionHealth(
        MetrolinxSourceSystem.Descriptor descriptor,
        RegionalIngestionRunStore.SourceStatus sourceStatus,
        IngestionRunSnapshot run
    ) {
        String status = sourceStatus != null
            ? sourceStatus.complete() ? "complete" : "unavailable"
            : run == null ? "not-run"
            : !"success".equals(run.status()) ? "not-evaluated" : "unknown";
        return new CollectionHealth(
            descriptor.sourceSystem(),
            descriptor.label(),
            descriptor.kind(),
            descriptor.required(),
            status,
            sourceStatus == null ? 0 : sourceStatus.recordsFetched(),
            sourceStatus == null ? null : sourceStatus.sourceUpdatedAt()
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
        List<CollectionHealth> collections
    ) {}

    public record CollectionHealth(
        String sourceSystem,
        String label,
        String kind,
        boolean required,
        String status,
        int recordsFetched,
        OffsetDateTime sourceUpdatedAt
    ) {}
}
