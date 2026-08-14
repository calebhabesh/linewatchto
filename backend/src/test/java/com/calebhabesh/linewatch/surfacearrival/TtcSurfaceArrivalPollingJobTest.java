package com.calebhabesh.linewatch.surfacearrival;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.same;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TtcSurfaceArrivalPollingJobTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-14T14:00:00Z"), ZoneOffset.UTC);
    private static final URI COMBINED_FEED = URI.create("https://gtfsrt.ttc.ca/trips/update?format=text");

    private final SurfaceArrivalProperties properties = new SurfaceArrivalProperties();
    private final TtcSurfaceArrivalClient client = mock(TtcSurfaceArrivalClient.class);
    private final TtcSurfaceTripUpdateParser parser = mock(TtcSurfaceTripUpdateParser.class);
    private final TtcSurfaceArrivalIndexer indexer = mock(TtcSurfaceArrivalIndexer.class);
    private final TtcSurfaceArrivalCache cache = mock(TtcSurfaceArrivalCache.class);
    private final TtcSurfaceArrivalPollingJob job = new TtcSurfaceArrivalPollingJob(
        properties, client, parser, indexer, cache, CLOCK
    );

    @Test
    void disabledPollDoesNotFetchFeed() {
        job.refresh();

        verify(client, never()).fetch(COMBINED_FEED);
    }

    @Test
    void fetchesCombinedFeedOnceAndIndexesBothModes() {
        properties.setTtcEnabled(true);
        TtcSurfaceTripUpdateParser.Feed feed = new TtcSurfaceTripUpdateParser.Feed(null, List.of());
        OffsetDateTime indexedAt = OffsetDateTime.now(CLOCK);
        TtcSurfaceArrivalSnapshot bus = snapshot("bus", indexedAt);
        TtcSurfaceArrivalSnapshot streetcar = snapshot("streetcar", indexedAt);
        when(client.fetch(COMBINED_FEED)).thenReturn("combined-feed");
        when(parser.parse("combined-feed")).thenReturn(feed);
        when(indexer.index("bus", feed, indexedAt)).thenReturn(bus);
        when(indexer.index("streetcar", feed, indexedAt)).thenReturn(streetcar);

        job.refresh();

        verify(client, times(1)).fetch(COMBINED_FEED);
        verify(indexer).index("bus", feed, indexedAt);
        verify(indexer).index("streetcar", feed, indexedAt);
        verify(cache).replace(same(bus));
        verify(cache).replace(same(streetcar));
    }

    private TtcSurfaceArrivalSnapshot snapshot(String mode, OffsetDateTime indexedAt) {
        return new TtcSurfaceArrivalSnapshot(mode, null, indexedAt, true, Set.of(), List.of());
    }
}
