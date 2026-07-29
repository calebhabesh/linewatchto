package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalTrainMarkerServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-28T19:48:00Z"), ZoneOffset.UTC);

    @Test
    void combinesFreshVehicleSourcesAndLabelsPartialAvailability() {
        MetrolinxVehiclePositionClient client = mock(MetrolinxVehiclePositionClient.class);
        RegionalTrainMarkerProperties properties = new RegionalTrainMarkerProperties();
        properties.setEnabled(true);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-28T19:47:30Z");
        when(client.fetchGo()).thenReturn(new RegionalTrainMarkerFeed(updatedAt, "GO source", List.of(
            marker(updatedAt)
        )));
        when(client.fetchUp()).thenThrow(new MetrolinxClientException("unavailable"));

        MutableClock clock = new MutableClock(CLOCK.instant(), CLOCK.getZone());
        RegionalTrainMarkerService service = new RegionalTrainMarkerService(client, properties, clock);
        RegionalTrainMarkerService.Snapshot result = service.markers();
        double firstProgress = result.markers().getFirst().progress();
        clock.advance(Duration.ofSeconds(1));
        RegionalTrainMarkerService.Snapshot nextResult = service.markers();

        assertThat(result.fresh()).isTrue();
        assertThat(result.availability()).isEqualTo("partial-source");
        assertThat(result.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.progress()).isGreaterThan(0.5);
            assertThat(marker.segmentTravelSeconds()).isEqualTo(420);
        });
        assertThat(nextResult.markers().getFirst().progress()).isGreaterThan(firstProgress);
        assertThat(result.disclaimer()).contains("not exact physical train locations");
        verify(client).fetchGo();
        verify(client).fetchUp();
    }

    @Test
    void reportsDisabledWithoutFetchingFeeds() {
        MetrolinxVehiclePositionClient client = mock(MetrolinxVehiclePositionClient.class);
        RegionalTrainMarkerService.Snapshot result = new RegionalTrainMarkerService(
            client, new RegionalTrainMarkerProperties(), CLOCK
        ).markers();

        assertThat(result.fresh()).isFalse();
        assertThat(result.availability()).isEqualTo("disabled");
        verifyNoInteractions(client);
    }

    private RegionalTrainMarkerRecord marker(OffsetDateTime updatedAt) {
        return new RegionalTrainMarkerRecord("go-1", "regional-ki", "Outbound", "forward",
            "segment-ki-mount-dennis-weston", "mount-dennis", "weston", "weston", 0.5,
            420, updatedAt.plusSeconds(210), true, "cab-1", "trip-1", updatedAt, "GO source");
    }

    private static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zone;

        private MutableClock(Instant instant, ZoneId zone) {
            this.instant = instant;
            this.zone = zone;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId requestedZone) {
            return new MutableClock(instant, requestedZone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
