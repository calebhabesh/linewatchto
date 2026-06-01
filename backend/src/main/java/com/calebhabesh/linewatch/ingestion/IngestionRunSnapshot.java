package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;

public record IngestionRunSnapshot(
    long id,
    String status,
    OffsetDateTime startedAt,
    OffsetDateTime completedAt,
    int recordsFetched,
    int recordsStaged,
    int recordsNormalized,
    int recordsUnmatched,
    OffsetDateTime sourceFeedUpdatedAt,
    String errorMessage
) {}
