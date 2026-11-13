package com.calebhabesh.linewatch.ingestion;

import java.util.List;

public record FeedApplicationCounts(
    int recordsFetched,
    int recordsStaged,
    int recordsNormalized,
    int recordsUnmatched,
    List<QuarantinedRecord> quarantined
) {
    public FeedApplicationCounts {
        quarantined = quarantined == null ? List.of() : List.copyOf(quarantined);
    }

    public FeedApplicationCounts(
        int recordsFetched,
        int recordsStaged,
        int recordsNormalized,
        int recordsUnmatched
    ) {
        this(recordsFetched, recordsStaged, recordsNormalized, recordsUnmatched, List.of());
    }
}
