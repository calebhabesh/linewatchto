package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertSegmentMatcherTest {

    private final AlertSegmentMatcher matcher = new AlertSegmentMatcher();

    @Test
    void matchesDirectSegmentBetweenAlertBounds() {
        List<LineSegmentEntity> segments = List.of(
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 10),
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 20)
        );

        List<String> matched = matcher.matchSegmentIds(
            segments,
            "line-2",
            "jane",
            "ossington"
        );

        assertThat(matched).containsExactly("line-2-jane-ossington");
    }

    @Test
    void matchesOrderedSegmentsBetweenNonAdjacentBounds() {
        List<LineSegmentEntity> segments = List.of(
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 10),
            segment("line-2-jane-ossington", "line-2", "jane", "ossington", 20),
            segment("line-2-ossington-spadina", "line-2", "ossington", "spadina", 30),
            segment("line-1-finch-eglinton", "line-1", "finch", "eglinton", 40)
        );

        List<String> matched = matcher.matchSegmentIds(
            segments,
            "line-2",
            "kipling",
            "spadina"
        );

        assertThat(matched).containsExactly(
            "line-2-kipling-jane",
            "line-2-jane-ossington",
            "line-2-ossington-spadina"
        );
    }

    @Test
    void returnsEmptyWhenBoundsAreNotOnTheSameLineSequence() {
        List<LineSegmentEntity> segments = List.of(
            segment("line-2-kipling-jane", "line-2", "kipling", "jane", 10),
            segment("line-2-ossington-spadina", "line-2", "ossington", "spadina", 20)
        );

        List<String> matched = matcher.matchSegmentIds(
            segments,
            "line-2",
            "kipling",
            "spadina"
        );

        assertThat(matched).isEmpty();
    }

    @Test
    void matchesEglintonToDavisvilleAdjacentLink() {
        List<LineSegmentEntity> segments = List.of(
            segment("line-1-eglinton-davisville", "line-1", "eglinton", "davisville", 10),
            segment("line-1-st-clair-davisville", "line-1", "st-clair", "davisville", 20)
        );

        assertThat(matcher.matchSegmentIds(segments, "line-1", "eglinton", "davisville"))
            .containsExactly("line-1-eglinton-davisville");
    }

    @Test
    void walksConnectedBranchAndCurveLinksWithoutDependingOnFlatSortOrder() {
        List<LineSegmentEntity> segments = List.of(
            segment("line-1-st-andrew-union", "line-1", "st-andrew", "union", 30),
            segment("line-1-king-union", "line-1", "king", "union", 10),
            segment("line-1-osgoode-st-andrew", "line-1", "osgoode", "st-andrew", 20)
        );

        assertThat(matcher.matchSegmentIds(segments, "line-1", "osgoode", "king"))
            .containsExactly(
                "line-1-osgoode-st-andrew",
                "line-1-st-andrew-union",
                "line-1-king-union"
            );
    }

    private LineSegmentEntity segment(
        String id,
        String lineId,
        String stationAId,
        String stationBId,
        int sortOrder
    ) {
        return new LineSegmentEntity(
            id,
            lineId,
            stationAId,
            stationBId,
            null,
            "M 0 0 L 1 1",
            sortOrder
        );
    }
}
