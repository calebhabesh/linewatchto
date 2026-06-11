package com.calebhabesh.linewatch.commute;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
    void prefersStGeorgeOverSpadinaForLine2ToNorthwestLine1Transfers() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-2-keele-dundas-west", "line-2", "keele", "dundas-west", 301),
            segment("line-2-dundas-west-lansdowne", "line-2", "dundas-west", "lansdowne", 302),
            segment("line-2-lansdowne-dufferin", "line-2", "lansdowne", "dufferin", 303),
            segment("line-2-dufferin-ossington", "line-2", "dufferin", "ossington", 304),
            segment("line-2-ossington-christie", "line-2", "ossington", "christie", 305),
            segment("line-2-christie-bathurst", "line-2", "christie", "bathurst", 306),
            segment("line-2-bathurst-spadina", "line-2", "bathurst", "spadina", 307),
            segment("line-2-spadina-st-george", "line-2", "spadina", "st-george", 308),
            segment("line-1-spadina-st-george", "line-1", "spadina", "st-george", 114),
            segment("line-1-dupont-spadina", "line-1", "dupont", "spadina", 113),
            segment("line-1-st-clair-west-dupont", "line-1", "st-clair-west", "dupont", 112),
            segment("line-1-cedarvale-st-clair-west", "line-1", "cedarvale", "st-clair-west", 111),
            segment("line-1-glencairn-cedarvale", "line-1", "glencairn", "cedarvale", 110),
            segment("line-1-lawrence-west-glencairn", "line-1", "lawrence-west", "glencairn", 109)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse path = service.path("keele", "lawrence-west");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.transferStationIds()).containsExactly("st-george");
        assertThat(path.segmentIds()).containsSubsequence(
            "line-2-bathurst-spadina",
            "line-2-spadina-st-george",
            "line-1-spadina-st-george",
            "line-1-dupont-spadina"
        );
        assertThat(path.lineIds()).containsExactly("line-2", "line-1");
        assertThat(path.estimatedTravelSeconds()).isEqualTo(1860);
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

    @Test
    void reusesWeightedGraphSnapshotAcrossMultiplePathRequestsForSameScheduleSignature() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-a-b", "line-1", "a", "b", 101),
            segment("line-1-b-c", "line-1", "b", "c", 102)
        ));
        when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
            "line-1-a-b", weight("line-1-a-b", 90),
            "line-1-b-c", weight("line-1-b-c", 110)
        ));

        CommuteResponses.PathResponse outbound = service.path("a", "c");
        CommuteResponses.PathResponse inbound = service.path("c", "a");

        assertThat(outbound.status()).isEqualTo("available");
        assertThat(outbound.estimatedTravelSeconds()).isEqualTo(200);
        assertThat(inbound.status()).isEqualTo("available");
        assertThat(inbound.estimatedTravelSeconds()).isEqualTo(200);
        verify(travelTimeRepository, times(2)).activeScheduleSignature();
        verify(lineSegmentRepository, times(1)).findAllByOrderBySortOrderAsc();
        verify(travelTimeRepository, times(1)).findActiveScheduledSegmentWeights();
    }

    @Test
    void recordsLinkRelativeDirectionForEachPathSegmentHop() {
        when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
            segment("line-1-lawrence-west-glencairn", "line-1", "lawrence-west", "glencairn", 109)
        ));
        when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of());

        CommuteResponses.PathResponse southbound = service.path("lawrence-west", "glencairn");
        CommuteResponses.PathResponse northbound = service.path("glencairn", "lawrence-west");

        assertThat(southbound.segmentHops()).singleElement().satisfies(hop -> {
            assertThat(hop.segmentId()).isEqualTo("line-1-lawrence-west-glencairn");
            assertThat(hop.fromStationId()).isEqualTo("lawrence-west");
            assertThat(hop.toStationId()).isEqualTo("glencairn");
            assertThat(hop.travelDirection()).isEqualTo("forward");
        });
        assertThat(northbound.segmentHops()).singleElement().satisfies(hop -> {
            assertThat(hop.segmentId()).isEqualTo("line-1-lawrence-west-glencairn");
            assertThat(hop.fromStationId()).isEqualTo("glencairn");
            assertThat(hop.toStationId()).isEqualTo("lawrence-west");
            assertThat(hop.travelDirection()).isEqualTo("reverse");
        });
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
