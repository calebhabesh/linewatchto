package com.calebhabesh.linewatch.streetcarposition;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcStreetcarPositionServiceTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-02T22:00:00Z");
    private final StreetcarPositionProperties properties = new StreetcarPositionProperties();
    private final TtcStreetcarPositionCache cache = new TtcStreetcarPositionCache();
    private final TtcStreetcarPositionService service = new TtcStreetcarPositionService(
        properties, cache, Clock.fixed(Instant.from(NOW), ZoneOffset.UTC));

    private static TtcStreetcarPositionSnapshot.StreetcarPosition car(String id, OffsetDateTime reportedAt) {
        return new TtcStreetcarPositionSnapshot.StreetcarPosition(id, "t-" + id, "504", "King",
            "East - 504 King towards Broadview Station", 43.6445, -79.399, 90.0, reportedAt);
    }

    private void snapshot(OffsetDateTime header, TtcStreetcarPositionSnapshot.StreetcarPosition... cars) {
        cache.replace(new TtcStreetcarPositionSnapshot(header, header, true, List.of(cars),
            new TtcStreetcarPositionSnapshot.Omitted(0, 0, 0, 0)));
    }

    @Test
    void disabledByDefaultAndCarriesNoCarsEvenWithAReadInHand() {
        snapshot(NOW.minusSeconds(10), car("4508", NOW.minusSeconds(30)));

        var response = service.positions();

        assertThat(response.state()).isEqualTo("disabled");
        assertThat(response.vehicles()).isEmpty();
    }

    @Test
    void unavailableBeforeAReadOrWithoutASchedule() {
        properties.setEnabled(true);
        assertThat(service.positions().state()).isEqualTo("unavailable");

        cache.replace(new TtcStreetcarPositionSnapshot(NOW, NOW, false, List.of(),
            new TtcStreetcarPositionSnapshot.Omitted(0, 0, 0, 0)));
        assertThat(service.positions().state()).isEqualTo("unavailable");
        assertThat(service.positions().vehicles()).isEmpty();
    }

    @Test
    void aFreshSourceIsLiveAndEachCarCarriesItsOwnAgeAndStaleState() {
        properties.setEnabled(true);
        snapshot(NOW.minusSeconds(20),
            car("fresh", NOW.minusSeconds(44)),
            car("old", NOW.minusSeconds(150)),
            car("gone", NOW.minusSeconds(301)),
            car("ahead", NOW.plusSeconds(5)));

        var response = service.positions();

        assertThat(response.state()).isEqualTo("live");
        assertThat(response.vehicleStaleAfterSeconds()).isEqualTo(120);
        assertThat(response.vehicleMaxAgeSeconds()).isEqualTo(300);
        assertThat(response.vehicles()).extracting(v -> v.vehicleId()).containsExactly("fresh", "old", "ahead");
        assertThat(response.vehicles().get(0)).satisfies(v -> {
            assertThat(v.ageSeconds()).isEqualTo(44);
            assertThat(v.stale()).isFalse();
        });
        assertThat(response.vehicles().get(1).stale()).isTrue();
        // A report stamped ahead of the server clock is not negative.
        assertThat(response.vehicles().get(2).ageSeconds()).isZero();
    }

    @Test
    void aStaleSourceMarksEveryCarStaleAndAgesThemOut() {
        properties.setEnabled(true);
        snapshot(NOW.minusSeconds(121), car("recent", NOW.minusSeconds(100)), car("gone", NOW.minusSeconds(400)));

        var response = service.positions();

        assertThat(response.state()).isEqualTo("stale");
        assertThat(response.sourceUpdatedAt()).isEqualTo(NOW.minusSeconds(121));
        assertThat(response.vehicles()).singleElement().satisfies(v -> {
            assertThat(v.vehicleId()).isEqualTo("recent");
            assertThat(v.stale()).isTrue();
        });
    }
}
