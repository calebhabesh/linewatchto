package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.ingestion.AlertDirection;
import com.calebhabesh.linewatch.ingestion.AlertDirectionParser;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class ReducedSpeedZoneProjector {

    private final AlertSegmentMatcher matcher;
    private final AlertDirectionParser directionParser;

    public ReducedSpeedZoneProjector(
        AlertSegmentMatcher matcher,
        AlertDirectionParser directionParser
    ) {
        this.matcher = matcher;
        this.directionParser = directionParser;
    }

    public Projection project(List<AlertEntity> alerts, List<LineSegmentEntity> lineSegments) {
        List<ProjectedSource> sources = new ArrayList<>();
        for (AlertEntity alert : alerts) {
            List<String> matchedSegments = matcher.matchSegmentIds(
                lineSegments,
                alert.getLine().getId(),
                alert.getStartStationId(),
                alert.getEndStationId()
            );
            sources.add(new ProjectedSource(alert, matchedSegments));
        }

        List<GroupBuilder> groups = groupSources(sources);
        List<ReducedSpeedZone> zones = new ArrayList<>();
        Map<String, SegmentImpactBuilder> impactBuilders = new java.util.LinkedHashMap<>();

        for (GroupBuilder group : groups) {
            List<AlertEntity> groupAlerts = group.sources.stream().map(ProjectedSource::alert).toList();
            List<String> sourceAlertIds = groupAlerts.stream().map(AlertEntity::getId).sorted().toList();
            String zoneId = "reduced-speed-zone-" + sourceAlertIds.getFirst();
            String displayDirection = displayDirection(group.lineId, group.sources);

            List<DirectionalDetail> directionalDetails = new ArrayList<>();
            for (ProjectedSource source : group.sources) {
                AlertEntity alert = source.alert();
                AlertDirection dir = effectiveDirection(alert);
                String detailDir = dir == AlertDirection.UNKNOWN ? "Unknown" : formatDirection(dir);
                String location = stationLabel(alert.getStartStationId()) + " to " + stationLabel(alert.getEndStationId());
                directionalDetails.add(new DirectionalDetail(alert.getId(), detailDir, location, alert.getDescription()));

                for (String segmentId : source.segmentIds()) {
                    LineSegmentEntity segment = lineSegments.stream().filter(s -> s.getId().equals(segmentId)).findFirst().orElseThrow();
                    TravelDirection travelDir = travelDirection(alert, segment);
                    impactBuilders.computeIfAbsent(segmentId, k -> new SegmentImpactBuilder(segmentId))
                        .addSource(alert.getId())
                        .addZone(zoneId)
                        .mergeTravelDirection(travelDir);
                }
            }
            zones.add(new ReducedSpeedZone(zoneId, group.lineId, new ArrayList<>(group.segmentIds), sourceAlertIds, displayDirection, directionalDetails, groupAlerts));
        }

        Map<String, SegmentImpact> segmentImpacts = impactBuilders.values().stream()
            .collect(Collectors.toMap(SegmentImpactBuilder::segmentId, SegmentImpactBuilder::build));

        return new Projection(zones, segmentImpacts);
    }

    private TravelDirection travelDirection(AlertEntity alert, LineSegmentEntity segment) {
        AlertDirection direction = effectiveDirection(alert);
        if (direction == AlertDirection.UNKNOWN || direction == AlertDirection.BIDIRECTIONAL) {
            return TravelDirection.BIDIRECTIONAL;
        }
        if (direction.wireValue().equals(segment.getForwardDirection())) {
            return TravelDirection.FORWARD;
        }
        if (opposite(direction).wireValue().equals(segment.getForwardDirection())) {
            return TravelDirection.REVERSE;
        }
        return TravelDirection.BIDIRECTIONAL;
    }

    private AlertDirection opposite(AlertDirection direction) {
        return switch (direction) {
            case NORTHBOUND -> AlertDirection.SOUTHBOUND;
            case SOUTHBOUND -> AlertDirection.NORTHBOUND;
            case EASTBOUND -> AlertDirection.WESTBOUND;
            case WESTBOUND -> AlertDirection.EASTBOUND;
            case BIDIRECTIONAL, UNKNOWN -> AlertDirection.UNKNOWN;
        };
    }

    private List<GroupBuilder> groupSources(List<ProjectedSource> sources) {
        List<GroupBuilder> groups = new java.util.ArrayList<>();
        for (ProjectedSource source : sources) {
            List<GroupBuilder> overlaps = groups.stream()
                .filter(group -> group.overlaps(source))
                .toList();
            if (overlaps.isEmpty()) {
                groups.add(new GroupBuilder(source));
                continue;
            }

            GroupBuilder target = overlaps.getFirst();
            target.add(source);
            for (GroupBuilder overlap : overlaps.subList(1, overlaps.size())) {
                target.addAll(overlap);
                groups.remove(overlap);
            }
        }
        return groups;
    }

    private String displayDirection(String lineId, List<ProjectedSource> sources) {
        Set<AlertDirection> directions = sources.stream()
            .map(source -> effectiveDirection(source.alert()))
            .collect(Collectors.toSet());
        if (directions.contains(AlertDirection.UNKNOWN)) {
            return "Direction not specified";
        }
        if (directions.size() != 1 || directions.contains(AlertDirection.BIDIRECTIONAL)) {
            return bidirectionalLabel(lineId);
        }
        return formatDirection(directions.iterator().next());
    }

    private String bidirectionalLabel(String lineId) {
        return "line-1".equals(lineId)
            ? "Northbound & Southbound"
            : "Eastbound & Westbound";
    }

    private AlertDirection effectiveDirection(AlertEntity alert) {
        AlertDirection storedDirection = AlertDirection.fromWireValue(alert.getDirection());
        if (storedDirection != AlertDirection.UNKNOWN) {
            return storedDirection;
        }
        return directionParser.parse(null, alert.getTitle(), "", alert.getDescription());
    }

    private String formatDirection(AlertDirection direction) {
        String value = direction.wireValue();
        return value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1);
    }

    private String stationLabel(String stationId) {
        return StationDisplayNameFormatter.fromStationId(stationId);
    }

    private static final class GroupBuilder {
        private final String lineId;
        private final List<ProjectedSource> sources = new java.util.ArrayList<>();
        private final Set<String> segmentIds = new java.util.LinkedHashSet<>();

        private GroupBuilder(ProjectedSource source) {
            this.lineId = source.alert().getLine().getId();
            add(source);
        }

        private boolean overlaps(ProjectedSource source) {
            return lineId.equals(source.alert().getLine().getId())
                && source.segmentIds().stream().anyMatch(segmentIds::contains);
        }

        private void add(ProjectedSource source) {
            sources.add(source);
            segmentIds.addAll(source.segmentIds());
        }

        private void addAll(GroupBuilder group) {
            group.sources.forEach(this::add);
        }
    }

    private static class SegmentImpactBuilder {
        private final String segmentId;
        private TravelDirection travelDirection = null;
        private final Set<String> sourceAlertIds = new LinkedHashSet<>();
        private final Set<String> reducedSpeedZoneIds = new LinkedHashSet<>();

        public SegmentImpactBuilder(String segmentId) {
            this.segmentId = segmentId;
        }

        public String segmentId() {
            return segmentId;
        }

        public SegmentImpactBuilder addSource(String sourceAlertId) {
            this.sourceAlertIds.add(sourceAlertId);
            return this;
        }

        public SegmentImpactBuilder addZone(String zoneId) {
            this.reducedSpeedZoneIds.add(zoneId);
            return this;
        }

        public SegmentImpactBuilder mergeTravelDirection(TravelDirection travelDir) {
            if (this.travelDirection == null) {
                this.travelDirection = travelDir;
            } else {
                this.travelDirection = this.travelDirection.merge(travelDir);
            }
            return this;
        }

        public SegmentImpact build() {
            return new SegmentImpact(segmentId, travelDirection, new ArrayList<>(sourceAlertIds).stream().sorted().toList(), new ArrayList<>(reducedSpeedZoneIds).stream().sorted().toList());
        }
    }

    private record ProjectedSource(AlertEntity alert, List<String> segmentIds) {}

    public enum TravelDirection {
        FORWARD("forward"),
        REVERSE("reverse"),
        BIDIRECTIONAL("bidirectional");

        private final String wireValue;

        TravelDirection(String wireValue) {
            this.wireValue = wireValue;
        }

        public String wireValue() {
            return wireValue;
        }

        public TravelDirection merge(TravelDirection other) {
            return this == other ? this : BIDIRECTIONAL;
        }
    }

    public record DirectionalDetail(
        String sourceAlertId,
        String displayDirection,
        String location,
        String description
    ) {}

    public record ReducedSpeedZone(
        String id,
        String lineId,
        List<String> affectedSegmentIds,
        List<String> sourceAlertIds,
        String displayDirection,
        List<DirectionalDetail> directionalDetails,
        List<AlertEntity> sourceAlerts
    ) {}

    public record SegmentImpact(
        String segmentId,
        TravelDirection travelDirection,
        List<String> sourceAlertIds,
        List<String> reducedSpeedZoneIds
    ) {}

    public record Projection(
        List<ReducedSpeedZone> zones,
        Map<String, SegmentImpact> segmentImpacts
    ) {}
}
