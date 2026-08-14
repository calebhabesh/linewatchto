package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TtcSurfaceArrivalIndexerTest {
    @Test
    void joinsRealtimeStopAndTripIdsThroughTheStaticParentLinkedCatalog() {
        TtcSurfaceScheduleCatalog repository = mock(TtcSurfaceScheduleCatalog.class);
        when(repository.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of("504", new TtcSurfaceScheduleCatalog.Route("504", "504", "King", "streetcar")),
            Map.of("3737", new TtcSurfaceScheduleCatalog.Stop("3737", "broadview", "Broadview Station at Bay 7", "Bay 7")),
            Map.of("trip-1", new TtcSurfaceScheduleCatalog.Trip("trip-1", "504", "To Dundas West Station")),
            Set.of("broadview")
        ));
        TtcSurfaceArrivalIndexer indexer = new TtcSurfaceArrivalIndexer(repository);
        OffsetDateTime predicted = OffsetDateTime.parse("2026-08-14T12:05:00Z");

        TtcSurfaceArrivalSnapshot snapshot = indexer.index("streetcar", new TtcSurfaceTripUpdateParser.Feed(
            OffsetDateTime.parse("2026-08-14T12:00:00Z"),
            List.of(new TtcSurfaceTripUpdateParser.TripUpdate(
                "trip-1", "504", List.of(new TtcSurfaceTripUpdateParser.StopUpdate(
                    "3737", new TtcSurfaceTripUpdateParser.Event(predicted, 60)
                ))
            ))
        ), OffsetDateTime.parse("2026-08-14T12:00:01Z"));

        assertThat(snapshot.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.stationId()).isEqualTo("broadview");
            assertThat(arrival.route()).isEqualTo("504");
            assertThat(arrival.destination()).isEqualTo("To Dundas West Station");
            assertThat(arrival.bayPlatform()).isEqualTo("Bay 7");
            assertThat(arrival.scheduledAt()).isEqualTo(predicted.minusMinutes(1));
        });
    }
}
