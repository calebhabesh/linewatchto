package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class AlertSegmentMatcher {

    public List<String> matchSegmentIds(
        List<LineSegmentEntity> segments,
        String lineId,
        String startStationId,
        String endStationId
    ) {
        return matchSegments(segments, lineId, startStationId, endStationId).stream()
            .map(LineSegmentEntity::getId)
            .toList();
    }

    public List<LineSegmentEntity> matchSegments(
        List<LineSegmentEntity> segments,
        String lineId,
        String startStationId,
        String endStationId
    ) {
        if (
            segments == null
                || isBlank(lineId)
                || isBlank(startStationId)
                || isBlank(endStationId)
                || startStationId.equals(endStationId)
        ) {
            return List.of();
        }

        List<LineSegmentEntity> lineSegments = segments.stream()
            .filter(segment -> lineId.equals(segment.getLineId()))
            .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder))
            .toList();
        java.util.ArrayDeque<PathState> queue = new java.util.ArrayDeque<>();
        java.util.Set<String> visitedStations = new java.util.HashSet<>();
        queue.add(new PathState(startStationId, List.of()));
        visitedStations.add(startStationId);

        while (!queue.isEmpty()) {
            PathState current = queue.removeFirst();
            for (LineSegmentEntity segment : lineSegments) {
                String nextStation = nextStation(segment, current.stationId());
                if (nextStation == null || !visitedStations.add(nextStation)) {
                    continue;
                }
                List<LineSegmentEntity> path = new java.util.ArrayList<>(current.path());
                path.add(segment);
                if (nextStation.equals(endStationId)) {
                    return List.copyOf(path);
                }
                queue.addLast(new PathState(nextStation, List.copyOf(path)));
            }
        }

        return List.of();
    }

    private String nextStation(LineSegmentEntity segment, String stationId) {
        if (segment.getStationAId().equals(stationId)) {
            return segment.getStationBId();
        }
        if (segment.getStationBId().equals(stationId)) {
            return segment.getStationAId();
        }
        return null;
    }

    private record PathState(String stationId, List<LineSegmentEntity> path) {}

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
