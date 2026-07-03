package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GtfsRtSubwayArrivalIndexerTest {
    @Mock
    private GtfsScheduleReadRepository repository;

    @Mock
    private LineSegmentRepository lineSegmentRepository;

    @Test
    void indexesTripUpdatesThroughActiveGtfsStationStopMappings() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository, lineSegmentRepository);
        OffsetDateTime feedCreatedAt = epoch(1782987933);
        OffsetDateTime indexedAt = feedCreatedAt.plusSeconds(2);
        GtfsRtSubwayTripUpdateFeed feed = new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, List.of(
            new GtfsRtSubwayTripUpdate(
                "subway-126789|East",
                "126789",
                "2",
                "line-2",
                "Eastbound",
                "232",
                List.of(
                    new GtfsRtSubwayStopTimeUpdate("13756", 18, epoch(1782988036), epoch(1782988051)),
                    new GtfsRtSubwayStopTimeUpdate("13753", 19, epoch(1782988096)),
                    new GtfsRtSubwayStopTimeUpdate("unmapped", 20, epoch(1782988156))
                )
            )
        ));

        when(repository.findActiveImportId()).thenReturn(Optional.of(42L));
        when(repository.findStationMappings(eq(42L), eq("line-2"), eq(List.of("13756", "13753", "unmapped"))))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("13756", "st-george", 15),
                new GtfsScheduleReadRepository.StationMapping("13753", "bay", 16)
            ));

        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, indexedAt);

        assertThat(snapshot.feedCreatedAt()).isEqualTo(feedCreatedAt);
        assertThat(snapshot.indexedAt()).isEqualTo(indexedAt);
        assertThat(snapshot.arrivals())
            .extracting(
                GtfsRtSubwayStationArrival::stationId,
                GtfsRtSubwayStationArrival::lineId,
                GtfsRtSubwayStationArrival::direction,
                GtfsRtSubwayStationArrival::predictedAt,
                GtfsRtSubwayStationArrival::departureAt,
                GtfsRtSubwayStationArrival::vehicleId,
                GtfsRtSubwayStationArrival::tripId,
                GtfsRtSubwayStationArrival::stopId,
                GtfsRtSubwayStationArrival::stopSequence,
                GtfsRtSubwayStationArrival::stationSortOrder
            )
            .containsExactly(
                tuple("st-george", "line-2", "Eastbound", epoch(1782988036), epoch(1782988051), "232", "126789", "13756", 18, 15),
                tuple("bay", "line-2", "Eastbound", epoch(1782988096), null, "232", "126789", "13753", 19, 16)
            );
    }

    @Test
    void infersLineOnePlatformDirectionFromAdjacentMappedStops() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository, lineSegmentRepository);
        OffsetDateTime feedCreatedAt = epoch(1782987933);
        GtfsRtSubwayTripUpdateFeed feed = new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, List.of(
            new GtfsRtSubwayTripUpdate(
                "subway-126123|South",
                "126123",
                "1",
                "line-1",
                "Southbound",
                "101",
                List.of(
                    new GtfsRtSubwayStopTimeUpdate("ST_ANDREW_N", 21, epoch(1782988036)),
                    new GtfsRtSubwayStopTimeUpdate("OSGOODE_N", 22, epoch(1782988096))
                )
            )
        ));

        when(repository.findActiveImportId()).thenReturn(Optional.of(42L));
        when(repository.findStationMappings(eq(42L), eq("line-1"), eq(List.of("ST_ANDREW_N", "OSGOODE_N"))))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("ST_ANDREW_N", "st-andrew", 242),
                new GtfsScheduleReadRepository.StationMapping("OSGOODE_N", "osgoode", 240)
            ));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-osgoode-st-andrew", "line-1", "osgoode", "st-andrew", 120, "southbound")
        ));

        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, feedCreatedAt.plusSeconds(1));

        assertThat(snapshot.arrivals())
            .extracting(GtfsRtSubwayStationArrival::stationId, GtfsRtSubwayStationArrival::direction)
            .containsExactly(
                tuple("st-andrew", "Northbound"),
                tuple("osgoode", "Northbound")
            );
    }

    @Test
    void keepsLineOneUnionTripDirectionToPreserveSeparateTerminalQueues() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository, lineSegmentRepository);
        OffsetDateTime feedCreatedAt = epoch(1782987933);
        GtfsRtSubwayTripUpdateFeed feed = new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, List.of(
            new GtfsRtSubwayTripUpdate(
                "subway-126124|South",
                "126124",
                "1",
                "line-1",
                "Southbound",
                "102",
                List.of(
                    new GtfsRtSubwayStopTimeUpdate("UNION_S", 21, epoch(1782988036)),
                    new GtfsRtSubwayStopTimeUpdate("ST_ANDREW_S", 22, epoch(1782988096))
                )
            )
        ));

        when(repository.findActiveImportId()).thenReturn(Optional.of(42L));
        when(repository.findStationMappings(eq(42L), eq("line-1"), eq(List.of("UNION_S", "ST_ANDREW_S"))))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("UNION_S", "union", 243),
                new GtfsScheduleReadRepository.StationMapping("ST_ANDREW_S", "st-andrew", 242)
            ));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 121, "southbound")
        ));

        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, feedCreatedAt.plusSeconds(1));

        assertThat(snapshot.arrivals())
            .extracting(GtfsRtSubwayStationArrival::stationId, GtfsRtSubwayStationArrival::direction)
            .containsExactly(
                tuple("union", "Southbound"),
                tuple("st-andrew", "Northbound")
            );
    }

    @Test
    void fillsMissingStAndrewSouthboundWhenTtcGtfsRtSkipsThePlatformStop() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository, lineSegmentRepository);
        OffsetDateTime feedCreatedAt = epoch(1782987933);
        GtfsRtSubwayTripUpdateFeed feed = new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, List.of(
            new GtfsRtSubwayTripUpdate(
                "subway-131599737|South",
                "131599737",
                "1",
                "line-1",
                "Southbound",
                "188",
                List.of(
                    new GtfsRtSubwayStopTimeUpdate("13819", 20, epoch(1782988036)),
                    new GtfsRtSubwayStopTimeUpdate("13816", 22, epoch(1782988096))
                )
            )
        ));

        when(repository.findActiveImportId()).thenReturn(Optional.of(42L));
        when(repository.findStationMappings(eq(42L), eq("line-1"), eq(List.of("13819", "13816"))))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("13819", "osgoode", 240),
                new GtfsScheduleReadRepository.StationMapping("13816", "union", 243)
            ));
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-osgoode-st-andrew", "line-1", "osgoode", "st-andrew", 120, "southbound"),
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 121, "southbound")
        ));

        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, feedCreatedAt.plusSeconds(1));

        assertThat(snapshot.arrivals())
            .extracting(
                GtfsRtSubwayStationArrival::stationId,
                GtfsRtSubwayStationArrival::direction,
                GtfsRtSubwayStationArrival::predictedAt,
                GtfsRtSubwayStationArrival::stopId,
                GtfsRtSubwayStationArrival::stopSequence
            )
            .contains(
                tuple("st-andrew", "Southbound", epoch(1782988066), "18373", 21)
            );
    }

    @Test
    void returnsEmptySnapshotWhenStaticGtfsMappingsAreUnavailable() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository, lineSegmentRepository);
        OffsetDateTime feedCreatedAt = epoch(1782987933);
        GtfsRtSubwayTripUpdateFeed feed = new GtfsRtSubwayTripUpdateFeed(feedCreatedAt, List.of(
            new GtfsRtSubwayTripUpdate(
                "subway-127659|East",
                "127659",
                "4",
                "line-4",
                "Eastbound",
                "463",
                List.of(new GtfsRtSubwayStopTimeUpdate("14949", 5, epoch(1782988036)))
            )
        ));

        when(repository.findActiveImportId()).thenReturn(Optional.empty());

        GtfsRtSubwayArrivalSnapshot snapshot = indexer.index(feed, feedCreatedAt.plusSeconds(1));

        assertThat(snapshot.feedCreatedAt()).isEqualTo(feedCreatedAt);
        assertThat(snapshot.arrivals()).isEmpty();
    }

    private OffsetDateTime epoch(long epochSeconds) {
        return OffsetDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }

    private LineSegmentEntity segment(String id, String lineId, String stationAId, String stationBId, int sortOrder, String forwardDirection) {
        return new LineSegmentEntity(id, lineId, stationAId, stationBId, null, null, sortOrder, forwardDirection, null, false, null, null);
    }
}
