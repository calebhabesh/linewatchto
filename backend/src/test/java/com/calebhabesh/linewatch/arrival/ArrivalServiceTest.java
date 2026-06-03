package com.calebhabesh.linewatch.arrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ArrivalServiceTest {
    private PublicArrivalClient client;
    private ArrivalProperties properties;
    private Clock clock;
    private ArrivalService service;

    private final StationResponses.StationLineResponse line1Response =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#f4c430", "Northbound / Southbound", true, true);
    private final StationResponses.StationLineResponse line2Response =
        new StationResponses.StationLineResponse("line-2", "2", "Bloor-Danforth", "#14a44d", "Eastbound / Westbound", true, true);

    @BeforeEach
    void setUp() {
        client = mock(PublicArrivalClient.class);
        properties = new ArrivalProperties();
        clock = Clock.fixed(Instant.parse("2026-06-03T12:00:00Z"), ZoneId.of("UTC"));
        service = new ArrivalService(client, properties, clock);
    }

    @Test
    void arrivalsForReturnsDemoPredictionsWhenDisabled() {
        properties.setEnabled(false);

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(2);
        assertThat(predictions.get(0).status()).isEqualTo("demo");
        assertThat(predictions.get(0).source()).isEqualTo("Demo estimates");
        verifyNoInteractions(client);
    }

    @Test
    void arrivalsForReturnsUnavailableStateWhenClientThrows() {
        properties.setEnabled(true);
        when(client.fetchArrivals("SPA_PLAT_L1_N")).thenThrow(new RuntimeException("API error"));
        when(client.fetchArrivals("SPA_PLAT_L1_S")).thenThrow(new RuntimeException("API error"));

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(2);
        assertThat(predictions.get(0).status()).isEqualTo("unavailable");
        assertThat(predictions.get(0).source()).isEqualTo("Arrival source unavailable");
        assertThat(predictions.get(0).minutes()).isNull();
    }

    @Test
    void arrivalsForFiltersByLineDirectionAndStalenessAndSorts() {
        properties.setEnabled(true);

        OffsetDateTime freshTime = OffsetDateTime.now(clock).minusMinutes(2);
        OffsetDateTime staleTime = OffsetDateTime.now(clock).minusMinutes(6);

        // spadina line-1 maps to stops: SPA_PLAT_L1_N (Northbound) and SPA_PLAT_L1_S (Southbound)
        when(client.fetchArrivals("SPA_PLAT_L1_N")).thenReturn(List.of(
            new ArrivalPrediction("line-1", "Northbound", 8, freshTime, "TTC Live Predictions", "live"),
            new ArrivalPrediction("line-1", "Northbound", 1, staleTime, "TTC Live Predictions", "live") // stale, should be filtered
        ));
        when(client.fetchArrivals("SPA_PLAT_L1_S")).thenReturn(List.of(
            new ArrivalPrediction("line-1", "Southbound", 3, freshTime, "TTC Live Predictions", "live"),
            new ArrivalPrediction("line-2", "Southbound", 10, freshTime, "TTC Live Predictions", "live") // wrong line for this query
        ));

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(2);
        // Sorted by minutes: 3 first, then 8
        assertThat(predictions.get(0).minutes()).isEqualTo(3);
        assertThat(predictions.get(0).direction()).isEqualTo("Southbound");
        assertThat(predictions.get(0).status()).isEqualTo("live");

        assertThat(predictions.get(1).minutes()).isEqualTo(8);
        assertThat(predictions.get(1).direction()).isEqualTo("Northbound");
        assertThat(predictions.get(1).status()).isEqualTo("live");
    }
}
