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
import java.time.ZoneOffset;
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
    private MutableClock clock;
    private GtfsRtSubwayArrivalCache cache;
    private GtfsRtSubwayArrivalProvider provider;

    private final StationResponses.StationLineResponse line1 =
        new StationResponses.StationLineResponse("line-1", "1", "Yonge-University", "#f4c430", "Northbound / Southbound", true, true);
    private final StationResponses.StationLineResponse line2 =
        new StationResponses.StationLineResponse("line-2", "2", "Bloor-Danforth", "#00843d", "Eastbound / Westbound", true, true);
    private final StationResponses.StationLineResponse line4 =
        new StationResponses.StationLineResponse("line-4", "4", "Sheppard", "#a15eb5", "Eastbound / Westbound", true, true);
    private final StationResponses.StationLineResponse line6 =
        new StationResponses.StationLineResponse("line-6", "6", "Finch West", "#d9261c", "Eastbound / Westbound", true, true);
    private final StationResponses.StationLineResponse line5 =
        new StationResponses.StationLineResponse("line-5", "5", "Eglinton Crosstown", "#eb8738", "Eastbound / Westbound", true, true);

    @BeforeEach
    void setUp() {
        properties = new ArrivalProperties();
        clock = new MutableClock(Instant.parse("2026-07-02T10:25:46Z"));
        cache = new GtfsRtSubwayArrivalCache(properties, clock);
        provider = new GtfsRtSubwayArrivalProvider(cache, scheduledArrivalProvider, properties, clock, new SubwayOperatingWindow(clock));
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
    void brieflyRetainsLastLiveDirectionsWhenAFreshSnapshotOmitsTheStation() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        properties.setLiveArrivalRetention(java.time.Duration.ofSeconds(30));
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now, now, List.of(
            new GtfsRtSubwayStationArrival(
                "cedarvale", "line-1", "Northbound", now.plusMinutes(3), "101", "trip-north", "stop-north"
            ),
            new GtfsRtSubwayStationArrival(
                "cedarvale", "line-1", "Southbound", now.plusMinutes(5), "102", "trip-south", "stop-south"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("cedarvale"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled(
                "line-1", "Yonge-University Line towards Vaughan Metropolitan Centre Station", 4,
                now.plusMinutes(4), "TTC scheduled service"
            ),
            ArrivalPrediction.scheduled(
                "line-1", "Yonge-University Line towards Finch Station", 6,
                now.plusMinutes(6), "TTC scheduled service"
            )
        ));

        assertThat(provider.arrivalsFor("cedarvale", List.of(line1)))
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Northbound", "live"),
                org.assertj.core.groups.Tuple.tuple("Southbound", "live")
            );

        clock.advance(java.time.Duration.ofSeconds(10));
        OffsetDateTime omittedAt = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(omittedAt, omittedAt, List.of()));

        assertThat(provider.arrivalsFor("cedarvale", List.of(line1)))
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Northbound", "live"),
                org.assertj.core.groups.Tuple.tuple("Southbound", "live")
            );

        clock.advance(java.time.Duration.ofSeconds(21));
        OffsetDateTime expiredAt = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(expiredAt, expiredAt, List.of()));

        assertThat(provider.arrivalsFor("cedarvale", List.of(line1)))
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(
                    "Yonge-University Line towards Vaughan Metropolitan Centre Station", "scheduled"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "Yonge-University Line towards Finch Station", "scheduled"
                )
            );
    }

    @Test
    void mapsScheduledLine1FallbackToTheCorrectCedarvalePlatformDirection() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now, now, List.of(
            new GtfsRtSubwayStationArrival(
                "cedarvale", "line-1", "Northbound", now.plusMinutes(3), "101", "trip-north", "stop-north"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("cedarvale"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled(
                "line-1", "Yonge-University Line towards Vaughan Metropolitan Centre Station", 4,
                now.plusMinutes(4), "TTC scheduled service"
            ),
            ArrivalPrediction.scheduled(
                "line-1", "Yonge-University Line towards Finch Station", 6,
                now.plusMinutes(6), "TTC scheduled service"
            )
        ));

        assertThat(provider.arrivalsFor("cedarvale", List.of(line1)))
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Northbound", "live"),
                org.assertj.core.groups.Tuple.tuple(
                    "Yonge-University Line towards Finch Station", "scheduled"
                )
            );
    }

    @Test
    void fillsTheMissingDirectionFromScheduleAtATerminalStation() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "finch",
                "line-1",
                "Northbound",
                now.plusMinutes(2),
                "101",
                "trip-live",
                "finch-stop"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("finch"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled(
                "line-1", "Northbound to Finch", 5, now.plusMinutes(5), "TTC scheduled service"
            ),
            ArrivalPrediction.scheduled(
                "line-1", "Southbound to Vaughan Metropolitan Centre", 6, now.plusMinutes(6),
                "TTC scheduled service"
            )
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("finch", List.of(line1));

        assertThat(predictions)
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Northbound", "live"),
                org.assertj.core.groups.Tuple.tuple("Southbound to Vaughan Metropolitan Centre", "scheduled")
            );
    }

    @Test
    void usesScheduledLine5HeadsignRowsForThePlatformMissingLivePredictions() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "sloane",
                "line-5",
                "Eastbound",
                now.plusMinutes(4),
                "377295",
                "131606660",
                "16075"
            )
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("sloane"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled(
                "line-5",
                "Eglinton Line towards Kennedy Station",
                6,
                now.plusMinutes(6),
                "TTC scheduled service"
            ),
            ArrivalPrediction.scheduled(
                "line-5",
                "Eglinton Line towards Mount Dennis Station",
                8,
                now.plusMinutes(8),
                "TTC scheduled service"
            )
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("sloane", List.of(line5));

        assertThat(predictions)
            .extracting(ArrivalPrediction::direction, ArrivalPrediction::status)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("Eastbound", "live"),
                org.assertj.core.groups.Tuple.tuple("Eglinton Line towards Mount Dennis Station", "scheduled")
            );
    }

    @Test
    void recognizesTerminalBasedScheduledHeadsignsAcrossRapidTransitLines() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        List<StationResponses.StationLineResponse> lines = List.of(line2, line4, line5, line6);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival("interchange", "line-2", "Eastbound", now.plusMinutes(2), "201", "trip-2", "stop-2"),
            new GtfsRtSubwayStationArrival("interchange", "line-4", "Eastbound", now.plusMinutes(2), "401", "trip-4", "stop-4"),
            new GtfsRtSubwayStationArrival("interchange", "line-5", "Eastbound", now.plusMinutes(2), "501", "trip-5", "stop-5"),
            new GtfsRtSubwayStationArrival("interchange", "line-6", "Eastbound", now.plusMinutes(2), "601", "trip-6", "stop-6")
        )));
        when(scheduledArrivalProvider.arrivalsFor(eq("interchange"), any())).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-2", "Bloor-Danforth Line towards Kennedy Station", 4, now.plusMinutes(4), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-2", "Bloor-Danforth Line towards Kipling Station", 6, now.plusMinutes(6), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-4", "Sheppard Line towards Don Mills Station", 4, now.plusMinutes(4), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-4", "Sheppard Line towards Sheppard Yonge Station", 6, now.plusMinutes(6), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-5", "Eglinton Line towards Kennedy Station", 4, now.plusMinutes(4), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-5", "Eglinton Line towards Mount Dennis Station", 6, now.plusMinutes(6), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-6", "Finch West Line towards Finch West Station", 4, now.plusMinutes(4), "TTC scheduled service"),
            ArrivalPrediction.scheduled("line-6", "Finch West Line towards Humber College Station", 6, now.plusMinutes(6), "TTC scheduled service")
        ));

        List<ArrivalPrediction> predictions = provider.arrivalsFor("interchange", lines);

        assertThat(predictions)
            .filteredOn(prediction -> prediction.status().equals("scheduled"))
            .extracting(ArrivalPrediction::lineId, ArrivalPrediction::direction)
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("line-2", "Bloor-Danforth Line towards Kipling Station"),
                org.assertj.core.groups.Tuple.tuple("line-4", "Sheppard Line towards Sheppard Yonge Station"),
                org.assertj.core.groups.Tuple.tuple("line-5", "Eglinton Line towards Mount Dennis Station"),
                org.assertj.core.groups.Tuple.tuple("line-6", "Finch West Line towards Humber College Station")
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
            afterDeparture,
            new SubwayOperatingWindow(afterDeparture)
        );

        List<ArrivalPrediction> expiredPredictions = expiredProvider.arrivalsFor("finch-west", List.of(line1));

        assertThat(expiredPredictions).hasSize(1);
        assertThat(expiredPredictions.getFirst().status()).isEqualTo("scheduled");
    }

    @Test
    void returnsScheduledDeparturesWhenSubwayIsClosedEvenIfCacheHasLiveArrivals() {
        // 07:15 UTC is 03:15 Toronto time (subway closed)
        Clock overnightClock = Clock.fixed(Instant.parse("2026-07-02T07:15:00Z"), ZoneId.of("UTC"));
        OffsetDateTime now = OffsetDateTime.now(overnightClock);
        GtfsRtSubwayArrivalCache overnightCache = new GtfsRtSubwayArrivalCache(properties, overnightClock);
        overnightCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "cedarvale",
                "line-1",
                "Northbound",
                now.plusMinutes(3),
                "123",
                "126607",
                "13791"
            )
        )));
        GtfsRtSubwayArrivalProvider overnightProvider = new GtfsRtSubwayArrivalProvider(
            overnightCache,
            scheduledArrivalProvider,
            properties,
            overnightClock,
            new SubwayOperatingWindow(overnightClock)
        );
        when(scheduledArrivalProvider.arrivalsFor("cedarvale", List.of(line1))).thenReturn(List.of(
            ArrivalPrediction.scheduled("line-1", "Northbound", 165, now.plusMinutes(165), "TTC scheduled service")
        ));
        List<ArrivalPrediction> predictions = overnightProvider.arrivalsFor("cedarvale", List.of(line1));

        assertThat(predictions).hasSize(1);
        assertThat(predictions.getFirst().status()).isEqualTo("scheduled");
    }

    @Test
    void exposesFreshSnapshotOnlyWhileGtfsRtFeedIsFresh() {
        OffsetDateTime now = OffsetDateTime.now(clock);
        GtfsRtSubwayArrivalSnapshot freshSnapshot = new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival(
                "finch-west",
                "line-1",
                "Northbound",
                now.plusMinutes(3),
                "123",
                "126607",
                "13791"
            )
        ));

        cache.replace(freshSnapshot);

        assertThat(cache.freshSnapshot()).contains(freshSnapshot);

        GtfsRtSubwayArrivalSnapshot staleSnapshot = new GtfsRtSubwayArrivalSnapshot(now.minusMinutes(6), now.minusMinutes(6), freshSnapshot.arrivals());
        cache.replace(staleSnapshot);

        assertThat(cache.freshSnapshot()).isEmpty();
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void advance(java.time.Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
