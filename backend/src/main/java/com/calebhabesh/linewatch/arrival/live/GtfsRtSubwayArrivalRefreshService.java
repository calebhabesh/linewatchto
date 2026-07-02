package com.calebhabesh.linewatch.arrival.live;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;

@Service
public class GtfsRtSubwayArrivalRefreshService {
    private final GtfsRtSubwayArrivalClient client;
    private final GtfsRtSubwayTripUpdateTextParser parser;
    private final GtfsRtSubwayArrivalIndexer indexer;
    private final GtfsRtSubwayArrivalCache cache;
    private final Clock clock;

    public GtfsRtSubwayArrivalRefreshService(
        GtfsRtSubwayArrivalClient client,
        GtfsRtSubwayTripUpdateTextParser parser,
        GtfsRtSubwayArrivalIndexer indexer,
        GtfsRtSubwayArrivalCache cache,
        Clock clock
    ) {
        this.client = client;
        this.parser = parser;
        this.indexer = indexer;
        this.cache = cache;
        this.clock = clock;
    }

    public GtfsRtSubwayArrivalSnapshot refresh() {
        String body = client.fetchTripUpdatesText();
        GtfsRtSubwayTripUpdateFeed feed = parser.parse(body);
        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, OffsetDateTime.now(clock));
        cache.replace(snapshot);
        return snapshot;
    }
}
