package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class AlertDashboardService {
    public static final String ACTIVE_ALERT_TYPE = "active-alert";
    public static final String PLANNED_CLOSURE_TYPE = "planned-closure";

    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter WINDOW_FORMATTER =
        DateTimeFormatter.ofPattern("EEE h:mm a", Locale.ENGLISH);

    private final AlertRepository alertRepository;
    private final LineSegmentRepository lineSegmentRepository;
    private final AlertSegmentMatcher segmentMatcher;
    private final ReducedSpeedZoneProjector reducedSpeedZoneProjector;
    private final IngestionFreshness ingestionFreshness;
    private final Clock clock;

    public AlertDashboardService(
        AlertRepository alertRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertSegmentMatcher segmentMatcher,
        ReducedSpeedZoneProjector reducedSpeedZoneProjector,
        IngestionFreshness ingestionFreshness,
        Clock clock
    ) {
        this.alertRepository = alertRepository;
        this.lineSegmentRepository = lineSegmentRepository;
        this.segmentMatcher = segmentMatcher;
        this.reducedSpeedZoneProjector = reducedSpeedZoneProjector;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
    }

    public List<ActiveAlertDto> activeAlerts() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
            .filter(alert -> "suspension".equalsIgnoreCase(alert.getSeverity()))
            .map(alert -> toActiveAlert(alert, segments))
            .toList();
    }

    public List<ReducedSpeedZoneDto> reducedSpeedZones() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return reducedSpeedProjection(segments).zones().stream()
            .map(this::toReducedSpeedZoneDto)
            .toList();
    }

    private ReducedSpeedZoneProjector.Projection reducedSpeedProjection(
        List<LineSegmentEntity> segments
    ) {
        List<AlertEntity> delays = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
            .filter(alert -> "delay".equalsIgnoreCase(alert.getSeverity()))
            .toList();
        return reducedSpeedZoneProjector.project(delays, segments);
    }

    public List<PlannedClosureDto> plannedClosures() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return alertRepository.findByActiveTrueAndType(PLANNED_CLOSURE_TYPE).stream()
            .filter(this::isCurrentOrFuture)
            .map(alert -> toPlannedClosure(alert, segments))
            .toList();
    }

    public Map<String, SegmentImpact> activeSegmentImpacts() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return Map.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, SegmentImpact> impacts = new LinkedHashMap<>();

        for (ActiveAlertDto alert : activeAlerts()) {
            for (String segmentId : alert.affectedSegmentIds()) {
                impacts.put(segmentId, new SegmentImpact(
                    segmentId,
                    "suspension",
                    "bidirectional",
                    List.of(alert.id()),
                    List.of(),
                    alert.id()
                ));
            }
        }

        ReducedSpeedZoneProjector.Projection projection = reducedSpeedProjection(segments);
        for (ReducedSpeedZoneProjector.SegmentImpact impact : projection.segmentImpacts().values()) {
            impacts.putIfAbsent(impact.segmentId(), new SegmentImpact(
                impact.segmentId(),
                "delay",
                impact.travelDirection().wireValue(),
                impact.sourceAlertIds(),
                impact.reducedSpeedZoneIds(),
                null
            ));
        }

        return impacts;
    }

    private boolean isCurrentOrFuture(AlertEntity alert) {
        OffsetDateTime endsAt = alert.getActivePeriodEnd();
        return endsAt == null || !endsAt.isBefore(OffsetDateTime.now(clock));
    }

    private ActiveAlertDto toActiveAlert(AlertEntity alert, List<LineSegmentEntity> segments) {
        TransitLineEntity line = alert.getLine();
        return new ActiveAlertDto(
            alert.getId(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            alert.getTitle(),
            isBlank(alert.getSeverity()) ? "delay" : alert.getSeverity(),
            location(alert),
            alert.getDescription(),
            updatedAgo(alert.getSourceUpdatedAt()),
            affectedSegmentIds(alert, segments),
            !isBlank(alert.getShuttleType()),
            "TTC Live Alert",
            reason(alert),
            targetRemoval(alert)
        );
    }

    private PlannedClosureDto toPlannedClosure(AlertEntity alert, List<LineSegmentEntity> segments) {
        TransitLineEntity line = alert.getLine();
        return new PlannedClosureDto(
            alert.getId(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            alert.getTitle(),
            window(alert.getActivePeriodStart(), alert.getActivePeriodEnd()),
            location(alert),
            alert.getDescription(),
            affectedSegmentIds(alert, segments),
            !isBlank(alert.getShuttleType()),
            "TTC Service Advisory",
            updatedAgo(alert.getSourceUpdatedAt()),
            reason(alert),
            targetRemoval(alert)
        );
    }

    private List<String> affectedSegmentIds(AlertEntity alert, List<LineSegmentEntity> segments) {
        TransitLineEntity line = alert.getLine();
        return segmentMatcher.matchSegmentIds(
            segments,
            line == null ? null : line.getId(),
            alert.getStartStationId(),
            alert.getEndStationId()
        );
    }

    private String location(AlertEntity alert) {
        if (isBlank(alert.getStartStationId()) || isBlank(alert.getEndStationId())) {
            return "";
        }
        return stationLabel(alert.getStartStationId()) + " to " + stationLabel(alert.getEndStationId());
    }

    private ReducedSpeedZoneDto toReducedSpeedZoneDto(
        ReducedSpeedZoneProjector.ReducedSpeedZone zone
    ) {
        AlertEntity first = zone.sourceAlerts().getFirst();
        TransitLineEntity line = first.getLine();

        String reason = null;
        for (AlertEntity a : zone.sourceAlerts()) {
            String r = reason(a);
            if (r != null) {
                reason = r;
                break;
            }
        }
        
        String targetRemoval = null;
        boolean firstTargetRemovalSet = false;
        boolean multipleDates = false;
        for (AlertEntity a : zone.sourceAlerts()) {
            String tr = targetRemoval(a);
            if (tr != null) {
                if (!firstTargetRemovalSet) {
                    targetRemoval = tr;
                    firstTargetRemovalSet = true;
                } else if (!targetRemoval.equals(tr)) {
                    multipleDates = true;
                }
            }
        }
        if (multipleDates) {
            targetRemoval = "Multiple dates";
        }

        return new ReducedSpeedZoneDto(
            zone.id(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            "Reduced Speed Zone",
            groupedLocation(zone),
            zone.displayDirection(),
            zone.sourceAlerts().size() == 1
                ? first.getDescription()
                : "TTC reports reduced speeds on this corridor.",
            zone.sourceAlerts().stream()
                .map(AlertEntity::getSourceUpdatedAt)
                .filter(java.util.Objects::nonNull)
                .max(java.util.Comparator.naturalOrder())
                .map(this::updatedAgo)
                .orElse("Updated recently"),
            zone.affectedSegmentIds(),
            zone.sourceAlertIds(),
            zone.directionalDetails().stream()
                .map(detail -> new DirectionalDetailDto(
                    detail.sourceAlertId(),
                    detail.displayDirection(),
                    detail.location(),
                    detail.description()
                ))
                .toList(),
            "TTC Live Alert",
            reason,
            targetRemoval
        );
    }

    private String groupedLocation(ReducedSpeedZoneProjector.ReducedSpeedZone zone) {
        List<String> locations = zone.directionalDetails().stream()
            .map(ReducedSpeedZoneProjector.DirectionalDetail::location)
            .distinct()
            .toList();
        if (locations.size() == 1) {
            return locations.getFirst();
        }
        if (locations.size() == 2 && reverseLocation(locations.getFirst()).equals(locations.get(1))) {
            String[] bounds = locations.getFirst().split(" to ", 2);
            return bounds[0] + " <-> " + bounds[1];
        }
        return "Multiple affected sections";
    }

    private String reverseLocation(String location) {
        String[] bounds = location.split(" to ", 2);
        return bounds.length == 2 ? bounds[1] + " to " + bounds[0] : location;
    }

    private String stationLabel(String stationId) {
        String[] words = stationId.replace('_', '-').split("-");
        StringBuilder label = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!label.isEmpty()) {
                label.append(' ');
            }
            label.append(word.substring(0, 1).toUpperCase(Locale.ROOT));
            if (word.length() > 1) {
                label.append(word.substring(1).toLowerCase(Locale.ROOT));
            }
        }
        return label.toString();
    }

    private String updatedAgo(OffsetDateTime sourceUpdatedAt) {
        if (sourceUpdatedAt == null) {
            return "Updated recently";
        }
        return "Updated " + relativeAge(sourceUpdatedAt);
    }

    private String relativeAge(OffsetDateTime timestamp) {
        long minutes = Math.max(0, Duration.between(timestamp, OffsetDateTime.now(clock)).toMinutes());
        if (minutes == 0) {
            return "just now";
        }
        if (minutes == 1) {
            return "1 min ago";
        }
        if (minutes < 60) {
            return minutes + " min ago";
        }
        long hours = minutes / 60;
        if (hours == 1) {
            return "1 hr ago";
        }
        if (hours < 24) {
            return hours + " hr ago";
        }
        long days = hours / 24;
        return days == 1 ? "1 day ago" : days + " days ago";
    }

    private String reason(AlertEntity alert) {
        if (!isBlank(alert.getCauseDescription())) {
            return cleanMetadataValue(alert.getCauseDescription());
        }
        if (!isBlank(alert.getEffectDescription())) {
            return cleanMetadataValue(alert.getEffectDescription());
        }
        return null;
    }

    private String targetRemoval(AlertEntity alert) {
        if (!isBlank(alert.getTargetRemoval())) {
            return cleanMetadataValue(alert.getTargetRemoval());
        }
        return null;
    }

    private String cleanMetadataValue(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String window(OffsetDateTime startsAt, OffsetDateTime endsAt) {
        if (startsAt == null && endsAt == null) {
            return "Timing TBD";
        }
        if (startsAt == null) {
            return "Until " + WINDOW_FORMATTER.format(endsAt.atZoneSameInstant(TORONTO_ZONE));
        }
        if (endsAt == null) {
            return "From " + WINDOW_FORMATTER.format(startsAt.atZoneSameInstant(TORONTO_ZONE));
        }
        return WINDOW_FORMATTER.format(startsAt.atZoneSameInstant(TORONTO_ZONE))
            + " - "
            + WINDOW_FORMATTER.format(endsAt.atZoneSameInstant(TORONTO_ZONE));
    }

    private int severityPriority(String overlay) {
        return "suspension".equalsIgnoreCase(overlay) ? 2 : 1;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public record ActiveAlertDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String severity,
        String location,
        String description,
        String updatedAgo,
        List<String> affectedSegmentIds,
        boolean shuttle,
        String source,
        String reason,
        String targetRemoval
    ) {}

    public record PlannedClosureDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String window,
        String location,
        String description,
        List<String> previewSegmentIds,
        boolean shuttle,
        String source,
        String updatedAgo,
        String reason,
        String targetRemoval
    ) {}

    public record DirectionalDetailDto(
        String sourceAlertId,
        String displayDirection,
        String location,
        String description
    ) {}

    public record ReducedSpeedZoneDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String location,
        String displayDirection,
        String description,
        String updatedAgo,
        List<String> affectedSegmentIds,
        List<String> sourceAlertIds,
        List<DirectionalDetailDto> directionalDetails,
        String source,
        String reason,
        String targetRemoval
    ) {}

    public record SegmentImpact(
        String segmentId,
        String overlay,
        String travelDirection,
        List<String> sourceAlertIds,
        List<String> reducedSpeedZoneIds,
        String alertId
    ) {}
}
