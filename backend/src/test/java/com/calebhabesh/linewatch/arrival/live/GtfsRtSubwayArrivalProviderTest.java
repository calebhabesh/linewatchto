package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalPrediction;
import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.arrival.schedule.ScheduledArrivalProvider;
import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GtfsRtSubwayArrivalProviderTest {
    @Mock
    private ScheduledArrivalProvider scheduledArrivalProvider;

    private ArrivalProperties properties;
    private Clock clock;
    private GtfsRtSubwayArrivalCache cache;
    private GtfsRtSubwayArrivalProvider provider;

    private final StationResponses.StationLineResponse line1 =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#f4c430", "Northbound / Southbound", true, true);
    private final StationResponses.StationLineResponse line6 =
        new StationResponses.StationLineResponse("line-6", "6", "Finch West", "#d9261c", "Eastbound / Westbound", true, true);

    @BeforeEach
    void setUp() {
        properties = new ArrivalProperties();
        clock = Clock.fixed(Instant.parse("2026-07-02T10:25:46Z"), ZoneId.of("UTC"));
        cache = new GtfsRtSubwayArrivalCache(properties, clock);
        provider = new GtfsRtSubwayArrivalProvider(cache, scheduledArrivalProvider, properties, clock);
    }

    @Test
    void usesFreshLivePredictionsAndFallsBackPerMissingDirectionOrLine() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "finch-west",
                "line-1",
                "Northbound",
                now.plusMinutes(3),
                "123",
                "126607",
                "13791"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("finch-west"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 5, now.plusMinutes(5), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-1", "Southbound to Vaughan Metropolitan Centre", 6, now.plusMinutes(6), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-6", "Eastbound to Finch West", 8, now.plusMinutes(8), "TTC scheduled service")
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("finch-west", List.of(line1, line6));

        assertThat(predictions)
            .extracting(ArrivalPrediction::lineId, ArrivalPrediction::direction, ArrivalPrediction::status, ArrivalPrediction::source)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("line-1", "Northbound", "live", "TTC GTFS-RT subway trip updates"),
                org.assertj.core.groups.Tuple.tuple("line-1", "Southbound to Vaughan Metropolitan Centre", "scheduled", "TTC scheduled service"),
                org.assertj.core.groups.Tuple.tuple("line-6", "Eastbound to Finch West", "scheduled", "TTC scheduled service")
            );
    }

    @Test
    void ignoresStaleLiveSnapshotAndUsesScheduledArrivals() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusMinutes(6), now.minusMinutes(6), List.of(
            new GtfsRtSubwayStationArrival(
                "st-george",
                "line-2",
                "Eastbound",
                now.plusMinutes(1),
                "232",
                "126789",
                "13756"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("st-george"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 4, now.plusMinutes(4), "TTC scheduled service")
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("st-george", List.of(line1));

        assertThat(predictions).hasSize(1);
        assertThat(predictions.getFirst().status()).isEqualTo("scheduled");
    }

    @Test
    void keepsDueLiveArrivalUntilExplicitGtfsRtDepartureThenFallsBack() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "finch-west",
                "line-1",
                "Northbound",
                now.minusSeconds(40),
                now.plusSeconds(20),
                "123",
                "126607",
                "13791"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("finch-west"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound to Finch", 5, now.plusMinutes(5), "TTC scheduled service")
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("finch-west", List.of(line1));

        assertThat(predictions).hasSize(1);
        assertThat(predictions.getFirst().status()).isEqualTo("live");
        assertThat(predictions.getFirst().label()).isEqualTo("Due");

        Clock afterDeparture = Clock.fixed(now.plusSeconds(51).toInstant(), ZoneId.of("UTC"));
        GtfsRtSubwayArrivalCache expiredCache = new GtfsRtSubwayArrivalCache(properties, afterDeparture);
        expiredCache.replace(cache.snapshot());
        GtfsRtSubwayArrivalProvider expiredProvider = new GtfsRtSubwayArrivalProvider(
            expiredCache,
            scheduledArrivalProvider,
            properties,
            afterDeparture
        );

        List<ArrivalPrediction> expiredPredictions = expiredProvider.arrivalsFor("finch-west", List.of(line1));

        assertThat(expiredPredictions).hasSize(1);
        assertThat(expiredPredictions.getFirst().status()).isEqualTo("scheduled");
    }
}
