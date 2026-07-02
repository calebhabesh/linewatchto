package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GtfsRtSubwayArrivalRefreshServiceTest {
    @Mock
    private GtfsRtSubwayArrivalClient client;

    @Mock
    private GtfsRtSubwayTripUpdateTextParser parser;

    @Mock
    private GtfsRtSubwayArrivalIndexer indexer;

    @Mock
    private GtfsRtSubwayArrivalCache cache;

    private final Clock clock = Clock.fixed(Instant.parse("2026-07-02T10:25:46Z"), ZoneId.of("UTC"));

    @Test
    void skipsIndexingWhenFeedTimestampHasNotChanged() {
        OffsetDateTime feedCreatedAt = OffsetDateTime.parse("2026-07-02T10:25:40Z");
        GtfsRtSubwayArrivalSnapshot cachedSnapshot = new GtfsRtSubwayArrivalSnapshot(feedCreatedAt, feedCreatedAt.plusSeconds(1), List.of());
        when(client.fetchTripUpdatesText()).thenReturn("header { timestamp: 1782987940 }");
        when(parser.feedCreatedAt("header { timestamp: 1782987940 }")).thenReturn(Optional.of(feedCreatedAt));
        when(cache.feedCreatedAt()).thenReturn(Optional.of(feedCreatedAt));
        when(cache.snapshot()).thenReturn(cachedSnapshot);

        GtfsRtSubwayArrivalRefreshService service =
            new GtfsRtSubwayArrivalRefreshService(client, parser, indexer, cache, clock);

        GtfsRtSubwayArrivalSnapshot refreshed = service.refresh();

        assertThat(refreshed).isSameAs(cachedSnapshot);
        verify(parser, never()).parse("header { timestamp: 1782987940 }");
        verify(indexer, never()).index(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(cache, never()).replace(org.mockito.ArgumentMatchers.any());
    }
}
