package com.calebhabesh.linewatch.streetcarposition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceScheduleCatalog;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TtcStreetcarPositionIndexerTest {
    private static final OffsetDateTime HEADER = OffsetDateTime.parse("2026-11-02T22:00:00Z");

    private final TtcSurfaceScheduleCatalog schedule = mock(TtcSurfaceScheduleCatalog.class);
    private final TtcStreetcarPositionIndexer indexer = new TtcStreetcarPositionIndexer(schedule);

    private static TtcSurfaceScheduleCatalog.Catalog catalog() {
        return new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of(
                "504", new TtcSurfaceScheduleCatalog.Route("504", "504", "King", "streetcar"),
                "503", new TtcSurfaceScheduleCatalog.Route("503", "503", "Kingston Rd", "streetcar"),
                "29", new TtcSurfaceScheduleCatalog.Route("29", "29", "Dufferin", "bus")),
            Map.of("x", new TtcSurfaceScheduleCatalog.Stop("x", "union", "Union", "")),
            Map.of(
                "t-504", new TtcSurfaceScheduleCatalog.Trip("t-504", "504", "East - 504 King towards Broadview Station"),
                "t-504c", new TtcSurfaceScheduleCatalog.Trip("t-504c", "504", "East - 504C King Replacement Bus towards Distillery"),
                "t-503", new TtcSurfaceScheduleCatalog.Trip("t-503", "503", "East - 503 Kingston Rd Replacement Bus towards Victoria Park"),
                "t-29", new TtcSurfaceScheduleCatalog.Trip("t-29", "29", "North - 29 Dufferin towards Wilson Station")),
            Map.of(),
            Set.of("union"));
    }

    private static TtcVehiclePositionParser.Vehicle vehicle(String id, String trip, OffsetDateTime reportedAt) {
        return new TtcVehiclePositionParser.Vehicle(id, trip, null, "SCHEDULED", 43.6445, -79.399, 90.0,
            reportedAt, "s-spadina", "IN_TRANSIT_TO");
    }

    @Test
    void keepsOnlyCarsOnStreetcarTripsTheScheduleKnows() {
        when(schedule.active()).thenReturn(catalog());
        OffsetDateTime at = HEADER.minusSeconds(40);

        TtcStreetcarPositionSnapshot snapshot = indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(
            vehicle("4508", "t-504", at),
            vehicle("3216", "t-504c", at),   // replacement bus on a streetcar route
            vehicle("6725", "t-503", at),    // the all-bus 503
            vehicle("8100", "t-29", at),     // a bus route
            vehicle("4520", null, at),       // yard move, no trip
            vehicle("4497", "t-unknown", at), // trip not in the schedule
            vehicle("4510", "t-504", null)   // no report time, so no age
        )), HEADER.plusSeconds(1));

        assertThat(snapshot.scheduleAvailable()).isTrue();
        assertThat(snapshot.vehicles()).singleElement().satisfies(car -> {
            assertThat(car.vehicleId()).isEqualTo("4508");
            assertThat(car.route()).isEqualTo("504");
            assertThat(car.routeName()).isEqualTo("King");
            assertThat(car.destination()).isEqualTo("East - 504 King towards Broadview Station");
        });
        assertThat(snapshot.omitted()).isEqualTo(new TtcStreetcarPositionSnapshot.Omitted(1, 1, 2, 1));
    }

    @Test
    void aCarReportedTwiceKeepsItsNewestPosition() {
        when(schedule.active()).thenReturn(catalog());
        TtcStreetcarPositionSnapshot snapshot = indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(
            vehicle("4508", "t-504", HEADER.minusSeconds(90)),
            vehicle("4508", "t-504", HEADER.minusSeconds(20)),
            vehicle("4508", "t-504", HEADER.minusSeconds(60))
        )), HEADER);

        assertThat(snapshot.vehicles()).singleElement()
            .satisfies(car -> assertThat(car.reportedAt()).isEqualTo(HEADER.minusSeconds(20)));
    }

    @Test
    void withoutAnActiveScheduleNoCarCanBeIdentified() {
        when(schedule.active()).thenReturn(TtcSurfaceScheduleCatalog.Catalog.empty());
        TtcStreetcarPositionSnapshot snapshot = indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(
            vehicle("4508", "t-504", HEADER))), HEADER);

        assertThat(snapshot.scheduleAvailable()).isFalse();
        assertThat(snapshot.vehicles()).isEmpty();
    }
}
