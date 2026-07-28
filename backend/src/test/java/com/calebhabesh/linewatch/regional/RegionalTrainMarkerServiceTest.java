package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
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

        RegionalTrainMarkerService.Snapshot result = new RegionalTrainMarkerService(client, properties, CLOCK).markers();

        assertThat(result.fresh()).isTrue();
        assertThat(result.availability()).isEqualTo("partial-source");
        assertThat(result.markers()).singleElement();
        assertThat(result.disclaimer()).contains("not exact physical train locations");
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
            "segment-ki-bloor-weston", "bloor", "weston", "weston", 0.5,
            "cab-1", "trip-1", updatedAt, "GO source");
    }
}
