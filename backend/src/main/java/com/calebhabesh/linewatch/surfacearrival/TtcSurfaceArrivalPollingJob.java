package com.calebhabesh.linewatch.surfacearrival;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class TtcSurfaceArrivalPollingJob {
    private static final Logger log = LoggerFactory.getLogger(TtcSurfaceArrivalPollingJob.class);
    private final SurfaceArrivalProperties properties;
    private final TtcSurfaceArrivalClient client;
    private final TtcSurfaceTripUpdateParser parser;
    private final TtcSurfaceArrivalIndexer indexer;
    private final TtcSurfaceArrivalCache cache;
    private final Clock clock;

    public TtcSurfaceArrivalPollingJob(
        SurfaceArrivalProperties properties,
        TtcSurfaceArrivalClient client,
        TtcSurfaceTripUpdateParser parser,
        TtcSurfaceArrivalIndexer indexer,
        TtcSurfaceArrivalCache cache,
        Clock clock
    ) {
        this.properties = properties;
        this.client = client;
        this.parser = parser;
        this.indexer = indexer;
        this.cache = cache;
        this.clock = clock;
    }

    @Scheduled(
        initialDelayString = "${linewatch.surface-arrivals.ttc-initial-delay:PT10S}",
        fixedDelayString = "${linewatch.surface-arrivals.ttc-fixed-delay:PT15S}"
    )
    public void refresh() {
        if (!properties.isTtcEnabled()) return;
        try {
            TtcSurfaceTripUpdateParser.Feed feed = parser.parse(client.fetch(properties.getTtcTripUpdatesUrl()));
            OffsetDateTime indexedAt = OffsetDateTime.now(clock);
            refreshMode("bus", feed, indexedAt);
            refreshMode("streetcar", feed, indexedAt);
        } catch (Exception exception) {
            log.warn("Failed to refresh TTC bus and streetcar trip updates", exception);
        }
    }

    private void refreshMode(String mode, TtcSurfaceTripUpdateParser.Feed feed, OffsetDateTime indexedAt) {
        try {
            TtcSurfaceArrivalSnapshot snapshot = indexer.index(mode, feed, indexedAt);
            cache.replace(snapshot);
            log.info("Indexed {} TTC {} station-connection arrivals", snapshot.arrivals().size(), mode);
        } catch (Exception exception) {
            // Keep the last-good snapshot for this mode. Freshness gating happens on read.
            log.warn("Failed to index TTC {} trip updates", mode, exception);
        }
    }
}
