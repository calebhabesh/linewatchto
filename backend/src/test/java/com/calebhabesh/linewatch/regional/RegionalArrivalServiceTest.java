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
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        when(scheduled.arrivals("bloor", List.of("regional-ki", "regional-up"))).thenReturn(List.of());
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

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
            mock(RegionalScheduledArrivalProvider.class),
            new RegionalArrivalProperties(),
            CLOCK
        );

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("union");

        assertThat(response.availability()).isEqualTo("disabled");
        assertThat(response.arrivals()).isEmpty();
    }

    @Test
    void returnsPublishedScheduleWhenRealtimeIsDisabled() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setScheduleEnabled(true);
        OffsetDateTime time = OffsetDateTime.parse("2026-07-29T10:32:00-04:00");
        when(scheduled.arrivals("milton", List.of("regional-mi"))).thenReturn(List.of(
            new RegionalArrivalRecord(
                "regional-mi", "Union Station", time, time, "1", "MI100",
                RegionalScheduledArrivalProvider.SOURCE, "scheduled"
            )
        ));
        when(scheduled.hasActiveSchedule(List.of("regional-mi"))).thenReturn(true);
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("milton");

        assertThat(response.availability()).isEqualTo("available");
        assertThat(response.arrivals()).singleElement()
            .extracting(RegionalArrivalResponses.ArrivalResponse::status)
            .isEqualTo("scheduled");
        assertThat(response.message()).isEqualTo("Published regional train schedule.");
    }

    @Test
    void keepsTheNextScheduledArrivalForEachDirectionOnInfrequentLines() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setScheduleEnabled(true);
        properties.setMaxArrivalsPerLine(2);
        when(scheduled.arrivals("milton", List.of("regional-mi"))).thenReturn(List.of(
            scheduledArrival("Milton GO", "2026-07-28T20:10:00Z", "MI201"),
            scheduledArrival("Milton GO", "2026-07-28T20:40:00Z", "MI203"),
            scheduledArrival("Union Station", "2026-07-29T10:32:00-04:00", "MI100")
        ));
        when(scheduled.hasActiveSchedule(List.of("regional-mi"))).thenReturn(true);
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("milton");

        assertThat(response.arrivals()).extracting(RegionalArrivalResponses.ArrivalResponse::direction)
            .containsExactly("Milton GO", "Milton GO", "Union Station");
    }

    @Test
    void usesScheduledRowsOnlyForLineDirectionsWithoutLivePredictions() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setEnabled(true);
        properties.setScheduleEnabled(true);
        properties.setMaxArrivalsPerLine(2);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-28T19:47:43Z");
        when(client.fetchGoNextService("WE")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of(
            arrival("regional-ki", "Union Station GO", "2026-07-28T19:55:00Z"),
            arrival("regional-ki", "Union Station GO", "2026-07-28T20:10:00Z")
        )));
        when(client.fetchUpTripUpdates("WE")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of()));
        when(scheduled.arrivals("weston", List.of("regional-ki", "regional-up"))).thenReturn(List.of(
            regionalScheduledArrival(
                "regional-ki", "KI - Union Station GO", "2026-07-28T19:55:00Z", "KI100"
            ),
            regionalScheduledArrival(
                "regional-ki", "KI - Bramalea GO", "2026-07-28T20:15:00Z", "KI201"
            ),
            regionalScheduledArrival(
                "regional-ki", "KI - Mount Pleasant GO", "2026-07-28T20:45:00Z", "KI203"
            ),
            regionalScheduledArrival(
                "regional-ki", "KI - Kitchener GO", "2026-07-28T21:15:00Z", "KI205"
            )
        ));
        when(scheduled.hasActiveSchedule(List.of("regional-ki", "regional-up"))).thenReturn(true);
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("weston");

        assertThat(response.arrivals())
            .extracting(
                RegionalArrivalResponses.ArrivalResponse::direction,
                RegionalArrivalResponses.ArrivalResponse::status
            )
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Union Station GO", "live"),
                org.assertj.core.groups.Tuple.tuple("Union Station GO", "live"),
                org.assertj.core.groups.Tuple.tuple("KI - Bramalea GO", "scheduled"),
                org.assertj.core.groups.Tuple.tuple("KI - Mount Pleasant GO", "scheduled")
            );
    }

    @Test
    void fillsTheMissingUpDirectionFromScheduleAtPearsonTerminal() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setEnabled(true);
        properties.setScheduleEnabled(true);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-28T19:47:43Z");
        when(client.fetchUpTripUpdates("PA")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of(
            arrival("regional-up", "Pearson Airport", "2026-07-28T19:50:00Z")
        )));
        when(scheduled.arrivals("pearson-airport", List.of("regional-up"))).thenReturn(List.of(
            regionalScheduledArrival(
                "regional-up", "Pearson Airport", "2026-07-28T20:00:00Z", "UP200"
            ),
            regionalScheduledArrival(
                "regional-up", "Union Station", "2026-07-28T19:55:00Z", "UP101"
            )
        ));
        when(scheduled.hasActiveSchedule(List.of("regional-up"))).thenReturn(true);
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("pearson-airport");

        assertThat(response.arrivals())
            .extracting(
                RegionalArrivalResponses.ArrivalResponse::direction,
                RegionalArrivalResponses.ArrivalResponse::status
            )
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Pearson Airport", "live"),
                org.assertj.core.groups.Tuple.tuple("Union Station", "scheduled")
            );
        assertThat(response.message()).isEqualTo("Fresh estimates with published schedule fallback.");
    }

    @Test
    void deduplicatesRepeatedRealtimeRowsBeforeBoundingDirections() {
        MetrolinxArrivalClient client = mock(MetrolinxArrivalClient.class);
        RegionalScheduledArrivalProvider scheduled = mock(RegionalScheduledArrivalProvider.class);
        RegionalArrivalProperties properties = new RegionalArrivalProperties();
        properties.setEnabled(true);
        OffsetDateTime updatedAt = OffsetDateTime.parse("2026-07-28T19:47:43Z");
        RegionalArrivalRecord repeated = arrival(
            "regional-ki", "Union Station GO", "2026-07-28T19:55:00Z"
        );
        when(client.fetchGoNextService("WE")).thenReturn(new RegionalArrivalFeed(
            updatedAt, List.of(repeated, repeated)
        ));
        when(client.fetchUpTripUpdates("WE")).thenReturn(new RegionalArrivalFeed(updatedAt, List.of()));
        when(scheduled.arrivals("weston", List.of("regional-ki", "regional-up"))).thenReturn(List.of());
        RegionalArrivalService service = new RegionalArrivalService(client, scheduled, properties, CLOCK);

        RegionalArrivalResponses.SnapshotResponse response = service.arrivals("weston");

        assertThat(response.arrivals()).hasSize(1);
    }

    private RegionalArrivalRecord scheduledArrival(String direction, String predictedAt, String tripNumber) {
        return regionalScheduledArrival("regional-mi", direction, predictedAt, tripNumber);
    }

    private RegionalArrivalRecord regionalScheduledArrival(
        String lineId,
        String direction,
        String predictedAt,
        String tripNumber
    ) {
        OffsetDateTime time = OffsetDateTime.parse(predictedAt);
        return new RegionalArrivalRecord(
            lineId, direction, time, time, "", tripNumber,
            RegionalScheduledArrivalProvider.SOURCE, "scheduled"
        );
    }

    private RegionalArrivalRecord arrival(String lineId, String direction, String predictedAt) {
        OffsetDateTime time = OffsetDateTime.parse(predictedAt);
        return new RegionalArrivalRecord(
            lineId, direction, time.minusMinutes(1), time, "", "1234", "Metrolinx test feed", "live"
        );
    }
}
