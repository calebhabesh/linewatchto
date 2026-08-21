package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import com.calebhabesh.linewatch.commute.CommuteTravelTimeRepository;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GtfsRtSubwayTrainMarkerServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-07-02T10:00:00Z"), ZoneOffset.UTC);

    private ArrivalProperties properties;
    private GtfsRtSubwayArrivalCache cache;
    private LineSegmentRepository lineSegmentRepository;
    private CommuteTravelTimeRepository travelTimeRepository;
    private GtfsRtSubwayTrainMarkerService service;

    @BeforeEach
    void setUp() {
        properties = new ArrivalProperties();
        properties.setProvider(ArrivalProperties.ProviderMode.LIVE);
        properties.setScheduleHorizon(java.time.Duration.ofMinutes(90));
        cache = new GtfsRtSubwayArrivalCache(properties, CLOCK);
        lineSegmentRepository = mock(LineSegmentRepository.class);
        travelTimeRepository = mock(CommuteTravelTimeRepository.class);
        service = new GtfsRtSubwayTrainMarkerService(
            cache,
            lineSegmentRepository,
            travelTimeRepository,
            properties,
            CLOCK,
            new SubwayOperatingWindow(CLOCK)
        );
    }

    @Test
    void estimatesMarkerBetweenPreviousTopologyStationAndNextPredictedStop() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isTrue();
        assertThat(snapshot.source()).isEqualTo("TTC GTFS-RT subway trip updates");
        assertThat(snapshot.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.id()).isEqualTo("line-2:126789:232:eastbound:bay");
            assertThat(marker.lineId()).isEqualTo("line-2");
            assertThat(marker.direction()).isEqualTo("Eastbound");
            assertThat(marker.travelDirection()).isEqualTo("forward");
            assertThat(marker.segmentId()).isEqualTo("line-2-st-george-bay");
            assertThat(marker.fromStationId()).isEqualTo("st-george");
            assertThat(marker.toStationId()).isEqualTo("bay");
            assertThat(marker.nextStationId()).isEqualTo("bay");
            assertThat(marker.progress()).isBetween(0.32, 0.34);
            assertThat(marker.segmentTravelSeconds()).isEqualTo(120);
            assertThat(marker.predictedAt()).isEqualTo(now.plusSeconds(80));
            assertThat(marker.vehicleId()).isEqualTo("232");
            assertThat(marker.tripId()).isEqualTo("126789");
        });
    }

    @Test
    void collapsesConflictingDirectionRowsForTheSameVehicle() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "north-york-centre",
                "line-1",
                "Northbound",
                now.plusSeconds(80),
                null,
                "5",
                "131599829",
                "stop-north-york-centre-nb",
                117,
                400
            ),
            new GtfsRtSubwayStationArrival(
                "north-york-centre",
                "line-1",
                "Southbound",
                now.plusSeconds(85),
                null,
                "5",
                "131599829",
                "stop-north-york-centre-sb",
                5,
                400
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-sheppard-yonge-north-york-centre", "line-1", "sheppard-yonge", "north-york-centre", 330, "northbound"),
            segment("line-1-north-york-centre-finch", "line-1", "north-york-centre", "finch", 331, "northbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.markers()).singleElement()
            .extracting(EstimatedTrainMarker::vehicleId).isEqualTo("5");
    }

    @Test
    void usesShorterMarkerHorizonThanStationArrivalHorizon() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "near-trip",
                "13753",
                19,
                16
            ),
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusMinutes(30),
                null,
                "233",
                "far-trip",
                "13753",
                19,
                16
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(properties.getScheduleHorizon()).isEqualTo(java.time.Duration.ofMinutes(90));
        assertThat(snapshot.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.tripId()).isEqualTo("near-trip");
            assertThat(marker.predictedAt()).isEqualTo(now.plusSeconds(80));
        });
    }

    @Test
    void returnsNoMarkersWhenLiveProviderIsDisabled() {
        properties.setProvider(ArrivalProperties.ProviderMode.SCHEDULED);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(OffsetDateTime.now(CLOCK), OffsetDateTime.now(CLOCK), List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", OffsetDateTime.now(CLOCK).plusSeconds(80), "232", "126789", "13753")
        )));

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isFalse();
        assertThat(snapshot.markers()).isEmpty();
        assertThat(snapshot.message()).isEqualTo("Live GTFS-RT train markers are disabled.");
    }

    @Test
    void returnsNoMarkersWhileSubwayOperatingWindowIsClosed() {
        Clock closedClock = Clock.fixed(Instant.parse("2026-07-03T06:20:00Z"), ZoneOffset.UTC);
        GtfsRtSubwayArrivalCache closedCache = new GtfsRtSubwayArrivalCache(properties, closedClock);
        OffsetDateTime now = OffsetDateTime.now(closedClock);
        closedCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        GtfsRtSubwayTrainMarkerService closedService = new GtfsRtSubwayTrainMarkerService(
            closedCache,
            lineSegmentRepository,
            travelTimeRepository,
            properties,
            closedClock,
            new SubwayOperatingWindow(closedClock)
        );

        EstimatedTrainMarkerSnapshot snapshot = closedService.estimatedMarkers();

        assertThat(snapshot.fresh()).isFalse();
        assertThat(snapshot.markers()).isEmpty();
        assertThat(snapshot.message()).isEqualTo(
            "Subway service is outside scheduled operating hours; estimated train markers are hidden until service resumes."
        );
        verifyNoInteractions(lineSegmentRepository, travelTimeRepository);
    }

    @Test
    void reusesComputedMarkerSnapshotForRepeatedRequestsWithinShortWindow() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot first = service.estimatedMarkers();
        EstimatedTrainMarkerSnapshot second = service.estimatedMarkers();

        assertThat(first.markers()).hasSize(1);
        assertThat(second.markers()).isEqualTo(first.markers());
        verify(lineSegmentRepository, times(1)).findAllByOrderBySortOrderAsc();
        verify(travelTimeRepository, times(1)).activeScheduleSignature();
        verify(travelTimeRepository, times(1)).findSeededFallbackSegmentWeights();
        verify(travelTimeRepository, times(1)).findActiveScheduledSegmentWeights();
    }

    @Test
    void recomputesMarkerSnapshotAfterOneSecondCacheWindow() {
        MutableClock mutableClock = new MutableClock(Instant.parse("2026-07-02T10:00:00Z"), ZoneOffset.UTC);
        GtfsRtSubwayArrivalCache mutableCache = new GtfsRtSubwayArrivalCache(properties, mutableClock);
        GtfsRtSubwayTrainMarkerService mutableService = new GtfsRtSubwayTrainMarkerService(
            mutableCache,
            lineSegmentRepository,
            travelTimeRepository,
            properties,
            mutableClock,
            new SubwayOperatingWindow(mutableClock)
        );
        OffsetDateTime now = OffsetDateTime.now(mutableClock);
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot first = mutableService.estimatedMarkers();
        mutableClock.advance(Duration.ofSeconds(2));
        EstimatedTrainMarkerSnapshot second = mutableService.estimatedMarkers();

        assertThat(first.markers()).hasSize(1);
        assertThat(second.generatedAt()).isEqualTo(now.plusSeconds(2));
        verify(lineSegmentRepository, times(2)).findAllByOrderBySortOrderAsc();
    }

    @Test
    void recomputesMarkerSnapshotWhenLiveFeedTimestampChanges() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(20), now.minusSeconds(18), List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", now.plusSeconds(80), "232", "trip-a", "13753")
        )));

        EstimatedTrainMarkerSnapshot first = service.estimatedMarkers();
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", now.plusSeconds(60), "233", "trip-b", "13753")
        )));
        EstimatedTrainMarkerSnapshot second = service.estimatedMarkers();

        assertThat(first.markers()).singleElement().extracting(EstimatedTrainMarker::vehicleId).isEqualTo("232");
        assertThat(second.markers()).extracting(EstimatedTrainMarker::vehicleId).containsExactlyInAnyOrder("232", "233");
        verify(lineSegmentRepository, times(2)).findAllByOrderBySortOrderAsc();
        verify(travelTimeRepository, times(2)).activeScheduleSignature();
        verify(travelTimeRepository, times(1)).findSeededFallbackSegmentWeights();
        verify(travelTimeRepository, times(1)).findActiveScheduledSegmentWeights();
    }

    @Test
    void retainsLastSeenMarkerAcrossBriefFeedGap() {
        MutableClock mutableClock = new MutableClock(Instant.parse("2026-07-02T10:00:00Z"), ZoneOffset.UTC);
        GtfsRtSubwayArrivalCache mutableCache = new GtfsRtSubwayArrivalCache(properties, mutableClock);
        GtfsRtSubwayTrainMarkerService mutableService = new GtfsRtSubwayTrainMarkerService(
            mutableCache,
            lineSegmentRepository,
            travelTimeRepository,
            properties,
            mutableClock,
            new SubwayOperatingWindow(mutableClock)
        );
        OffsetDateTime now = OffsetDateTime.now(mutableClock);
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-2-st-george-bay",
            new CommuteTravelTimeRepository.SegmentTravelTime("line-2-st-george-bay", 120, 25, CommuteTravelTimeRepository.GTFS_SOURCE)
        ));
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "bay",
                "line-2",
                "Eastbound",
                now.plusSeconds(80),
                null,
                "232",
                "126789",
                "13753",
                19,
                16
            )
        )));
        EstimatedTrainMarkerSnapshot first = mutableService.estimatedMarkers();

        mutableClock.advance(Duration.ofSeconds(10));
        OffsetDateTime gapNow = OffsetDateTime.now(mutableClock);
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(gapNow.minusSeconds(1), gapNow, List.of()));
        EstimatedTrainMarkerSnapshot duringGap = mutableService.estimatedMarkers();

        assertThat(first.markers()).singleElement().extracting(EstimatedTrainMarker::vehicleId).isEqualTo("232");
        assertThat(duringGap.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.id()).isEqualTo("line-2:126789:232:eastbound:bay");
            assertThat(marker.updatedAt()).isEqualTo(now);
        });

        mutableClock.advance(Duration.ofSeconds(21));
        OffsetDateTime expiredAt = OffsetDateTime.now(mutableClock);
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(expiredAt.minusSeconds(1), expiredAt, List.of()));

        assertThat(mutableService.estimatedMarkers().markers()).isEmpty();
    }

    @Test
    void usesVehicleIdentityToAvoidDuplicatingAReassignedTrip() {
        MutableClock mutableClock = new MutableClock(Instant.parse("2026-07-02T10:00:00Z"), ZoneOffset.UTC);
        GtfsRtSubwayArrivalCache mutableCache = new GtfsRtSubwayArrivalCache(properties, mutableClock);
        GtfsRtSubwayTrainMarkerService mutableService = new GtfsRtSubwayTrainMarkerService(
            mutableCache, lineSegmentRepository, travelTimeRepository, properties, mutableClock,
            new SubwayOperatingWindow(mutableClock)
        );
        OffsetDateTime now = OffsetDateTime.now(mutableClock);
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-st-george-bay", "line-2", "st-george", "bay", 315, "eastbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(1), now, List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", now.plusSeconds(80), "232", "trip-a", "13753")
        )));
        EstimatedTrainMarker firstMarker = mutableService.estimatedMarkers().markers().getFirst();

        mutableClock.advance(Duration.ofSeconds(2));
        OffsetDateTime next = OffsetDateTime.now(mutableClock);
        mutableCache.replace(new GtfsRtSubwayArrivalSnapshot(next.minusSeconds(1), next, List.of(
            new GtfsRtSubwayStationArrival("bay", "line-2", "Eastbound", next.plusSeconds(100), "232", "trip-b", "13753")
        )));

        assertThat(mutableService.estimatedMarkers().markers()).singleElement().satisfies(marker -> {
            assertThat(marker.tripId()).isEqualTo("trip-b");
            assertThat(marker.progress()).isEqualTo(firstMarker.progress());
        });
    }

    @Test
    void skipsAmbiguousNextStationPlacement() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival("union", "line-1", "Southbound", now.plusSeconds(60), "999", "trip-union", "stop-union")
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 220, "southbound"),
            segment("line-1-king-union", "line-1", "king", "union", 221, "southbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("no-active-gtfs-import");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isTrue();
        assertThat(snapshot.markers()).isEmpty();
    }

    @Test
    void placesUnionLoopMarkerWhenFollowingStopIdentifiesIncomingBranch() {
        OffsetDateTime now = OffsetDateTime.now(CLOCK);
        cache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
            new GtfsRtSubwayStationArrival(
                "union",
                "line-1",
                "Northbound",
                now.plusSeconds(60),
                null,
                "999",
                "trip-union",
                "stop-union",
                21,
                243
            ),
            new GtfsRtSubwayStationArrival(
                "king",
                "line-1",
                "Northbound",
                now.plusSeconds(150),
                null,
                "999",
                "trip-union",
                "stop-king",
                22,
                431
            )
        )));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 220, "southbound"),
            segment("line-1-king-union", "line-1", "king", "union", 221, "southbound")
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("no-active-gtfs-import");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        EstimatedTrainMarkerSnapshot snapshot = service.estimatedMarkers();

        assertThat(snapshot.fresh()).isTrue();
        assertThat(snapshot.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.segmentId()).isEqualTo("line-1-st-andrew-union");
            assertThat(marker.fromStationId()).isEqualTo("st-andrew");
            assertThat(marker.toStationId()).isEqualTo("union");
            assertThat(marker.nextStationId()).isEqualTo("union");
            assertThat(marker.travelDirection()).isEqualTo("forward");
        });
    }

    @Test
    void warmsSegmentWeightsWithoutComputingMarkers() {
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());
        when(travelTimeRepository.findSeededFallbackSegmentWeights()).thenReturn(Map.of());

        service.warmSegmentWeights();
        service.warmSegmentWeights();

        verifyNoInteractions(lineSegmentRepository);
        verify(travelTimeRepository, times(2)).activeScheduleSignature();
        verify(travelTimeRepository, times(1)).findSeededFallbackSegmentWeights();
        verify(travelTimeRepository, times(1)).findActiveScheduledSegmentWeights();
    }

    private LineSegmentEntity segment(String id, String lineId, String stationAId, String stationBId, int sortOrder, String forwardDirection) {
        return new LineSegmentEntity(id, lineId, stationAId, stationBId, null, null, sortOrder, forwardDirection, null, false, null, null);
    }

    private static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zone;

        private MutableClock(Instant instant, ZoneId zone) {
            this.instant = instant;
            this.zone = zone;
        }

        private void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
