package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

public record TtcAlertFeed(
    OffsetDateTime lastUpdated,
    List<TtcFetchedRecord> routes,
    List<TtcFetchedRecord> accessibility,
    List<TtcFetchedRecord> siteWideAnnouncements,
    List<TtcFetchedRecord> generalAnnouncements
) {
    public TtcAlertFeed(
        OffsetDateTime lastUpdated,
        List<TtcFetchedRecord> routes,
        List<TtcFetchedRecord> accessibility
    ) {
        this(lastUpdated, routes, accessibility, List.of(), List.of());
    }

    public int fetchedCount() {
        return routes.size()
            + accessibility.size()
            + siteWideAnnouncements.size()
            + generalAnnouncements.size();
    }
}
