package com.calebhabesh.linewatch.ingestion;

public record FeedApplicationCounts(
    int recordsFetched,
    int recordsStaged,
    int recordsNormalized,
    int recordsUnmatched
) {}
