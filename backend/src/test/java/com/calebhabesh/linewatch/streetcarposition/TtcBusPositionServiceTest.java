package com.calebhabesh.linewatch.streetcarposition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcBusPositionServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-03T13:00:00Z");
    private final BusPositionProperties busProperties = new BusPositionProperties();
    private final StreetcarPositionProperties feedProperties = new StreetcarPositionProperties();
    private final TtcBusPositionCache cache = new TtcBusPositionCache();
    private final TtcBusPositionService service = new TtcBusPositionService(
        busProperties, feedProperties, cache, Clock.fixed(Instant.from(NOW), ZoneOffset.UTC));

    private static TtcBusPositionSnapshot.BusPosition bus(String id, double lat, double lng, OffsetDateTime reportedAt) {
        return new TtcBusPositionSnapshot.BusPosition(id, "t-" + id, "29", "Dufferin",
            "North - 29 Dufferin towards Wilson Station", lat, lng, 0.0, reportedAt, false);
    }

    private void snapshot(OffsetDateTime header, TtcBusPositionSnapshot.BusPosition... buses) {
        cache.replace(new TtcBusPositionSnapshot(header, header, true, List.of(buses),
            new TtcBusPositionSnapshot.Omitted(0, 0, 0, 0)));
    }

    @Test
    void disabledByDefaultEvenWhenStreetcarsAreOn() {
        feedProperties.setEnabled(true);
        snapshot(NOW.minusSeconds(10), bus("8100", 43.66, -79.435, NOW.minusSeconds(30)));

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("disabled");
        assertThat(response.vehicles()).isEmpty();
    }

    @Test
    void unavailableBeforeAReadOrWithoutASchedule() {
        busProperties.setEnabled(true);
        assertThat(service.positions(null).state()).isEqualTo("unavailable");

        cache.replace(new TtcBusPositionSnapshot(NOW, NOW, false, List.of(),
            new TtcBusPositionSnapshot.Omitted(0, 0, 0, 0)));
        assertThat(service.positions(null).state()).isEqualTo("unavailable");
        assertThat(service.positions(null).vehicles()).isEmpty();
    }

    @Test
    void aFreshSourceIsLiveWithEachBusAgedAndOldReportsDropped() {
        busProperties.setEnabled(true);
        snapshot(NOW.minusSeconds(20),
            bus("fresh", 43.66, -79.435, NOW.minusSeconds(25)),
            bus("old", 43.66, -79.435, NOW.minusSeconds(150)),
            bus("gone", 43.66, -79.435, NOW.minusSeconds(301)));

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("live");
        assertThat(response.refreshSeconds()).isEqualTo(15);
        assertThat(response.vehicles()).extracting(BusPositionResponses.Vehicle::vehicleId).containsExactly("fresh", "old");
        assertThat(response.vehicles().get(0).ageSeconds()).isEqualTo(25);
        assertThat(response.vehicles().get(0).stale()).isFalse();
        assertThat(response.vehicles().get(1).stale()).isTrue();
    }

    @Test
    void aStaleSourceMarksEveryBusStale() {
        busProperties.setEnabled(true);
        snapshot(NOW.minusSeconds(121), bus("recent", 43.66, -79.435, NOW.minusSeconds(100)));

        var response = service.positions(null);

        assertThat(response.state()).isEqualTo("stale");
        assertThat(response.vehicles()).singleElement().satisfies(v -> assertThat(v.stale()).isTrue());
    }

    @Test
    void anAreaKeepsOnlyTheBusesInside() {
        busProperties.setEnabled(true);
        snapshot(NOW.minusSeconds(10),
            bus("downtown", 43.650, -79.390, NOW.minusSeconds(20)),
            bus("scarborough", 43.775, -79.257, NOW.minusSeconds(20)));

        var response = service.positions(BusPositionResponses.Bounds.parse("-79.42,43.63,-79.36,43.67"));

        assertThat(response.vehicles()).extracting(BusPositionResponses.Vehicle::vehicleId).containsExactly("downtown");
    }

    @Test
    void anAreaMustBeOrderedFiniteAndAroundToronto() {
        assertThatThrownBy(() -> BusPositionResponses.Bounds.parse("-79.36,43.63,-79.42,43.67"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BusPositionResponses.Bounds.parse("-79.42,43.63,-79.36"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BusPositionResponses.Bounds.parse("NaN,43.63,-79.36,43.67"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BusPositionResponses.Bounds.parse("2.2,48.8,2.4,48.9"))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
