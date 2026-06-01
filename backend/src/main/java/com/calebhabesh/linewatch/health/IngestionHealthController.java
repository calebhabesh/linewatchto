package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot;
import com.calebhabesh.linewatch.ingestion.IngestionRunStore;
import java.time.OffsetDateTime;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/ingestion")
public class IngestionHealthController {
    private final IngestionRunStore store;

    public IngestionHealthController(IngestionRunStore store) {
        this.store = store;
    }

    @GetMapping
    public IngestionHealthResponse ingestion() {
        return store.findLatest()
            .map(this::toResponse)
            .orElseGet(() -> new IngestionHealthResponse(
                "not-run", false, null, null, 0, 0, 0, 0, null, null
            ));
    }

    private IngestionHealthResponse toResponse(IngestionRunSnapshot run) {
        return new IngestionHealthResponse(
            run.status(),
            false,
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
