package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CommutePathServiceTest {
    private final LineSegmentRepository lineSegmentRepository = mock(LineSegmentRepository.class);
    private final CommuteTravelTimeRepository travelTimeRepository = mock(CommuteTravelTimeRepository.class);
    private final CommutePathService service = new CommutePathService(lineSegmentRepository, travelTimeRepository);

    @Test
    void choosesLowerScheduledTimeInsteadOfFewestStops() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-a-x", "line-1", "a", "x", 101),
            segment("line-1-x-b", "line-1", "x", "b", 102),
            segment("line-2-a-c", "line-2", "a", "c", 301),
            segment("line-2-c-d", "line-2", "c", "d", 302),
            segment("line-2-d-b", "line-2", "d", "b", 303)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-1-a-x", weight("line-1-a-x", 600),
            "line-1-x-b", weight("line-1-x-b", 600),
            "line-2-a-c", weight("line-2-a-c", 100),
            "line-2-c-d", weight("line-2-c-d", 100),
            "line-2-d-b", weight("line-2-d-b", 100)
        ));

        CommuteResponses.PathResponse path = service.path("a", "b");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.stationIds()).containsExactly("a", "c", "d", "b");
        assertThat(path.segmentIds()).containsExactly("line-2-a-c", "line-2-c-d", "line-2-d-b");
        assertThat(path.estimatedTravelSeconds()).isEqualTo(300);
        assertThat(path.weightSource()).isEqualTo("gtfs-scheduled-median");
        assertThat(path.summary()).isEqualTo("Default scheduled route: 4 stations on Line 2, about 5 min");
    }

    @Test
    void appliesTransferPenaltyWhenChangingLinesAtSharedStation() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-origin-transfer", "line-1", "origin", "transfer", 101),
            segment("line-1-transfer-destination", "line-1", "transfer", "destination", 102),
            segment("line-4-transfer-destination", "line-4", "transfer", "destination", 401)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-1-origin-transfer", weight("line-1-origin-transfer", 100),
            "line-1-transfer-destination", weight("line-1-transfer-destination", 220),
            "line-4-transfer-destination", weight("line-4-transfer-destination", 80)
        ));

        CommuteResponses.PathResponse path = service.path("origin", "destination");

        assertThat(path.segmentIds()).containsExactly("line-1-origin-transfer", "line-1-transfer-destination");
        assertThat(path.lineIds()).containsExactly("line-1");
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.estimatedTravelSeconds()).isEqualTo(320);
    }

    @Test
    void usesFallbackWeightsWhenGtfsWeightsAreMissing() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-north-york-centre", "line-1", "finch", "north-york-centre", 101),
            segment("line-1-north-york-centre-sheppard-yonge", "line-1", "north-york-centre", "sheppard-yonge", 102)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse path = service.path("finch", "sheppard-yonge");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.segmentIds()).containsExactly(
            "line-1-finch-north-york-centre",
            "line-1-north-york-centre-sheppard-yonge"
        );
        assertThat(path.estimatedTravelSeconds()).isEqualTo(240);
        assertThat(path.weightSource()).isEqualTo("topology-fallback");
        assertThat(path.summary()).isEqualTo("Default route: 3 stations on Line 1, about 4 min");
    }

    @Test
    void returnsUnavailablePathWhenStationsAreDisconnected() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-finch-north-york-centre", "line-1", "finch", "north-york-centre", 101),
            segment("line-2-kipling-islington", "line-2", "kipling", "islington", 301)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse path = service.path("finch", "islington");

        assertThat(path.status()).isEqualTo("unavailable");
        assertThat(path.stationIds()).containsExactly("finch", "islington");
        assertThat(path.segmentIds()).isEmpty();
        assertThat(path.lineIds()).isEmpty();
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.estimatedTravelSeconds()).isZero();
        assertThat(path.weightSource()).isEqualTo("unavailable");
        assertThat(path.summary()).isEqualTo("Route path unavailable");
    }

    private CommuteTravelTimeRepository.SegmentTravelTime weight(String segmentId, int seconds) {
        return new CommuteTravelTimeRepository.SegmentTravelTime(
            segmentId,
            seconds,
            20,
            CommuteTravelTimeRepository.GTFS_SOURCE
        );
    }

    private LineSegmentEntity segment(String id, String lineId, String stationAId, String stationBId, int sortOrder) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            null,
            sortOrder,
            "southbound",
            null,
            false,
            null,
            null
        );
    }
}
