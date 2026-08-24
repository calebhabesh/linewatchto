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
    String errorMessage,
    boolean subwayClosureSupplementAvailable,
    int subwayClosureRecordsFetched
) {
    public IngestionRunSnapshot(
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
    ) {
        this(
            id,
            status,
            startedAt,
            completedAt,
            recordsFetched,
            recordsStaged,
            recordsNormalized,
            recordsUnmatched,
            sourceFeedUpdatedAt,
            errorMessage,
            false,
            0
        );
    }
}
