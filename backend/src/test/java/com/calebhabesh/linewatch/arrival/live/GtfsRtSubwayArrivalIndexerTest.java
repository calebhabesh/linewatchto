package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
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

    @Test
    void indexesTripUpdatesThroughActiveGtfsStationStopMappings() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository);
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
    void returnsEmptySnapshotWhenStaticGtfsMappingsAreUnavailable() {
        GtfsRtSubwayArrivalIndexer indexer = new GtfsRtSubwayArrivalIndexer(repository);
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
}
