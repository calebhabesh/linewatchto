package com.calebhabesh.linewatch.arrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.arrival.live.GtfsRtSubwayArrivalProvider;
import com.calebhabesh.linewatch.arrival.schedule.ScheduledArrivalProvider;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ArrivalServiceTest {
    private ScheduledArrivalProvider scheduledArrivalProvider;
    private GtfsRtSubwayArrivalProvider liveArrivalProvider;
    private ArrivalProperties properties;
    private Clock clock;
    private ArrivalService service;

    private final StationResponses.StationLineResponse line1Response =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#f4c430", "Northbound / Southbound", true, true);

    @BeforeEach
    void setUp() {
        scheduledArrivalProvider = mock(ScheduledArrivalProvider.class);
        liveArrivalProvider = mock(GtfsRtSubwayArrivalProvider.class);
        properties = new ArrivalProperties();
        clock = Clock.fixed(Instant.parse("2026-06-03T12:00:00Z"), ZoneId.of("UTC"));
        service = new ArrivalService(scheduledArrivalProvider, liveArrivalProvider, properties, clock);
    }

    @Test
    void arrivalsForUsesScheduledProviderByDefault() {
        when(scheduledArrivalProvider.arrivalsFor("spadina", List.of(line1Response))).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 3, OffsetDateTime.now(clock).plusMinutes(3), "TTC scheduled service")
        ));

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(1);
        assertThat(predictions.getFirst().status()).isEqualTo("scheduled");
        assertThat(predictions.getFirst().source()).isEqualTo("TTC scheduled service");
    }

    @Test
    void arrivalsForReturnsDemoPredictionsInDemoMode() {
        properties.setProvider(ArrivalProperties.ProviderMode.DEMO);

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(6);
        assertThat(predictions)
            .filteredOn(prediction -> prediction.direction().equals("Northbound"))
            .extracting(ArrivalPrediction::label)
            .containsExactly("2 min", "5 min", "8 min");
        assertThat(predictions)
            .filteredOn(prediction -> prediction.direction().equals("Southbound"))
            .extracting(ArrivalPrediction::label)
            .containsExactly("5 min", "8 min", "11 min");
        assertThat(predictions.get(0).status()).isEqualTo("demo");
        assertThat(predictions.get(0).source()).isEqualTo("Demo estimates");
        verifyNoInteractions(scheduledArrivalProvider);
    }

    @Test
    void arrivalsForReturnsUnavailableInUnavailableMode() {
        properties.setProvider(ArrivalProperties.ProviderMode.UNAVAILABLE);

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(2);
        assertThat(predictions.get(0).status()).isEqualTo("unavailable");
        assertThat(predictions.get(0).source()).isEqualTo("TTC scheduled service unavailable");
    }

    @Test
    void arrivalsForUsesLiveProviderInLiveMode() {
        properties.setProvider(ArrivalProperties.ProviderMode.LIVE);
        when(liveArrivalProvider.arrivalsFor("spadina", List.of(line1Response))).thenReturn(List.of(
            ArrivalPrediction.live("line-1", "Northbound", 2, OffsetDateTime.now(clock).plusMinutes(2), "TTC GTFS-RT subway trip updates")
        ));

        List<ArrivalPrediction> predictions = service.arrivalsFor("spadina", List.of(line1Response));

        assertThat(predictions).hasSize(1);
        assertThat(predictions.get(0).status()).isEqualTo("live");
        assertThat(predictions.get(0).source()).isEqualTo("TTC GTFS-RT subway trip updates");
        verifyNoInteractions(scheduledArrivalProvider);
    }
}
