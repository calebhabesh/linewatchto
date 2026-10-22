package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.ingestion.AlertDirection;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import java.util.List;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class StationSpanFormatterTest {

    private static final Function<String, String> LABEL = id -> switch (id) {
        case "st-andrew" -> "St Andrew";
        case "royal-york" -> "Royal York";
        default -> Character.toUpperCase(id.charAt(0)) + id.substring(1);
    };

    // Line 2 segments run west to east, so A -> B is eastbound.
    private static final List<LineSegmentEntity> LINE_2 = List.of(
        segment("l2-1", "line-2", "kipling", "islington", 1, "eastbound"),
        segment("l2-2", "line-2", "islington", "royal-york", 2, "eastbound"),
        segment("l2-3", "line-2", "royal-york", "jane", 3, "eastbound")
    );

    // Line 1 approaches Union southbound from both branches.
    private static final List<LineSegmentEntity> LINE_1 = List.of(
        segment("l1-1", "line-1", "st-andrew", "union", 100, "southbound"),
        segment("l1-2", "line-1", "king", "union", 200, "southbound")
    );

    private final AlertSegmentMatcher matcher = new AlertSegmentMatcher();

    @Test
    void westboundSpanIsDrawnInTravelOrderEvenWhenTheSourceListsItEastToWest() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "jane", AlertDirection.WESTBOUND))
            .isEqualTo("Jane → Kipling");
    }

    @Test
    void eastboundSpanKeepsTheSourceOrderWhenItAlreadyMatchesTravel() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "jane", AlertDirection.EASTBOUND))
            .isEqualTo("Kipling → Jane");
    }

    @Test
    void bothDirectionsUseTheTwoWayConnector() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "jane", AlertDirection.BIDIRECTIONAL))
            .isEqualTo("Kipling ⇄ Jane");
    }

    @Test
    void unknownDirectionMakesNoTravelClaim() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "jane", AlertDirection.UNKNOWN))
            .isEqualTo("Kipling to Jane");
    }

    @Test
    void directionOnTheWrongAxisMakesNoTravelClaim() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "jane", AlertDirection.NORTHBOUND))
            .isEqualTo("Kipling to Jane");
    }

    @Test
    void pathThroughUnionChangesCompassDirectionSoStaysUnspecified() {
        assertThat(ttc(LINE_1, "line-1", "st-andrew", "king", AlertDirection.SOUTHBOUND))
            .isEqualTo("St Andrew to King");
    }

    @Test
    void unmatchedPathStaysUnspecified() {
        assertThat(ttc(LINE_2, "line-2", "kipling", "kennedy", AlertDirection.EASTBOUND))
            .isEqualTo("Kipling to Kennedy");
    }

    @Test
    void singleStationHasNoConnector() {
        assertThat(ttc(LINE_2, "line-2", "jane", "jane", AlertDirection.WESTBOUND)).isEqualTo("Jane");
    }

    private String ttc(
        List<LineSegmentEntity> segments, String lineId, String start, String end, AlertDirection direction
    ) {
        return StationSpanFormatter.ttc(matcher, segments, lineId, start, end, direction, LABEL);
    }

    private static LineSegmentEntity segment(
        String id, String lineId, String stationA, String stationB, int sortOrder, String forwardDirection
    ) {
        return new LineSegmentEntity(id, lineId, stationA, stationB, null, null, sortOrder, forwardDirection,
            null, false, null, null);
    }
}
