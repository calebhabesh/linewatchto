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
            Map.of(),
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

    @Test
    void indexesEveryStopForTheStopViewWithoutChangingTheStationView() {
        TtcSurfaceScheduleCatalog repository = mock(TtcSurfaceScheduleCatalog.class);
        when(repository.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of("504", new TtcSurfaceScheduleCatalog.Route("504", "504", "King", "streetcar")),
            Map.of("3737", new TtcSurfaceScheduleCatalog.Stop("3737", "broadview", "Broadview Station at Bay 7", "Bay 7")),
            Map.of("trip-1", new TtcSurfaceScheduleCatalog.Trip("trip-1", "504", "West - 504A King towards Dundas West Station")),
            Map.of(),
            Set.of("broadview")
        ));
        OffsetDateTime atStation = OffsetDateTime.parse("2026-08-14T12:05:00Z");
        OffsetDateTime onStreet = OffsetDateTime.parse("2026-08-14T12:09:00Z");

        TtcSurfaceArrivalSnapshot snapshot = new TtcSurfaceArrivalIndexer(repository).index("streetcar",
            new TtcSurfaceTripUpdateParser.Feed(OffsetDateTime.parse("2026-08-14T12:00:00Z"), List.of(
                new TtcSurfaceTripUpdateParser.TripUpdate("trip-1", "504", List.of(
                    new TtcSurfaceTripUpdateParser.StopUpdate("3737", new TtcSurfaceTripUpdateParser.Event(atStation, 0)),
                    new TtcSurfaceTripUpdateParser.StopUpdate("2120", new TtcSurfaceTripUpdateParser.Event(onStreet, 60))
                )))), OffsetDateTime.parse("2026-08-14T12:00:01Z"));

        assertThat(snapshot.arrivals()).singleElement()
            .satisfies(arrival -> assertThat(arrival.stationId()).isEqualTo("broadview"));
        assertThat(snapshot.arrivalsAt("2120")).singleElement().satisfies(arrival -> {
            assertThat(arrival.route()).isEqualTo("504");
            assertThat(arrival.destination()).isEqualTo("West - 504A King towards Dundas West Station");
            assertThat(arrival.predictedAt()).isEqualTo(onStreet);
            assertThat(arrival.scheduledAt()).isEqualTo(onStreet.minusMinutes(1));
            assertThat(arrival.status()).isEqualTo("live");
        });
        assertThat(snapshot.arrivalsAt("3737")).hasSize(1);
    }

    @Test
    void indexesNightStreetcarArrivalsForKingStationOnStreetStops() {
        TtcSurfaceScheduleCatalog repository = mock(TtcSurfaceScheduleCatalog.class);
        when(repository.active()).thenReturn(new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of("304", new TtcSurfaceScheduleCatalog.Route("304", "304", "King", "streetcar")),
            Map.of("11177", new TtcSurfaceScheduleCatalog.Stop("11177", "king", "King St West at Yonge St East Side - King Station", "")),
            Map.of("trip-night-1", new TtcSurfaceScheduleCatalog.Trip("trip-night-1", "304", "East - 304 King towards Broadview Station")),
            Map.of(),
            Set.of("king")
        ));
        TtcSurfaceArrivalIndexer indexer = new TtcSurfaceArrivalIndexer(repository);
        OffsetDateTime predicted = OffsetDateTime.parse("2026-08-19T04:05:00Z");

        TtcSurfaceArrivalSnapshot snapshot = indexer.index("streetcar", new TtcSurfaceTripUpdateParser.Feed(
            OffsetDateTime.parse("2026-08-19T04:00:00Z"),
            List.of(new TtcSurfaceTripUpdateParser.TripUpdate(
                "trip-night-1", "304", List.of(new TtcSurfaceTripUpdateParser.StopUpdate(
                    "11177", new TtcSurfaceTripUpdateParser.Event(predicted, 0)
                ))
            ))
        ), OffsetDateTime.parse("2026-08-19T04:00:01Z"));

        assertThat(snapshot.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.stationId()).isEqualTo("king");
            assertThat(arrival.route()).isEqualTo("304");
            assertThat(arrival.destination()).isEqualTo("East - 304 King towards Broadview Station");
            assertThat(arrival.stopName()).isEqualTo("King St West at Yonge St East Side - King Station");
            assertThat(arrival.predictedAt()).isEqualTo(predicted);
        });
    }

    @Test
    void indexesArrivalsUsingDefaultConnectionsCatalog() {
        TtcSurfaceScheduleCatalog repository = mock(TtcSurfaceScheduleCatalog.class);
        when(repository.active()).thenReturn(TtcSurfaceScheduleCatalog.Catalog.defaults());
        TtcSurfaceArrivalIndexer indexer = new TtcSurfaceArrivalIndexer(repository);
        OffsetDateTime predicted = OffsetDateTime.parse("2026-08-19T04:08:00Z");

        TtcSurfaceArrivalSnapshot snapshot = indexer.index("streetcar", new TtcSurfaceTripUpdateParser.Feed(
            OffsetDateTime.parse("2026-08-19T04:00:00Z"),
            List.of(new TtcSurfaceTripUpdateParser.TripUpdate(
                "trip-night-2", "304", List.of(new TtcSurfaceTripUpdateParser.StopUpdate(
                    "11177", new TtcSurfaceTripUpdateParser.Event(predicted, 120)
                ))
            ))
        ), OffsetDateTime.parse("2026-08-19T04:00:01Z"));

        assertThat(snapshot.arrivals()).singleElement().satisfies(arrival -> {
            assertThat(arrival.stationId()).isEqualTo("king");
            assertThat(arrival.route()).isEqualTo("304");
            assertThat(arrival.stopName()).isEqualTo("King St West at Yonge St East Side - King Station");
        });
    }
}
