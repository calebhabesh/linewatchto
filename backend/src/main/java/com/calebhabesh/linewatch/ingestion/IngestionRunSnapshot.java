package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

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
    int subwayClosureRecordsFetched,
    int recordsQuarantined,
    List<String> quarantinedRecords
) {
    public IngestionRunSnapshot {
        quarantinedRecords = quarantinedRecords == null ? List.of() : List.copyOf(quarantinedRecords);
    }

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
        String errorMessage,
        boolean subwayClosureSupplementAvailable,
        int subwayClosureRecordsFetched
    ) {
        this(
            id, status, startedAt, completedAt, recordsFetched, recordsStaged, recordsNormalized,
            recordsUnmatched, sourceFeedUpdatedAt, errorMessage, subwayClosureSupplementAvailable,
            subwayClosureRecordsFetched, 0, List.of()
        );
    }

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
