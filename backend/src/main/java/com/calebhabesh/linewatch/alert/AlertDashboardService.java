package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.ingestion.AlertDirection;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.TtcServiceState;
import com.calebhabesh.linewatch.ingestion.TtcSubwayClosureParser;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class AlertDashboardService {
    public static final String ACTIVE_ALERT_TYPE = "active-alert";
    public static final String PLANNED_CLOSURE_TYPE = "planned-closure";
    private static final String SUSPENSION_KIND = "suspension";
    private static final String DELAY_KIND = "delay";
    private static final String REDUCED_SPEED_ZONE_KIND = "reduced-speed-zone";
    private static final String PLANNED_CLOSURE_KIND = "planned-closure";

    private final AlertRepository alertRepository;
    private final LineSegmentRepository lineSegmentRepository;
    private final AlertSegmentMatcher segmentMatcher;
    private final ReducedSpeedZoneProjector reducedSpeedZoneProjector;
    private final IngestionFreshness ingestionFreshness;
    private final AlertActivePeriodRepository periodRepository;
    private final Clock clock;
    private final TtcClosureProjector closureProjector;

    @Autowired
    public AlertDashboardService(
        AlertRepository alertRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertSegmentMatcher segmentMatcher,
        ReducedSpeedZoneProjector reducedSpeedZoneProjector,
        IngestionFreshness ingestionFreshness,
        AlertActivePeriodRepository periodRepository,
        Clock clock,
        TtcClosureProjector closureProjector
    ) {
        this.alertRepository = alertRepository;
        this.lineSegmentRepository = lineSegmentRepository;
        this.segmentMatcher = segmentMatcher;
        this.reducedSpeedZoneProjector = reducedSpeedZoneProjector;
        this.ingestionFreshness = ingestionFreshness;
        this.periodRepository = periodRepository;
        this.clock = clock;
        this.closureProjector = java.util.Objects.requireNonNull(closureProjector, "closureProjector");
    }

    public AlertDashboardService(
        AlertRepository alertRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertSegmentMatcher segmentMatcher,
        ReducedSpeedZoneProjector reducedSpeedZoneProjector,
        IngestionFreshness ingestionFreshness,
        AlertActivePeriodRepository periodRepository,
        Clock clock
    ) {
        this(
            alertRepository,
            lineSegmentRepository,
            segmentMatcher,
            reducedSpeedZoneProjector,
            ingestionFreshness,
            periodRepository,
            clock,
            new TtcClosureProjector(segmentMatcher)
        );
    }

    public TtcDashboardReadModel createReadModel() {
        return createReadModel(Optional.empty());
    }

    public TtcDashboardReadModel createReadModel(Optional<com.calebhabesh.linewatch.ingestion.IngestionRunSnapshot> latestRun) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        boolean live = latestRun != null && latestRun.isPresent()
            ? ingestionFreshness.isFresh(latestRun)
            : ingestionFreshness.isDashboardFresh();
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();

        if (!live) {
            return TtcDashboardReadModel.offline(now, latestRun, segments);
        }

        List<AlertEntity> activeAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);
        List<AlertEntity> plannedAlerts = alertRepository.findByActiveTrueAndType(PLANNED_CLOSURE_TYPE);
        List<String> plannedIds = plannedAlerts.stream().map(AlertEntity::getId).toList();
        Map<String, List<AlertActivePeriodRepository.AlertPeriod>> periods = plannedIds.isEmpty()
            ? Map.of()
            : periodRepository.findByAlertIds(plannedIds);

        List<TtcClosureProjector.ClosureProjection> closureProjections = plannedAlerts.isEmpty()
            ? List.of()
            : closureProjector.project(plannedAlerts, periods, segments, now);

        List<AlertEntity> rszAlerts = activeAlerts.stream()
            .filter(a -> hasImpactKind(a, REDUCED_SPEED_ZONE_KIND))
            .toList();
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection =
            reducedSpeedZoneProjector.project(rszAlerts, segments);

        List<ActiveAlertDto> activeAlertDtos = computeActiveAlerts(segments, activeAlerts, closureProjections);
        List<DelayAlertDto> delayDtos = computeDelays(segments, activeAlerts);
        List<ReducedSpeedZoneDto> rszDtos = computeReducedSpeedZones(segments, reducedSpeedProjection);
        List<PlannedClosureDto> plannedDtos = computePlannedClosures(segments, closureProjections);
        List<PlannedClosureDto> activePlannedDtos = computeActivePlannedClosures(segments, closureProjections);
        Map<String, List<SegmentImpact>> segmentImpacts = computeSegmentImpacts(segments, activeAlerts, closureProjections, reducedSpeedProjection);
        List<StationNodeImpact> stationNodeImpacts = computeStationNodeImpacts(segments, activeAlerts, reducedSpeedProjection);

        return new TtcDashboardReadModel(
            now,
            latestRun != null ? latestRun : Optional.empty(),
            true,
            segments,
            activeAlerts,
            plannedAlerts,
            periods,
            closureProjections,
            reducedSpeedProjection,
            activeAlertDtos,
            delayDtos,
            rszDtos,
            plannedDtos,
            activePlannedDtos,
            segmentImpacts,
            stationNodeImpacts
        );
    }

    public List<ActiveAlertDto> activeAlerts() {
        return activeAlerts(null);
    }

    public List<ActiveAlertDto> activeAlerts(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.activeAlerts();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<AlertEntity> activeRouteAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);
        List<TtcClosureProjector.ClosureProjection> closureProjections = plannedClosureProjections(segments);
        return computeActiveAlerts(segments, activeRouteAlerts, closureProjections);
    }

    public List<DelayAlertDto> delays() {
        return delays(null);
    }

    public List<DelayAlertDto> delays(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.delays();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<AlertEntity> activeRouteAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);
        return computeDelays(segments, activeRouteAlerts);
    }

    public List<ReducedSpeedZoneDto> reducedSpeedZones() {
        return reducedSpeedZones(null);
    }

    public List<ReducedSpeedZoneDto> reducedSpeedZones(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.reducedSpeedZones();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return computeReducedSpeedZones(segments, reducedSpeedProjection(segments));
    }

    private ReducedSpeedZoneProjector.Projection reducedSpeedProjection(
        List<LineSegmentEntity> segments
    ) {
        List<AlertEntity> reducedSpeedZones = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
            .filter(alert -> hasImpactKind(alert, REDUCED_SPEED_ZONE_KIND))
            .toList();
        return reducedSpeedZoneProjector.project(reducedSpeedZones, segments);
    }

    public List<PlannedClosureDto> plannedClosures() {
        return plannedClosures(null);
    }

    public List<PlannedClosureDto> plannedClosures(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.plannedClosures();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return computePlannedClosures(segments, plannedClosureProjections(segments));
    }

    public Set<String> dashboardVisiblePlannedClosureIds() {
        return dashboardVisiblePlannedClosureTitlesById().keySet();
    }

    public Map<String, String> dashboardVisiblePlannedClosureTitlesById() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return Map.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, String> titlesById = new LinkedHashMap<>();
        for (PlannedClosureDto closure : plannedClosureDtos(segments)) {
            titlesById.put(closure.id(), closure.title());
        }
        return java.util.Collections.unmodifiableMap(titlesById);
    }

    private List<PlannedClosureDto> plannedClosureDtos(List<LineSegmentEntity> segments) {
        return plannedClosureProjections(segments).stream()
            .map(TtcClosureProjector.ClosureProjection::canonicalClosure)
            .toList();
    }

    private List<TtcClosureProjector.ClosureProjection> plannedClosureProjections(
        List<LineSegmentEntity> segments
    ) {
        List<AlertEntity> sourceAlerts = alertRepository.findByActiveTrueAndType(PLANNED_CLOSURE_TYPE);
        if (sourceAlerts.isEmpty()) {
            return List.of();
        }
        List<String> alertIds = sourceAlerts.stream().map(AlertEntity::getId).toList();
        Map<String, List<AlertActivePeriodRepository.AlertPeriod>> periodsByAlertId =
            periodRepository.findByAlertIds(alertIds);
        return closureProjector.project(
            sourceAlerts,
            periodsByAlertId,
            segments,
            OffsetDateTime.now(clock)
        );
    }

    public List<PlannedClosureDto> activePlannedClosures() {
        return activePlannedClosures(null);
    }

    public List<PlannedClosureDto> activePlannedClosures(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.activePlannedClosures();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return computeActivePlannedClosures(segments, plannedClosureProjections(segments));
    }

    public Map<String, List<SegmentImpact>> activeSegmentImpacts() {
        return activeSegmentImpacts(null);
    }

    public Map<String, List<SegmentImpact>> activeSegmentImpacts(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.segmentImpacts();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return Map.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<AlertEntity> activeRouteAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);
        List<TtcClosureProjector.ClosureProjection> closureProjections = plannedClosureProjections(segments);
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection = reducedSpeedProjection(segments);
        return computeSegmentImpacts(segments, activeRouteAlerts, closureProjections, reducedSpeedProjection);
    }

    public List<StationNodeImpact> activeStationNodeImpacts() {
        return activeStationNodeImpacts(null);
    }

    public List<StationNodeImpact> activeStationNodeImpacts(TtcDashboardReadModel readModel) {
        if (readModel != null) {
            return readModel.stationNodeImpacts();
        }
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<AlertEntity> activeRouteAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection = reducedSpeedProjection(segments);
        return computeStationNodeImpacts(segments, activeRouteAlerts, reducedSpeedProjection);
    }

    private List<ActiveAlertDto> computeActiveAlerts(
        List<LineSegmentEntity> segments,
        List<AlertEntity> activeRouteAlerts,
        List<TtcClosureProjector.ClosureProjection> closureProjections
    ) {
        List<ActiveAlertDto> routeAlerts = activeRouteAlerts != null ? activeRouteAlerts.stream()
            .filter(alert -> hasImpactKind(alert, SUSPENSION_KIND))
            .map(alert -> toActiveAlert(alert, segments))
            .toList() : List.of();
        List<ActiveAlertDto> activeClosures = closureProjections != null ? closureProjections.stream()
            .filter(TtcClosureProjector.ClosureProjection::activeNow)
            .map(TtcClosureProjector.ClosureProjection::activeClosureAlert)
            .toList() : List.of();

        List<ActiveAlertDto> alerts = new ArrayList<>(routeAlerts);
        alerts.addAll(activeClosures);
        return alerts.stream()
            .sorted(activeAlertComparator(segments))
            .toList();
    }

    private List<DelayAlertDto> computeDelays(
        List<LineSegmentEntity> segments,
        List<AlertEntity> activeRouteAlerts
    ) {
        if (activeRouteAlerts == null) {
            return List.of();
        }
        return activeRouteAlerts.stream()
            .filter(alert -> hasImpactKind(alert, DELAY_KIND))
            .map(alert -> toDelayAlert(alert, segments))
            .sorted(delayAlertComparator(segments))
            .toList();
    }

    private List<ReducedSpeedZoneDto> computeReducedSpeedZones(
        List<LineSegmentEntity> segments,
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection
    ) {
        if (reducedSpeedProjection == null || reducedSpeedProjection.zones() == null) {
            return List.of();
        }
        return reducedSpeedProjection.zones().stream()
            .map(this::toReducedSpeedZoneDto)
            .sorted(reducedSpeedZoneComparator(segments))
            .toList();
    }

    private List<PlannedClosureDto> computePlannedClosures(
        List<LineSegmentEntity> segments,
        List<TtcClosureProjector.ClosureProjection> closureProjections
    ) {
        if (closureProjections == null) {
            return List.of();
        }
        return closureProjections.stream()
            .map(TtcClosureProjector.ClosureProjection::canonicalClosure)
            .sorted(plannedClosureComparator(segments))
            .toList();
    }

    private List<PlannedClosureDto> computeActivePlannedClosures(
        List<LineSegmentEntity> segments,
        List<TtcClosureProjector.ClosureProjection> closureProjections
    ) {
        if (closureProjections == null) {
            return List.of();
        }
        return closureProjections.stream()
            .filter(TtcClosureProjector.ClosureProjection::activeNow)
            .map(TtcClosureProjector.ClosureProjection::activePresentation)
            .sorted(plannedClosureComparator(segments))
            .toList();
    }

    private Map<String, List<SegmentImpact>> computeSegmentImpacts(
        List<LineSegmentEntity> segments,
        List<AlertEntity> activeRouteAlerts,
        List<TtcClosureProjector.ClosureProjection> closureProjections,
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection
    ) {
        Map<String, List<SegmentImpact>> impacts = new LinkedHashMap<>();

        if (activeRouteAlerts != null) {
            for (AlertEntity alert : activeRouteAlerts) {
                if (!hasImpactKind(alert, DELAY_KIND) && !hasImpactKind(alert, SUSPENSION_KIND)) {
                    continue;
                }
                for (String segmentId : affectedSegmentIds(alert, segments)) {
                    LineSegmentEntity segment = segments != null ? segments.stream()
                        .filter(s -> s.getId().equals(segmentId))
                        .findFirst()
                        .orElse(null) : null;
                    String travelDir = segment != null ? travelDirection(alert, segment) : "bidirectional";
                    appendImpact(impacts, segmentId, new SegmentImpact(
                        alert.getImpactKind(),
                        alert.getId(),
                        travelDir,
                        List.of(alert.getId())
                    ));
                }
            }
        }

        if (closureProjections != null) {
            for (TtcClosureProjector.ClosureProjection projection : closureProjections) {
                for (Map.Entry<String, SegmentImpact> entry : projection.activeSegmentImpacts()) {
                    appendImpact(impacts, entry.getKey(), entry.getValue());
                }
            }
        }

        if (reducedSpeedProjection != null && reducedSpeedProjection.segmentImpacts() != null) {
            for (ReducedSpeedZoneProjector.SegmentImpact impact : reducedSpeedProjection.segmentImpacts().values()) {
                String cardId = impact.reducedSpeedZoneIds().isEmpty()
                    ? null
                    : impact.reducedSpeedZoneIds().getFirst();
                appendImpact(impacts, impact.segmentId(), new SegmentImpact(
                    REDUCED_SPEED_ZONE_KIND,
                    cardId,
                    impact.travelDirection().wireValue(),
                    impact.sourceAlertIds()
                ));
            }
        }
        impacts.replaceAll((segmentId, segmentImpacts) -> segmentImpacts.stream()
            .sorted(Comparator.comparingInt(this::impactPriority))
            .toList());

        return impacts;
    }

    private List<StationNodeImpact> computeStationNodeImpacts(
        List<LineSegmentEntity> segments,
        List<AlertEntity> activeRouteAlerts,
        ReducedSpeedZoneProjector.Projection reducedSpeedProjection
    ) {
        List<StationNodeImpact> impacts = new ArrayList<>();

        if (activeRouteAlerts != null) {
            for (AlertEntity alert : activeRouteAlerts) {
                if (!hasImpactKind(alert, DELAY_KIND) && !hasImpactKind(alert, SUSPENSION_KIND)) {
                    continue;
                }
                List<String> affectedSegmentIds = affectedSegmentIds(alert, segments);
                resolvedNodeStationId(alert.getStationIds(), affectedSegmentIds)
                    .ifPresent(stationId -> impacts.add(new StationNodeImpact(
                        stationId,
                        alert.getImpactKind(),
                        alert.getId(),
                        alert.getTitle(),
                        sourceLabel(alert, "TTC Live Alerts")
                    )));
            }
        }

        if (reducedSpeedProjection != null && reducedSpeedProjection.zones() != null) {
            for (ReducedSpeedZoneProjector.ReducedSpeedZone zone : reducedSpeedProjection.zones()) {
                resolvedNodeStationId(rszStationIds(zone), zone.affectedSegmentIds())
                    .ifPresent(stationId -> impacts.add(new StationNodeImpact(
                        stationId,
                        REDUCED_SPEED_ZONE_KIND,
                        zone.id(),
                        zone.displayDirection().equals("Direction not specified")
                            ? "Reduced Speed Zone"
                            : "Reduced Speed Zone " + zone.displayDirection(),
                        sourceLabel(zone.sourceAlerts().getFirst(), "TTC Live Alerts")
                    )));
            }
        }

        return impacts;
    }

    private void appendImpact(
        Map<String, List<SegmentImpact>> impacts,
        String segmentId,
        SegmentImpact impact
    ) {
        impacts.computeIfAbsent(segmentId, ignored -> new ArrayList<>()).add(impact);
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
            displayDirection(alert),
            alert.getDescription(),
            alert.getActivePeriodStart(),
            sourceUpdatedAt(alert),
            affectedSegmentIds(alert, segments),
            !isBlank(alert.getShuttleType()),
            sourceLabel(alert, "TTC Live Alerts"),
            cause(alert),
            resolution(alert),
            null
        );
    }


    private DelayAlertDto toDelayAlert(AlertEntity alert, List<LineSegmentEntity> segments) {
        TransitLineEntity line = alert.getLine();
        return new DelayAlertDto(
            alert.getId(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            alert.getTitle(),
            location(alert),
            displayDirection(alert),
            alert.getDescription(),
            affectedSegmentIds(alert, segments),
            alert.getActivePeriodStart(),
            sourceUpdatedAt(alert),
            sourceLabel(alert, "TTC Live Alerts"),
            cause(alert)
        );
    }

    static OffsetDateTime sourceUpdatedAt(AlertEntity alert) {
        OffsetDateTime sourceUpdatedAt = alert.getSourceUpdatedAt();
        if (sourceUpdatedAt == null) {
            return alert.getUpdatedAt();
        }
        return sourceUpdatedAt;
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

    static String location(AlertEntity alert) {
        if (isBlank(alert.getStartStationId()) || isBlank(alert.getEndStationId())) {
            return "";
        }
        if (alert.getStartStationId().equals(alert.getEndStationId())) {
            return stationLabel(alert.getStartStationId());
        }
        return stationLabel(alert.getStartStationId()) + " to " + stationLabel(alert.getEndStationId());
    }

    static String displayDirection(AlertEntity alert) {
        AlertDirection direction = AlertDirection.fromWireValue(alert.getDirection());
        if (isUnionLineOneStationOnlyAlert(alert)) {
            Optional<String> unionTerminal = unionLineOneTerminal(alert);
            if (unionTerminal.isPresent()) {
                return "Northbound (to " + unionTerminal.get() + ")";
            }
            if (direction == AlertDirection.BIDIRECTIONAL) {
                return "Northbound (to Vaughan Metropolitan Centre & Finch)";
            }
            if (direction == AlertDirection.NORTHBOUND || direction == AlertDirection.SOUTHBOUND) {
                return "Northbound (terminal not specified)";
            }
        }

        return switch (direction) {
            case NORTHBOUND -> "Northbound";
            case SOUTHBOUND -> "Southbound";
            case EASTBOUND -> "Eastbound";
            case WESTBOUND -> "Westbound";
            case BIDIRECTIONAL -> bidirectionalLabel(alert.getLine());
            case UNKNOWN -> null;
        };
    }

    static boolean isUnionLineOneStationOnlyAlert(AlertEntity alert) {
        TransitLineEntity line = alert.getLine();
        return line != null
            && "line-1".equals(line.getId())
            && "union".equals(alert.getStartStationId())
            && "union".equals(alert.getEndStationId());
    }

    static Optional<String> unionLineOneTerminal(AlertEntity alert) {
        String text = String.join(" ",
            nullToEmpty(alert.getTitle()),
            nullToEmpty(alert.getDescription()),
            nullToEmpty(alert.getRawPayload())
        ).toLowerCase(Locale.ROOT);

        boolean mentionsVaughan = text.contains("vaughan metropolitan centre")
            || text.contains("vaughan")
            || text.contains("vmc");
        boolean mentionsFinch = text.contains("finch");
        if (mentionsVaughan && mentionsFinch) {
            return Optional.of("Vaughan Metropolitan Centre & Finch");
        }
        if (mentionsVaughan) {
            return Optional.of("Vaughan Metropolitan Centre");
        }
        if (mentionsFinch) {
            return Optional.of("Finch");
        }
        return Optional.empty();
    }

    static String travelDirection(AlertEntity alert, LineSegmentEntity segment) {
        AlertDirection direction = AlertDirection.fromWireValue(alert.getDirection());
        if (direction == AlertDirection.BIDIRECTIONAL || direction == AlertDirection.UNKNOWN) {
            return "bidirectional";
        }
        String forwardDir = segment.getForwardDirection();
        if (forwardDir == null) {
            return "bidirectional";
        }
        String forward = forwardDir.trim().toLowerCase(Locale.ROOT);
        if (direction.wireValue().equals(forward)) {
            return "forward";
        }
        if (opposite(direction).wireValue().equals(forward)) {
            return "reverse";
        }
        return "bidirectional";
    }

    static AlertDirection opposite(AlertDirection direction) {
        return switch (direction) {
            case NORTHBOUND -> AlertDirection.SOUTHBOUND;
            case SOUTHBOUND -> AlertDirection.NORTHBOUND;
            case EASTBOUND -> AlertDirection.WESTBOUND;
            case WESTBOUND -> AlertDirection.EASTBOUND;
            case BIDIRECTIONAL, UNKNOWN -> AlertDirection.UNKNOWN;
        };
    }

    static String bidirectionalLabel(TransitLineEntity line) {
        String num = line != null ? line.getNumber() : "";
        if ("1".equals(num)) {
            return "Northbound & Southbound";
        }
        if ("2".equals(num) || "4".equals(num) || "5".equals(num) || "6".equals(num)) {
            return "Eastbound & Westbound";
        }
        String id = line != null ? line.getId() : "";
        if ("line-1".equals(id)) {
            return "Northbound & Southbound";
        }
        return "Eastbound & Westbound";
    }

    private ReducedSpeedZoneDto toReducedSpeedZoneDto(
        ReducedSpeedZoneProjector.ReducedSpeedZone zone
    ) {
        AlertEntity first = zone.sourceAlerts().getFirst();
        TransitLineEntity line = first.getLine();

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
            earliestStartedAt(zone.sourceAlerts()),
            latestUpdatedAt(zone.sourceAlerts()),
            zone.affectedSegmentIds(),
            zone.sourceAlertIds(),
            zone.directionalDetails().stream()
                .map(detail -> toDirectionalDetailDto(detail, zone.sourceAlerts()))
                .toList(),
            sourceLabel(first, "TTC Live Alerts"),
            firstNonBlank(zone.sourceAlerts(), AlertDashboardService::cause),
            groupedResolution(zone.sourceAlerts()),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getRszLength),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getStationDistance),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getTrackPercent),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getReducedSpeed),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getAverageSpeed)
        );
    }

    private DirectionalDetailDto toDirectionalDetailDto(
        ReducedSpeedZoneProjector.DirectionalDetail detail,
        List<AlertEntity> sourceAlerts
    ) {
        AlertEntity sourceAlert = sourceAlerts.stream()
            .filter(alert -> alert.getId().equals(detail.sourceAlertId()))
            .findFirst()
            .orElse(null);
        return new DirectionalDetailDto(
            detail.sourceAlertId(),
            detail.displayDirection(),
            detail.location(),
            detail.description(),
            sourceAlert == null ? null : resolution(sourceAlert),
            sourceAlert == null ? null : sourceAlert.getActivePeriodStart(),
            sourceAlert == null ? null : sourceAlert.getSourceUpdatedAt()
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

    static String sourceLabel(AlertEntity alert, String liveAlertsDefault) {
        if (TtcSubwayClosureParser.SOURCE_ALERT_TYPE.equalsIgnoreCase(
            alert.getSourceAlertType()
        )) {
            return TtcSubwayClosureParser.SOURCE_ALERT_TYPE;
        }
        return "GTFS-RT".equalsIgnoreCase(alert.getSourceAlertType())
            ? "TTC GTFS-RT"
            : liveAlertsDefault;
    }

    private String reverseLocation(String location) {
        String[] bounds = location.split(" to ", 2);
        return bounds.length == 2 ? bounds[1] + " to " + bounds[0] : location;
    }

    private List<String> rszStationIds(ReducedSpeedZoneProjector.ReducedSpeedZone zone) {
        return zone.sourceAlerts().stream()
            .flatMap(alert -> alert.getStationIds().stream())
            .toList();
    }

    private Optional<String> resolvedNodeStationId(
        List<String> stationIds,
        List<String> affectedSegmentIds
    ) {
        if (!affectedSegmentIds.isEmpty()) {
            return Optional.empty();
        }
        List<String> distinctStations = stationIds.stream()
            .filter(stationId -> !isBlank(stationId))
            .distinct()
            .toList();
        return distinctStations.size() == 1
            ? Optional.of(distinctStations.getFirst())
            : Optional.empty();
    }

    static String stationLabel(String stationId) {
        return StationDisplayNameFormatter.fromStationId(stationId);
    }

    private OffsetDateTime earliestStartedAt(List<AlertEntity> alerts) {
        return alerts.stream()
            .map(AlertEntity::getActivePeriodStart)
            .filter(java.util.Objects::nonNull)
            .min(Comparator.naturalOrder())
            .orElse(null);
    }

    private OffsetDateTime latestUpdatedAt(List<AlertEntity> alerts) {
        return alerts.stream()
            .map(AlertEntity::getSourceUpdatedAt)
            .filter(java.util.Objects::nonNull)
            .max(Comparator.naturalOrder())
            .orElse(null);
    }

    private String firstNonBlank(
        List<AlertEntity> alerts,
        Function<AlertEntity, String> extractor
    ) {
        for (AlertEntity alert : alerts) {
            String value = cleanMetadataValue(extractor.apply(alert));
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String groupedResolution(List<AlertEntity> alerts) {
        String resolution = null;
        boolean firstResolutionSet = false;
        boolean multipleDates = false;
        for (AlertEntity alert : alerts) {
            String value = resolution(alert);
            if (value == null) {
                continue;
            }
            if ("TBD".equalsIgnoreCase(value)) {
                return "TBD";
            }
            if (!firstResolutionSet) {
                resolution = value;
                firstResolutionSet = true;
            } else if (!resolution.equals(value)) {
                multipleDates = true;
            }
        }
        return multipleDates ? "Multiple Dates" : resolution;
    }

    static String cause(AlertEntity alert) {
        if (!isBlank(alert.getCauseDescription())) {
            return cleanMetadataValue(alert.getCauseDescription());
        }
        if (!isBlank(alert.getCause())) {
            return cleanMetadataValue(alert.getCause());
        }
        return null;
    }

    static String resolution(AlertEntity alert) {
        if (!isBlank(alert.getTargetRemoval())) {
            return cleanMetadataValue(alert.getTargetRemoval());
        }
        return null;
    }

    static String cleanMetadataValue(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static String closureDisplayTitle(
        String title,
        String windowHours,
        String windowDates,
        boolean nightly,
        boolean overnight
    ) {
        return TtcClosureProjector.closureDisplayTitle(title, windowHours, windowDates, nightly, overnight);
    }

    private String window(OffsetDateTime startsAt, OffsetDateTime endsAt) {
        return TtcClosureProjector.window(startsAt, endsAt, OffsetDateTime.now(clock));
    }

    private Comparator<ActiveAlertDto> activeAlertComparator(List<LineSegmentEntity> segments) {
        Map<String, Integer> segmentOrders = segmentOrders(segments);
        return Comparator
            .comparingInt((ActiveAlertDto dto) -> lineSortOrder(dto.lineId(), dto.lineNumber()))
            .thenComparingInt(dto -> firstSegmentOrder(dto.affectedSegmentIds(), segmentOrders))
            .thenComparing(ActiveAlertDto::startedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ActiveAlertDto::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private Comparator<DelayAlertDto> delayAlertComparator(List<LineSegmentEntity> segments) {
        Map<String, Integer> segmentOrders = segmentOrders(segments);
        return Comparator
            .comparingInt((DelayAlertDto dto) -> lineSortOrder(dto.lineId(), dto.lineNumber()))
            .thenComparingInt(dto -> firstSegmentOrder(dto.affectedSegmentIds(), segmentOrders))
            .thenComparing(DelayAlertDto::startedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(DelayAlertDto::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private Comparator<ReducedSpeedZoneDto> reducedSpeedZoneComparator(List<LineSegmentEntity> segments) {
        Map<String, Integer> segmentOrders = segmentOrders(segments);
        return Comparator
            .comparingInt((ReducedSpeedZoneDto dto) -> lineSortOrder(dto.lineId(), dto.lineNumber()))
            .thenComparingInt(dto -> firstSegmentOrder(dto.affectedSegmentIds(), segmentOrders))
            .thenComparing(ReducedSpeedZoneDto::startedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ReducedSpeedZoneDto::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private Comparator<PlannedClosureDto> plannedClosureComparator(List<LineSegmentEntity> segments) {
        return TtcClosureProjector.plannedClosureComparator(segments);
    }

    static Map<String, Integer> segmentOrders(List<LineSegmentEntity> segments) {
        Map<String, Integer> orders = new LinkedHashMap<>();
        for (LineSegmentEntity segment : segments) {
            orders.put(segment.getId(), segment.getSortOrder());
        }
        return orders;
    }

    static int firstSegmentOrder(List<String> segmentIds, Map<String, Integer> segmentOrders) {
        if (segmentIds == null || segmentIds.isEmpty()) {
            return Integer.MAX_VALUE;
        }
        return segmentIds.stream()
            .map(segmentOrders::get)
            .filter(order -> order != null)
            .min(Integer::compareTo)
            .orElse(Integer.MAX_VALUE);
    }

    static int lineSortOrder(String lineId, String lineNumber) {
        if (!isBlank(lineNumber)) {
            try {
                return Integer.parseInt(lineNumber);
            } catch (NumberFormatException ignored) {
                // Fall through to the stable id mapping.
            }
        }
        if ("line-1".equals(lineId)) return 1;
        if ("line-2".equals(lineId)) return 2;
        if ("line-4".equals(lineId)) return 4;
        if ("line-5".equals(lineId)) return 5;
        if ("line-6".equals(lineId)) return 6;
        return Integer.MAX_VALUE;
    }

    private int impactPriority(SegmentImpact impact) {
        return switch (impact.kind()) {
            case REDUCED_SPEED_ZONE_KIND -> 1;
            case DELAY_KIND -> 2;
            case PLANNED_CLOSURE_KIND -> 3;
            case SUSPENSION_KIND -> 4;
            default -> 0;
        };
    }

    static boolean hasImpactKind(AlertEntity alert, String kind) {
        return kind.equalsIgnoreCase(alert.getImpactKind());
    }

    static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    public record ActiveAlertDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String severity,
        String location,
        String displayDirection,
        String description,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        List<String> affectedSegmentIds,
        boolean shuttle,
        String source,
        String cause,
        String resolution,
        String relatedPlannedClosureId,
        @com.fasterxml.jackson.annotation.JsonIgnore String notificationTitle
    ) {
        public ActiveAlertDto(
            String id,
            String lineId,
            String lineNumber,
            String title,
            String severity,
            String location,
            String displayDirection,
            String description,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            List<String> affectedSegmentIds,
            boolean shuttle,
            String source,
            String cause,
            String resolution,
            String relatedPlannedClosureId
        ) {
            this(id, lineId, lineNumber, title, severity, location, displayDirection,
                description, startedAt, updatedAt, affectedSegmentIds, shuttle, source,
                cause, resolution, relatedPlannedClosureId, title);
        }

        public ActiveAlertDto(
            String id,
            String lineId,
            String lineNumber,
            String title,
            String severity,
            String location,
            String displayDirection,
            String description,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            List<String> affectedSegmentIds,
            boolean shuttle,
            String source,
            String cause,
            String resolution
        ) {
            this(id, lineId, lineNumber, title, severity, location, displayDirection,
                description, startedAt, updatedAt, affectedSegmentIds, shuttle, source,
                cause, resolution, null, title);
        }
    }

    public record DelayAlertDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String location,
        String displayDirection,
        String description,
        List<String> affectedSegmentIds,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        String source,
        String cause
    ) {}

    public record PlannedClosureDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String window,
        String location,
        String displayDirection,
        String description,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        List<String> previewSegmentIds,
        boolean shuttle,
        String source,
        String cause,
        String resolution,
        boolean activeNow,
        String timingStatus,
        boolean nightly,
        OffsetDateTime activeWindowStart,
        OffsetDateTime activeWindowEnd,
        String activeWindowLabel,
        OffsetDateTime nextWindowStart,
        OffsetDateTime nextWindowEnd,
        String nextWindowLabel,
        String windowHours,
        String windowDates,
        @com.fasterxml.jackson.annotation.JsonIgnore String notificationTitle,
        String travelDirection,
        List<String> previewStationIds
    ) {
        public PlannedClosureDto(
            String id, String lineId, String lineNumber, String title, String window, String location,
            String displayDirection, String description, OffsetDateTime startedAt, OffsetDateTime updatedAt,
            List<String> previewSegmentIds, boolean shuttle, String source, String cause, String resolution,
            boolean activeNow, String timingStatus, boolean nightly, OffsetDateTime activeWindowStart,
            OffsetDateTime activeWindowEnd, String activeWindowLabel, OffsetDateTime nextWindowStart,
            OffsetDateTime nextWindowEnd, String nextWindowLabel, String windowHours, String windowDates,
            String notificationTitle, String travelDirection
        ) {
            this(id, lineId, lineNumber, title, window, location, displayDirection, description,
                startedAt, updatedAt, previewSegmentIds, shuttle, source, cause, resolution,
                activeNow, timingStatus, nightly, activeWindowStart, activeWindowEnd, activeWindowLabel,
                nextWindowStart, nextWindowEnd, nextWindowLabel, windowHours, windowDates,
                notificationTitle, travelDirection, List.of());
        }
        public PlannedClosureDto(
            String id,
            String lineId,
            String lineNumber,
            String title,
            String window,
            String location,
            String displayDirection,
            String description,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            List<String> previewSegmentIds,
            boolean shuttle,
            String source,
            String cause,
            String resolution,
            boolean activeNow,
            String timingStatus,
            boolean nightly,
            OffsetDateTime activeWindowStart,
            OffsetDateTime activeWindowEnd,
            String activeWindowLabel,
            OffsetDateTime nextWindowStart,
            OffsetDateTime nextWindowEnd,
            String nextWindowLabel,
            String windowHours,
            String windowDates,
            String notificationTitle
        ) {
            this(
                id, lineId, lineNumber, title, window, location, displayDirection, description, startedAt, updatedAt,
                previewSegmentIds, shuttle, source, cause, resolution, activeNow, timingStatus, nightly,
                activeWindowStart, activeWindowEnd, activeWindowLabel, nextWindowStart, nextWindowEnd,
                nextWindowLabel, windowHours, windowDates, notificationTitle, "bidirectional"
            );
        }

        public PlannedClosureDto(
            String id,
            String lineId,
            String lineNumber,
            String title,
            String window,
            String location,
            String displayDirection,
            String description,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            List<String> previewSegmentIds,
            boolean shuttle,
            String source,
            String cause,
            String resolution,
            boolean activeNow,
            String timingStatus,
            boolean nightly,
            OffsetDateTime activeWindowStart,
            OffsetDateTime activeWindowEnd,
            String activeWindowLabel,
            OffsetDateTime nextWindowStart,
            OffsetDateTime nextWindowEnd,
            String nextWindowLabel,
            String windowHours,
            String windowDates
        ) {
            this(
                id, lineId, lineNumber, title, window, location, displayDirection, description, startedAt, updatedAt,
                previewSegmentIds, shuttle, source, cause, resolution, activeNow, timingStatus, nightly,
                activeWindowStart, activeWindowEnd, activeWindowLabel, nextWindowStart, nextWindowEnd,
                nextWindowLabel, windowHours, windowDates, title, "bidirectional"
            );
        }

        public PlannedClosureDto(
            String id,
            String lineId,
            String lineNumber,
            String title,
            String window,
            String location,
            String displayDirection,
            String description,
            OffsetDateTime startedAt,
            OffsetDateTime updatedAt,
            List<String> previewSegmentIds,
            boolean shuttle,
            String source,
            String cause,
            String resolution
        ) {
            this(
                id, lineId, lineNumber, title, window, location, displayDirection, description, startedAt, updatedAt,
                previewSegmentIds, shuttle, source, cause, resolution,
                false, "unknown", false, null, null, null, null, null, null, null, null, title, "bidirectional"
            );
        }

        public PlannedClosureDto(
            String id, String lineId, String lineNumber, String title, String window, String location,
            String displayDirection, String description, OffsetDateTime startedAt, OffsetDateTime updatedAt,
            List<String> previewSegmentIds, boolean shuttle, String source, String cause, String resolution,
            List<String> previewStationIds
        ) {
            this(id, lineId, lineNumber, title, window, location, displayDirection, description,
                startedAt, updatedAt, previewSegmentIds, shuttle, source, cause, resolution,
                false, "unknown", false, null, null, null, null, null, null, null, null,
                title, "bidirectional", previewStationIds);
        }
    }

    public record DirectionalDetailDto(
        String sourceAlertId,
        String displayDirection,
        String location,
        String description,
        String resolution,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt
    ) {
        public DirectionalDetailDto(
            String sourceAlertId,
            String displayDirection,
            String location,
            String description,
            String resolution
        ) {
            this(sourceAlertId, displayDirection, location, description, resolution, null, null);
        }
    }

    public record ReducedSpeedZoneDto(
        String id,
        String lineId,
        String lineNumber,
        String title,
        String location,
        String displayDirection,
        String description,
        OffsetDateTime startedAt,
        OffsetDateTime updatedAt,
        List<String> affectedSegmentIds,
        List<String> sourceAlertIds,
        List<DirectionalDetailDto> directionalDetails,
        String source,
        String cause,
        String resolution,
        String rszLength,
        String stationDistance,
        String trackPercent,
        String reducedSpeed,
        String averageSpeed
    ) {}

    public record SegmentImpact(
        String kind,
        String cardId,
        String travelDirection,
        List<String> sourceAlertIds
    ) {}

    public record StationNodeImpact(
        String stationId,
        String kind,
        String cardId,
        String title,
        String source
    ) {
        public StationNodeImpact(
            String stationId,
            String kind,
            String cardId,
            String title
        ) {
            this(stationId, kind, cardId, title, "TTC Live Alerts");
        }
    }
}
