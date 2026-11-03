package com.calebhabesh.linewatch.streetcarposition;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class TtcStreetcarPositionPollingJob {
    private static final Logger log = LoggerFactory.getLogger(TtcStreetcarPositionPollingJob.class);
    private final StreetcarPositionProperties properties;
    private final TtcVehiclePositionClient client;
    private final TtcVehiclePositionParser parser;
    private final TtcStreetcarPositionIndexer indexer;
    private final TtcStreetcarPositionCache cache;
    private final BusPositionProperties busProperties;
    private final TtcBusPositionIndexer busIndexer;
    private final TtcBusPositionCache busCache;
    private final Clock clock;

    public TtcStreetcarPositionPollingJob(
        StreetcarPositionProperties properties,
        TtcVehiclePositionClient client,
        TtcVehiclePositionParser parser,
        TtcStreetcarPositionIndexer indexer,
        TtcStreetcarPositionCache cache,
        BusPositionProperties busProperties,
        TtcBusPositionIndexer busIndexer,
        TtcBusPositionCache busCache,
        Clock clock
    ) {
        this.properties = properties;
        this.client = client;
        this.parser = parser;
        this.indexer = indexer;
        this.cache = cache;
        this.busProperties = busProperties;
        this.busIndexer = busIndexer;
        this.busCache = busCache;
        this.clock = clock;
    }

    /** One feed read serves streetcars (S4) and buses (S8); each is indexed only when its own flag is on. */
    @Scheduled(
        initialDelayString = "${linewatch.streetcar-positions.initial-delay:PT12S}",
        fixedDelayString = "${linewatch.streetcar-positions.fixed-delay:PT15S}"
    )
    public void refresh() {
        boolean streetcars = properties.isEnabled();
        boolean buses = busProperties.isEnabled();
        if (!streetcars && !buses) return;
        TtcVehiclePositionParser.Feed feed;
        try {
            feed = parser.parse(client.fetch(properties.getUrl()));
        } catch (Exception exception) {
            // Keep the last-good snapshots; they turn stale on read as their header ages.
            log.warn("Failed to refresh TTC vehicle positions: {}", exception.toString());
            return;
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (streetcars) {
            try {
                TtcStreetcarPositionSnapshot snapshot = indexer.index(feed, now);
                cache.replace(snapshot);
                TtcStreetcarPositionSnapshot.Omitted omitted = snapshot.omitted();
                log.debug("Indexed {} TTC streetcar positions from {} vehicles (no trip {}, unmatched trip {}, "
                        + "replacement bus {}, no timestamp {})", snapshot.vehicles().size(), feed.vehicles().size(),
                    omitted.withoutTrip(), omitted.unmatchedTrip(), omitted.replacementBus(), omitted.withoutTimestamp());
            } catch (Exception exception) {
                log.warn("Failed to index TTC streetcar positions: {}", exception.toString());
            }
        }
        if (buses) {
            try {
                TtcBusPositionSnapshot snapshot = busIndexer.index(feed, now);
                busCache.replace(snapshot);
                TtcBusPositionSnapshot.Omitted omitted = snapshot.omitted();
                log.debug("Indexed {} TTC bus positions from {} vehicles (no trip {}, unmatched trip {}, "
                        + "streetcar {}, no timestamp {})", snapshot.vehicles().size(), feed.vehicles().size(),
                    omitted.withoutTrip(), omitted.unmatchedTrip(), omitted.streetcar(), omitted.withoutTimestamp());
            } catch (Exception exception) {
                log.warn("Failed to index TTC bus positions: {}", exception.toString());
            }
        }
    }
}
