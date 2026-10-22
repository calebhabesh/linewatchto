package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.ingestion.AlertDirection;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * Rider-facing station spans whose connector states which travel directions are affected.
 *
 * <p>{@code →} means one direction, with stations in travel order. {@code ⇄} means both
 * directions. {@code to} means the source does not establish a direction. The source
 * {@code location} text stays unchanged because push identity and history compare it.
 */
public final class StationSpanFormatter {
    public static final String ONE_WAY = " → ";
    public static final String BOTH_WAYS = " ⇄ ";
    public static final String UNSPECIFIED = " to ";

    private StationSpanFormatter() {}

    public static String oneWay(String from, String to) {
        return join(from, ONE_WAY, to);
    }

    public static String bothWays(String from, String to) {
        return join(from, BOTH_WAYS, to);
    }

    public static String unspecified(String from, String to) {
        return join(from, UNSPECIFIED, to);
    }

    /**
     * Builds a TTC span. A single compass direction is drawn one way only when every
     * matched segment agrees on travel order; mixed or unmatched paths stay unspecified.
     */
    static String ttc(
        AlertSegmentMatcher matcher,
        List<LineSegmentEntity> segments,
        String lineId,
        String startStationId,
        String endStationId,
        AlertDirection direction,
        Function<String, String> stationLabel
    ) {
        if (isBlank(startStationId) || isBlank(endStationId)) {
            return "";
        }
        String start = stationLabel.apply(startStationId);
        if (startStationId.equals(endStationId)) {
            return start;
        }
        String end = stationLabel.apply(endStationId);
        if (direction == null || direction == AlertDirection.UNKNOWN) {
            return unspecified(start, end);
        }
        if (direction == AlertDirection.BIDIRECTIONAL) {
            return bothWays(start, end);
        }
        Set<String> traversal = traversalDirections(
            matcher.matchSegments(segments, lineId, startStationId, endStationId),
            startStationId
        );
        if (traversal.equals(Set.of(direction.wireValue()))) {
            return oneWay(start, end);
        }
        if (traversal.equals(Set.of(AlertDashboardService.opposite(direction).wireValue()))) {
            return oneWay(end, start);
        }
        return unspecified(start, end);
    }

    /** Compass directions travelled when walking the path from its first station. */
    private static Set<String> traversalDirections(List<LineSegmentEntity> path, String startStationId) {
        Set<String> directions = new HashSet<>();
        if (path == null || path.isEmpty()) {
            return directions;
        }
        String current = startStationId;
        for (LineSegmentEntity segment : path) {
            AlertDirection forward = AlertDirection.fromWireValue(segment.getForwardDirection());
            if (forward == AlertDirection.UNKNOWN || forward == AlertDirection.BIDIRECTIONAL) {
                directions.add("unknown");
                return directions;
            }
            if (segment.getStationAId().equals(current)) {
                directions.add(forward.wireValue());
                current = segment.getStationBId();
            } else {
                directions.add(AlertDashboardService.opposite(forward).wireValue());
                current = segment.getStationAId();
            }
        }
        return directions;
    }

    private static String join(String from, String connector, String to) {
        return from + connector + to;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
