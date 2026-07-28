package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalArrivalServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-28T19:48:00Z"), ZoneOffset.UTC);

    @Test
    void combinesFreshGoAndUpRowsAtSharedStations() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setEnabled(true);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-28T19:47:43Z");
        when(client.fetchGoNextService("BL")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of(
            arrival("regional-ki", "Kitchener GO", "2026-07-28T19:55:00Z")
        )));
        when(client.fetchUpTripUpdates("BL")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of(
            arrival("regional-up", "Pearson Airport", "2026-07-28T19:53:00Z")
        )));
        RegionalArrivalService service = new RegionalArrivalService(client, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("bloor");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).extracting(RegionalArrivalResponses.ArrivalResponse::lineId)
            .containsExactly("regional-up", "regional-ki");
        assertThat(response.arrivals().getFirst().minutes()).isEqualTo(5);
        verify(client).fetchGoNextService("BL");
        verify(client).fetchUpTripUpdates("BL");
    }

    @Test
    void reportsDisabledWithoutCallingUpstream() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalArrivalService service = new RegionalArrivalService(
            client,
            new RegionalArrivalProperties(),
            CLOCK
        );

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("union");

        assertThat(response.availability()).isEqualTo("disabled");
        assertThat(response.arrivals()).isEmpty();
    }

    private RegionalArrivalRecord arrival(String lineId, String direction, String predictedAt) {
        OffsetDateTime time = OffsetDateTime.parse(predictedAt);
        return new RegionalArrivalRecord(
            lineId, direction, time.minusMinutes(1), time, "", "1234", "Metrolinx test feed"
        );
    }
}
