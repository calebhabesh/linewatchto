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

class TtcBusPositionIndexerTest {
    private static final OffsetDateTime HEADER = OffsetDateTime.parse("2026-11-03T13:00:00Z");

    private final TtcSurfaceScheduleCatalog schedule = mock(TtcSurfaceScheduleCatalog.class);
    private final TtcBusPositionIndexer indexer = new TtcBusPositionIndexer(schedule);

    private static TtcSurfaceScheduleCatalog.Catalog catalog() {
        return new TtcSurfaceScheduleCatalog.Catalog(
            42,
            Map.of(
                "504", new TtcSurfaceScheduleCatalog.Route("504", "504", "King", "streetcar"),
                "503", new TtcSurfaceScheduleCatalog.Route("503", "503", "Kingston Rd", "streetcar"),
                "29", new TtcSurfaceScheduleCatalog.Route("29", "29", "Dufferin", "bus"),
                "329", new TtcSurfaceScheduleCatalog.Route("329", "329", "Dufferin", "bus")),
            Map.of("x", new TtcSurfaceScheduleCatalog.Stop("x", "union", "Union", "")),
            Map.of(
                "t-504", new TtcSurfaceScheduleCatalog.Trip("t-504", "504", "East - 504 King towards Broadview Station"),
                "t-503", new TtcSurfaceScheduleCatalog.Trip("t-503", "503", "East - 503 Kingston Rd Replacement Bus towards Victoria Park"),
                "t-29", new TtcSurfaceScheduleCatalog.Trip("t-29", "29", "North - 29 Dufferin towards Wilson Station"),
                "t-329", new TtcSurfaceScheduleCatalog.Trip("t-329", "329", "North - 329 Dufferin towards Wilson Station")),
            Map.of(),
            Set.of("union"));
    }

    private static TtcVehiclePositionParser.Vehicle vehicle(String id, String trip, OffsetDateTime reportedAt) {
        return new TtcVehiclePositionParser.Vehicle(id, trip, null, "SCHEDULED", 43.66, -79.435, 0.0,
            reportedAt, "s-1", "IN_TRANSIT_TO");
    }

    @Test
    void keepsBusRoutesAndReplacementBusesButNotStreetcars() {
        when(schedule.active()).thenReturn(catalog());
        OffsetDateTime at = HEADER.minusSeconds(20);

        TtcBusPositionSnapshot snapshot = indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(
            vehicle("8100", "t-29", at),
            vehicle("8101", "t-329", at),     // night route: still a bus in service
            vehicle("6725", "t-503", at),     // replacement bus on a streetcar route
            vehicle("4508", "t-504", at),     // a streetcar, left to the streetcar indexer
            vehicle("8102", null, at),        // no trip (yard or out of service)
            vehicle("8103", "t-unknown", at), // trip not in the schedule
            vehicle("8104", "t-29", null)     // no report time, so no age
        )), HEADER.plusSeconds(1));

        assertThat(snapshot.scheduleAvailable()).isTrue();
        assertThat(snapshot.vehicles()).extracting(TtcBusPositionSnapshot.BusPosition::vehicleId)
            .containsExactly("8100", "8101", "6725");
        assertThat(snapshot.vehicles()).filteredOn(TtcBusPositionSnapshot.BusPosition::replacement)
            .singleElement().satisfies(bus -> {
                assertThat(bus.route()).isEqualTo("503");
                assertThat(bus.destination()).contains("Replacement Bus");
            });
        assertThat(snapshot.omitted()).isEqualTo(new TtcBusPositionSnapshot.Omitted(1, 1, 1, 1));
    }

    @Test
    void aBusOutsideTorontoIsNotAPosition() {
        when(schedule.active()).thenReturn(catalog());
        TtcVehiclePositionParser.Vehicle zero = new TtcVehiclePositionParser.Vehicle("8100", "t-29", null,
            "SCHEDULED", 0, 0, null, HEADER, null, null);

        assertThat(indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(zero)), HEADER).vehicles()).isEmpty();
    }

    @Test
    void withoutAnActiveScheduleNoBusCanBeIdentified() {
        when(schedule.active()).thenReturn(TtcSurfaceScheduleCatalog.Catalog.empty());
        TtcBusPositionSnapshot snapshot = indexer.index(new TtcVehiclePositionParser.Feed(HEADER, List.of(
            vehicle("8100", "t-29", HEADER))), HEADER);

        assertThat(snapshot.scheduleAvailable()).isFalse();
        assertThat(snapshot.vehicles()).isEmpty();
    }
}
