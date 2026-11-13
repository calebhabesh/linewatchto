package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

public record TtcAlertFeed(
    OffsetDateTime lastUpdated,
    List<TtcFetchedRecord> routes,
    List<TtcFetchedRecord> accessibility,
    List<TtcFetchedRecord> siteWideAnnouncements,
    List<TtcFetchedRecord> generalAnnouncements,
    List<UnparsedRecord> unparsed
) {
    /** Staging section names, as stored in ttc_alert_source_records.source_section. */
    public static final String ROUTES = "routes";
    public static final String ACCESSIBILITY = "accessibility";
    public static final String SITE_WIDE_ANNOUNCEMENTS = "site-wide-announcements";
    public static final String GENERAL_ANNOUNCEMENTS = "general-announcements";

    /**
     * A record in a valid section whose shape could not be read (for example, a list field sent as
     * text). It is carried to the application step so the run can quarantine it and keep its
     * last-good rows, instead of failing the whole fetch.
     */
    public record UnparsedRecord(String section, String sourceId, String message) {}

    public TtcAlertFeed {
        unparsed = unparsed == null ? List.of() : List.copyOf(unparsed);
    }

    public TtcAlertFeed(
        OffsetDateTime lastUpdated,
        List<TtcFetchedRecord> routes,
        List<TtcFetchedRecord> accessibility,
        List<TtcFetchedRecord> siteWideAnnouncements,
        List<TtcFetchedRecord> generalAnnouncements
    ) {
        this(lastUpdated, routes, accessibility, siteWideAnnouncements, generalAnnouncements, List.of());
    }

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
            + generalAnnouncements.size()
            + unparsed.size();
    }
}
