package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

public record TtcAlertFeed(
    OffsetDateTime lastUpdated,
    List<TtcFetchedRecord> routes,
    List<TtcFetchedRecord> accessibility
) {
    public int fetchedCount() {
        return routes.size() + accessibility.size();
    }
}
