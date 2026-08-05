package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.LineSegmentRepository;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.ingestion.AlertDirection;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.ingestion.TtcServiceState;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
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
import org.springframework.stereotype.Service;

@Service
public class AlertDashboardService {
    public static final String ACTIVE_ALERT_TYPE = "active-alert";
    public static final String PLANNED_CLOSURE_TYPE = "planned-closure";
    private static final String SUSPENSION_KIND = "suspension";
    private static final String DELAY_KIND = "delay";
    private static final String REDUCED_SPEED_ZONE_KIND = "reduced-speed-zone";
    private static final String PLANNED_CLOSURE_KIND = "planned-closure";

    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter WINDOW_FORMATTER =
        DateTimeFormatter.ofPattern("EEE h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_HOURS_FORMATTER =
        DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_DATE_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_DATE_WITH_YEAR_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d, uuuu", Locale.ENGLISH);
    private static final Duration MAX_SINGLE_CLOSURE_WINDOW = Duration.ofHours(18);
    private static final Duration MAX_PUBLICATION_START_SKEW = Duration.ofMinutes(5);
    private static final Pattern TRUNCATED_CLOSURE_START = Pattern.compile(
        "(?i)[,\\s]+starting(?:\\s+at)?\\s+\\d{1,2}\\s*$"
    );

    private final AlertRepository alertRepository;
    private final LineSegmentRepository lineSegmentRepository;
    private final AlertSegmentMatcher segmentMatcher;
    private final ReducedSpeedZoneProjector reducedSpeedZoneProjector;
    private final IngestionFreshness ingestionFreshness;
    private final AlertActivePeriodRepository periodRepository;
    private final TtcAlertStore ttcAlertStore;
    private final Clock clock;

    public AlertDashboardService(
        AlertRepository alertRepository,
        LineSegmentRepository lineSegmentRepository,
        AlertSegmentMatcher segmentMatcher,
        ReducedSpeedZoneProjector reducedSpeedZoneProjector,
        IngestionFreshness ingestionFreshness,
        AlertActivePeriodRepository periodRepository,
        TtcAlertStore ttcAlertStore,
        Clock clock
    ) {
        this.alertRepository = alertRepository;
        this.lineSegmentRepository = lineSegmentRepository;
        this.segmentMatcher = segmentMatcher;
        this.reducedSpeedZoneProjector = reducedSpeedZoneProjector;
        this.ingestionFreshness = ingestionFreshness;
        this.periodRepository = periodRepository;
        this.ttcAlertStore = ttcAlertStore;
        this.clock = clock;
    }

    public List<RawAlertDto> rawAlerts() {
        return ttcAlertStore.getRawAlerts();
    }

    public List<ActiveAlertDto> activeAlerts() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<ActiveAlertDto> routeAlerts = alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
            .filter(alert -> hasImpactKind(alert, SUSPENSION_KIND))
            .map(alert -> toActiveAlert(alert, segments))
            .toList();
        List<ActiveAlertDto> activeClosures = plannedClosureViews(segments).stream()
            .filter(view -> view.closure().activeNow())
            .map(view -> toActiveClosureAlert(view, segments))
            .toList();

        List<ActiveAlertDto> alerts = new ArrayList<>(routeAlerts);
        alerts.addAll(activeClosures);
        return alerts.stream()
            .sorted(activeAlertComparator(segments))
            .toList();
    }

    public List<DelayAlertDto> delays() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE).stream()
            .filter(alert -> hasImpactKind(alert, DELAY_KIND))
            .map(alert -> toDelayAlert(alert, segments))
            .sorted(delayAlertComparator(segments))
            .toList();
    }

    public List<ReducedSpeedZoneDto> reducedSpeedZones() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return reducedSpeedProjection(segments).zones().stream()
            .map(this::toReducedSpeedZoneDto)
            .sorted(reducedSpeedZoneComparator(segments))
            .toList();
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
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return plannedClosureDtos(segments).stream()
            .sorted(plannedClosureComparator(segments))
            .toList();
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
        return plannedClosureViews(segments).stream()
            .map(PlannedClosureView::closure)
            .toList();
    }

    private List<PlannedClosureView> plannedClosureViews(List<LineSegmentEntity> segments) {
        List<AlertEntity> sourceAlerts = alertRepository.findByActiveTrueAndType(PLANNED_CLOSURE_TYPE).stream()
            .filter(alert -> hasImpactKind(alert, PLANNED_CLOSURE_KIND))
            .filter(this::isCurrentOrFuture)
            .toList();

        if (sourceAlerts.isEmpty()) {
            return List.of();
        }

        List<String> alertIds = sourceAlerts.stream().map(AlertEntity::getId).toList();
        Map<String, List<AlertActivePeriodRepository.AlertPeriod>> periodsByAlertId =
            periodRepository.findByAlertIds(alertIds);
        Map<String, AlertEntity> alertsBySourceId = sourceAlerts.stream()
            .filter(alert -> !isBlank(alert.getSourceId()))
            .collect(java.util.stream.Collectors.toMap(
                AlertEntity::getSourceId,
                Function.identity(),
                (first, ignored) -> first,
                LinkedHashMap::new
            ));
        Set<String> linkedChildSourceIds = new LinkedHashSet<>();
        for (List<AlertActivePeriodRepository.AlertPeriod> periods : periodsByAlertId.values()) {
            for (AlertActivePeriodRepository.AlertPeriod period : periods) {
                if (isStructurallyValidClosureWindow(period)
                    && !isParentPeriod(period)
                    && alertsBySourceId.containsKey(period.sourcePeriodId())) {
                    linkedChildSourceIds.add(period.sourcePeriodId());
                }
            }
        }

        return sourceAlerts.stream()
            .filter(alert -> !isRestoration(alert))
            .filter(alert -> !linkedChildSourceIds.contains(alert.getSourceId()))
            .map(alert -> {
                List<AlertActivePeriodRepository.AlertPeriod> periods = periodsByAlertId.get(alert.getId());
                WindowState ws = windowState(alert, periods);
                return new AlertWithWindowState(alert, ws);
            })
            .map(aw -> new PlannedClosureView(
                toPlannedClosure(aw.alert, segments, aw.ws),
                aw.ws.activeSourcePeriodId() == null
                    ? null
                    : currentClosureSourceAlert(
                        alertsBySourceId.get(aw.ws.activeSourcePeriodId())
                    )
            ))
            .toList();
    }

    private AlertEntity currentClosureSourceAlert(AlertEntity alert) {
        return alert == null || isRestoration(alert) ? null : alert;
    }

    private boolean isRestoration(AlertEntity alert) {
        return TtcServiceState.isRestoration(
            alert.getEffect(),
            alert.getSeverity(),
            alert.getTitle(),
            alert.getDescription(),
            alert.getEffectDescription()
        );
    }

    public List<PlannedClosureDto> activePlannedClosures() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        return plannedClosureViews(segments).stream()
            .filter(view -> view.closure().activeNow())
            .map(view -> activeClosurePresentation(view, segments))
            .sorted(plannedClosureComparator(segments))
            .toList();
    }

    private record AlertWithWindowState(AlertEntity alert, WindowState ws) {}

    private record PlannedClosureView(
        PlannedClosureDto closure,
        AlertEntity currentSourceAlert
    ) {}

    public Map<String, List<SegmentImpact>> activeSegmentImpacts() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return Map.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        Map<String, List<SegmentImpact>> impacts = new LinkedHashMap<>();
        List<AlertEntity> activeRouteAlerts =
            alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE);

        for (AlertEntity alert : activeRouteAlerts) {
            if (!hasImpactKind(alert, DELAY_KIND) && !hasImpactKind(alert, SUSPENSION_KIND)) {
                continue;
            }
            for (String segmentId : affectedSegmentIds(alert, segments)) {
                LineSegmentEntity segment = segments.stream()
                    .filter(s -> s.getId().equals(segmentId))
                    .findFirst()
                    .orElse(null);
                String travelDir = segment != null ? travelDirection(alert, segment) : "bidirectional";
                appendImpact(impacts, segmentId, new SegmentImpact(
                    alert.getImpactKind(),
                    alert.getId(),
                    travelDir,
                    List.of(alert.getId())
                ));
            }
        }

        for (PlannedClosureView view : plannedClosureViews(segments).stream()
            .filter(candidate -> candidate.closure().activeNow())
            .toList()) {
            PlannedClosureDto closure = activeClosurePresentation(view, segments);
            AlertEntity currentSourceAlert = view.currentSourceAlert();
            String cardId = currentSourceAlert == null ? closure.id() : currentSourceAlert.getId();
            for (String segmentId : closure.previewSegmentIds()) {
                appendImpact(impacts, segmentId, new SegmentImpact(
                    SUSPENSION_KIND,
                    cardId,
                    "bidirectional",
                    List.of(cardId)
                ));
            }
        }

        ReducedSpeedZoneProjector.Projection projection = reducedSpeedProjection(segments);
        for (ReducedSpeedZoneProjector.SegmentImpact impact : projection.segmentImpacts().values()) {
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
        impacts.replaceAll((segmentId, segmentImpacts) -> segmentImpacts.stream()
            .sorted(Comparator.comparingInt(this::impactPriority))
            .toList());

        return impacts;
    }

    public List<StationNodeImpact> activeStationNodeImpacts() {
        if (!ingestionFreshness.isDashboardFresh()) {
            return List.of();
        }
        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc();
        List<StationNodeImpact> impacts = new ArrayList<>();

        for (AlertEntity alert : alertRepository.findByActiveTrueAndType(ACTIVE_ALERT_TYPE)) {
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

        for (ReducedSpeedZoneProjector.ReducedSpeedZone zone : reducedSpeedProjection(segments).zones()) {
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

        return impacts;
    }

    private boolean isCurrentOrFuture(AlertEntity alert) {
        OffsetDateTime endsAt = alert.getActivePeriodEnd();
        return endsAt == null || !endsAt.isBefore(OffsetDateTime.now(clock));
    }

    private boolean startsAtOrBefore(OffsetDateTime startsAt, OffsetDateTime now) {
        return startsAt == null || !startsAt.isAfter(now);
    }

    private boolean endsAfter(OffsetDateTime endsAt, OffsetDateTime now) {
        return endsAt == null || endsAt.isAfter(now);
    }

    private boolean isNightly(List<AlertActivePeriodRepository.AlertPeriod> periods) {
        if (periods == null || periods.isEmpty()) {
            return false;
        }
        if (periods.size() > 1) {
            return true;
        }
        return !"parent".equals(periods.getFirst().sourcePeriodId());
    }

    private WindowState windowState(AlertEntity alert, List<AlertActivePeriodRepository.AlertPeriod> periods) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        boolean hasStoredPeriods = periods != null && !periods.isEmpty();
        boolean parentOnlyRecurringWindow = hasStoredPeriods
            && periods.size() == 1
            && isParentPeriod(periods.getFirst())
            && isRecurringClosureParentWindow(alert);
        boolean recurringParentWindow = (!hasStoredPeriods || parentOnlyRecurringWindow)
            && isRecurringClosureParentWindow(alert);
        boolean hasUsablePeriods = hasStoredPeriods && !parentOnlyRecurringWindow;
        boolean hasChildPeriods = hasStoredPeriods && periods.stream().anyMatch(p -> !isParentPeriod(p));
        List<AlertActivePeriodRepository.AlertPeriod> usablePeriods = hasUsablePeriods
            ? (hasChildPeriods ? periods.stream().filter(p -> !isParentPeriod(p)).toList() : periods)
            : recurringParentWindow
                ? List.of()
                : List.of(new AlertActivePeriodRepository.AlertPeriod(
                alert.getId(),
                "parent",
                alert.getActivePeriodStart(),
                alert.getActivePeriodEnd(),
                0
            ));
        List<AlertActivePeriodRepository.AlertPeriod> reliablePeriods = usablePeriods.stream()
            .filter(period -> isReliableClosureWindow(alert, period))
            .toList();
        boolean nightly = isNightly(reliablePeriods) || recurringParentWindow;
        String windowHours = closureWindowHours(reliablePeriods);
        String windowDates = closureWindowDates(reliablePeriods, nightly, now);

        Optional<AlertActivePeriodRepository.AlertPeriod> active = reliablePeriods.stream()
            .filter(period -> !isParentPeriod(period))
            .filter(period -> startsAtOrBefore(period.startsAt(), now))
            .filter(period -> endsAfter(period.endsAt(), now))
            .findFirst();

        if (active.isPresent()) {
            AlertActivePeriodRepository.AlertPeriod period = active.orElseThrow();
            return new WindowState(true, "active-now", nightly,
                period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt()),
                null, null, null, windowHours, windowDates, period.sourcePeriodId());
        }

        Optional<AlertActivePeriodRepository.AlertPeriod> next = reliablePeriods.stream()
            .filter(period -> period.startsAt().isAfter(now))
            .min(Comparator.comparing(
                AlertActivePeriodRepository.AlertPeriod::startsAt,
                Comparator.naturalOrder()
            ));

        if (next.isPresent()) {
            AlertActivePeriodRepository.AlertPeriod period = next.orElseThrow();
            return new WindowState(false, "upcoming", nightly,
                null, null, null,
                period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt()),
                windowHours, windowDates, null);
        }

        return new WindowState(false, "unknown", nightly,
            null, null, null, null, null, null, windowHours, windowDates, null);
    }

    private boolean isReliableClosureWindow(
        AlertEntity alert,
        AlertActivePeriodRepository.AlertPeriod period
    ) {
        if (!isStructurallyValidClosureWindow(period)) {
            return false;
        }
        if (!isParentPeriod(period)) {
            return true;
        }
        OffsetDateTime publishedAt = sourceUpdatedAt(alert);
        if (publishedAt == null) {
            return false;
        }
        return period.startsAt().isAfter(publishedAt.plus(MAX_PUBLICATION_START_SKEW));
    }

    private boolean isStructurallyValidClosureWindow(
        AlertActivePeriodRepository.AlertPeriod period
    ) {
        return period != null
            && period.startsAt() != null
            && period.endsAt() != null
            && period.endsAt().isAfter(period.startsAt());
    }

    private String closureWindowHours(List<AlertActivePeriodRepository.AlertPeriod> periods) {
        LinkedHashSet<String> ranges = new LinkedHashSet<>();
        for (AlertActivePeriodRepository.AlertPeriod period : periods) {
            if (period.startsAt() == null || period.endsAt() == null) {
                continue;
            }
            ranges.add(
                WINDOW_HOURS_FORMATTER.format(period.startsAt().atZoneSameInstant(TORONTO_ZONE))
                    + " – "
                    + WINDOW_HOURS_FORMATTER.format(period.endsAt().atZoneSameInstant(TORONTO_ZONE))
            );
        }
        if (ranges.isEmpty()) {
            return null;
        }
        return ranges.size() == 1 ? ranges.getFirst() : "Varies by closure date";
    }

    private String closureWindowDates(
        List<AlertActivePeriodRepository.AlertPeriod> periods,
        boolean nightly,
        OffsetDateTime now
    ) {
        List<LocalDate> startDates = periods.stream()
            .map(AlertActivePeriodRepository.AlertPeriod::startsAt)
            .filter(java.util.Objects::nonNull)
            .map(value -> value.atZoneSameInstant(TORONTO_ZONE).toLocalDate())
            .distinct()
            .sorted()
            .toList();
        if (startDates.isEmpty()) {
            return null;
        }

        if (nightly) {
            return summarizedDates(startDates, now);
        }

        LocalDate firstDate = startDates.getFirst();
        LocalDate lastDate = periods.stream()
            .map(AlertActivePeriodRepository.AlertPeriod::endsAt)
            .filter(java.util.Objects::nonNull)
            .map(value -> value.atZoneSameInstant(TORONTO_ZONE).toLocalDate())
            .max(Comparator.naturalOrder())
            .orElse(firstDate);
        if (firstDate.equals(lastDate)) {
            return formattedClosureDate(firstDate, now);
        }
        return formattedClosureDate(firstDate, now) + " – " + formattedClosureDate(lastDate, now);
    }

    private String summarizedDates(List<LocalDate> dates, OffsetDateTime now) {
        if (dates.size() == 1) {
            return formattedClosureDate(dates.getFirst(), now);
        }
        boolean consecutive = true;
        for (int index = 1; index < dates.size(); index++) {
            if (!dates.get(index - 1).plusDays(1).equals(dates.get(index))) {
                consecutive = false;
                break;
            }
        }
        if (consecutive) {
            return formattedClosureDate(dates.getFirst(), now)
                + " – "
                + formattedClosureDate(dates.getLast(), now);
        }
        return dates.stream()
            .map(date -> formattedClosureDate(date, now))
            .collect(java.util.stream.Collectors.joining("; "));
    }

    private String formattedClosureDate(LocalDate date, OffsetDateTime now) {
        int currentTorontoYear = now.atZoneSameInstant(TORONTO_ZONE).getYear();
        DateTimeFormatter formatter = date.getYear() == currentTorontoYear
            ? WINDOW_DATE_FORMATTER
            : WINDOW_DATE_WITH_YEAR_FORMATTER;
        return formatter.format(date);
    }

    private boolean isParentPeriod(AlertActivePeriodRepository.AlertPeriod period) {
        return "parent".equalsIgnoreCase(period.sourcePeriodId());
    }

    private boolean isRecurringClosureParentWindow(AlertEntity alert) {
        OffsetDateTime startsAt = alert.getActivePeriodStart();
        OffsetDateTime endsAt = alert.getActivePeriodEnd();
        if (startsAt == null || endsAt == null) {
            return false;
        }
        if (Duration.between(startsAt, endsAt).compareTo(MAX_SINGLE_CLOSURE_WINDOW) <= 0) {
            return false;
        }
        String text = String.join(" ",
            nullToEmpty(alert.getTitle()),
            nullToEmpty(alert.getDescription()),
            nullToEmpty(alert.getEffectDescription()),
            nullToEmpty(alert.getCause()),
            nullToEmpty(alert.getCauseDescription()),
            nullToEmpty(alert.getRawPayload())
        ).toLowerCase(Locale.ROOT);
        return text.contains("nightly")
            || text.contains("closure windows")
            || text.contains("early access");
    }

    private record WindowState(
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
        String activeSourcePeriodId
    ) {}

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

    private PlannedClosureDto activeClosurePresentation(
        PlannedClosureView view,
        List<LineSegmentEntity> segments
    ) {
        PlannedClosureDto closure = view.closure();
        AlertEntity currentSourceAlert = view.currentSourceAlert();
        if (currentSourceAlert == null) {
            return closure;
        }
        TransitLineEntity line = currentSourceAlert.getLine();
        List<String> previewSegmentIds = closure.previewSegmentIds().isEmpty()
            ? affectedSegmentIds(currentSourceAlert, segments)
            : closure.previewSegmentIds();
        return new PlannedClosureDto(
            closure.id(),
            line == null ? closure.lineId() : line.getId(),
            line == null ? closure.lineNumber() : line.getNumber(),
            closureDisplayTitle(
                currentSourceAlert.getTitle(),
                closure.windowHours(),
                closure.windowDates(),
                closure.nightly(),
                isOvernightClosure(
                    closure.activeWindowStart() == null ? closure.nextWindowStart() : closure.activeWindowStart(),
                    closure.activeWindowEnd() == null ? closure.nextWindowEnd() : closure.activeWindowEnd()
                )
            ),
            closure.window(),
            location(currentSourceAlert),
            displayDirection(currentSourceAlert),
            currentSourceAlert.getDescription(),
            closure.startedAt(),
            sourceUpdatedAt(currentSourceAlert),
            previewSegmentIds,
            !isBlank(currentSourceAlert.getShuttleType()),
            sourceLabel(currentSourceAlert, "TTC Service Advisory"),
            cause(currentSourceAlert),
            resolution(currentSourceAlert),
            closure.activeNow(),
            closure.timingStatus(),
            closure.nightly(),
            closure.activeWindowStart(),
            closure.activeWindowEnd(),
            closure.activeWindowLabel(),
            closure.nextWindowStart(),
            closure.nextWindowEnd(),
            closure.nextWindowLabel(),
            closure.windowHours(),
            closure.windowDates(),
            closureNotificationTitle(currentSourceAlert.getTitle()),
            plannedClosureTravelDirection(currentSourceAlert, previewSegmentIds, segments)
        );
    }

    private ActiveAlertDto toActiveClosureAlert(
        PlannedClosureView view,
        List<LineSegmentEntity> segments
    ) {
        PlannedClosureDto closure = activeClosurePresentation(view, segments);
        AlertEntity currentSourceAlert = view.currentSourceAlert();
        return new ActiveAlertDto(
            currentSourceAlert == null ? closure.id() : currentSourceAlert.getId(),
            closure.lineId(),
            closure.lineNumber(),
            closure.title(),
            "planned",
            closure.location(),
            closure.displayDirection(),
            closure.description(),
            closure.activeWindowStart() == null ? closure.startedAt() : closure.activeWindowStart(),
            closure.updatedAt(),
            closure.previewSegmentIds(),
            closure.shuttle(),
            closure.source(),
            closure.cause(),
            closure.resolution(),
            currentSourceAlert == null ? null : view.closure().id(),
            closure.notificationTitle()
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

    private OffsetDateTime sourceUpdatedAt(AlertEntity alert) {
        OffsetDateTime sourceUpdatedAt = alert.getSourceUpdatedAt();
        if (sourceUpdatedAt == null) {
            return alert.getUpdatedAt();
        }
        return sourceUpdatedAt;
    }

    private PlannedClosureDto toPlannedClosure(AlertEntity alert, List<LineSegmentEntity> segments, WindowState ws) {
        TransitLineEntity line = alert.getLine();
        List<String> previewSegmentIds = affectedSegmentIds(alert, segments);
        return new PlannedClosureDto(
            alert.getId(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            closureDisplayTitle(alert.getTitle(), ws),
            displayWindow(alert, ws),
            location(alert),
            displayDirection(alert),
            alert.getDescription(),
            alert.getActivePeriodStart(),
            alert.getSourceUpdatedAt(),
            previewSegmentIds,
            !isBlank(alert.getShuttleType()),
            sourceLabel(alert, "TTC Service Advisory"),
            cause(alert),
            resolution(alert),
            ws.activeNow(),
            ws.timingStatus(),
            ws.nightly(),
            ws.activeWindowStart(),
            ws.activeWindowEnd(),
            ws.activeWindowLabel(),
            ws.nextWindowStart(),
            ws.nextWindowEnd(),
            ws.nextWindowLabel(),
            ws.windowHours(),
            ws.windowDates(),
            closureNotificationTitle(alert.getTitle()),
            plannedClosureTravelDirection(alert, previewSegmentIds, segments)
        );
    }

    private String plannedClosureTravelDirection(
        AlertEntity alert,
        List<String> previewSegmentIds,
        List<LineSegmentEntity> segments
    ) {
        if (previewSegmentIds.isEmpty()) {
            return "bidirectional";
        }
        return segments.stream()
            .filter(segment -> previewSegmentIds.getFirst().equals(segment.getId()))
            .findFirst()
            .map(segment -> travelDirection(alert, segment))
            .orElse("bidirectional");
    }

    private String closureNotificationTitle(String title) {
        if (isBlank(title)) {
            return title;
        }
        return TRUNCATED_CLOSURE_START.matcher(title.trim()).replaceFirst("").trim();
    }

    private String closureDisplayTitle(String title, WindowState ws) {
        OffsetDateTime windowStart = ws.activeWindowStart() == null
            ? ws.nextWindowStart()
            : ws.activeWindowStart();
        OffsetDateTime windowEnd = ws.activeWindowEnd() == null
            ? ws.nextWindowEnd()
            : ws.activeWindowEnd();
        return closureDisplayTitle(
            title,
            ws.windowHours(),
            ws.windowDates(),
            ws.nightly(),
            isOvernightClosure(windowStart, windowEnd)
        );
    }

    private String closureDisplayTitle(
        String title,
        String windowHours,
        String windowDates,
        boolean nightly,
        boolean overnight
    ) {
        if (isBlank(title)) {
            return title;
        }
        String trimmed = title.trim();
        java.util.regex.Matcher matcher = TRUNCATED_CLOSURE_START.matcher(trimmed);
        if (!matcher.find()) {
            return trimmed;
        }

        String baseTitle = matcher.replaceFirst("").replaceFirst("[\\s,;:.]+$", "").trim();
        String hours = naturalClosureHours(windowHours);
        String dates = naturalClosureDates(windowDates);
        if (hours == null && dates == null) {
            return baseTitle;
        }

        StringBuilder titleBuilder = new StringBuilder(baseTitle);
        if (dates != null) {
            titleBuilder.append(overnight ? " overnight from " : " from ").append(dates);
        } else if (overnight) {
            titleBuilder.append(" overnight");
        }
        titleBuilder.append('.');
        if (hours != null) {
            String closureSubject = overnight && nightly
                ? "Each nightly closure"
                : nightly
                    ? "Each scheduled closure"
                    : "The closure";
            titleBuilder.append(' ')
                .append(closureSubject)
                .append(" runs from ")
                .append(hours);
            if (overnight) {
                titleBuilder.append(" the following morning");
            }
            titleBuilder.append('.');
        }
        return titleBuilder.toString();
    }

    private boolean isOvernightClosure(OffsetDateTime startsAt, OffsetDateTime endsAt) {
        if (startsAt == null || endsAt == null) {
            return false;
        }
        LocalDate localStartDate = startsAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        LocalDate localEndDate = endsAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        return localEndDate.isAfter(localStartDate);
    }

    private String naturalClosureHours(String windowHours) {
        if (isBlank(windowHours) || "Varies by closure date".equalsIgnoreCase(windowHours)) {
            return null;
        }
        return windowHours.replace(" – ", " until ");
    }

    private String naturalClosureDates(String windowDates) {
        if (isBlank(windowDates)) {
            return null;
        }
        String natural = windowDates.replace(" – ", " through ").replace("; ", ", ");
        String[][] names = {
            {"Mon", "Monday"}, {"Tue", "Tuesday"}, {"Wed", "Wednesday"},
            {"Thu", "Thursday"}, {"Fri", "Friday"}, {"Sat", "Saturday"}, {"Sun", "Sunday"},
            {"Jan", "January"}, {"Feb", "February"}, {"Mar", "March"}, {"Apr", "April"},
            {"Jun", "June"}, {"Jul", "July"}, {"Aug", "August"}, {"Sep", "September"},
            {"Oct", "October"}, {"Nov", "November"}, {"Dec", "December"}
        };
        for (String[] name : names) {
            natural = natural.replaceAll("\\b" + name[0] + "\\b", name[1]);
        }
        return natural;
    }

    private String displayWindow(AlertEntity alert, WindowState ws) {
        if (ws.nightly()) {
            return "Nightly closure windows";
        }
        if ("unknown".equals(ws.timingStatus())) {
            return "Closure timing unavailable";
        }
        return window(alert.getActivePeriodStart(), alert.getActivePeriodEnd());
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
        if (alert.getStartStationId().equals(alert.getEndStationId())) {
            return stationLabel(alert.getStartStationId());
        }
        return stationLabel(alert.getStartStationId()) + " to " + stationLabel(alert.getEndStationId());
    }

    private String displayDirection(AlertEntity alert) {
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

    private boolean isUnionLineOneStationOnlyAlert(AlertEntity alert) {
        TransitLineEntity line = alert.getLine();
        return line != null
            && "line-1".equals(line.getId())
            && "union".equals(alert.getStartStationId())
            && "union".equals(alert.getEndStationId());
    }

    private Optional<String> unionLineOneTerminal(AlertEntity alert) {
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

    private String travelDirection(AlertEntity alert, LineSegmentEntity segment) {
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

    private AlertDirection opposite(AlertDirection direction) {
        return switch (direction) {
            case NORTHBOUND -> AlertDirection.SOUTHBOUND;
            case SOUTHBOUND -> AlertDirection.NORTHBOUND;
            case EASTBOUND -> AlertDirection.WESTBOUND;
            case WESTBOUND -> AlertDirection.EASTBOUND;
            case BIDIRECTIONAL, UNKNOWN -> AlertDirection.UNKNOWN;
        };
    }

    private String bidirectionalLabel(TransitLineEntity line) {
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
                .map(detail -> new DirectionalDetailDto(
                    detail.sourceAlertId(),
                    detail.displayDirection(),
                    detail.location(),
                    detail.description()
                ))
                .toList(),
            sourceLabel(first, "TTC Live Alerts"),
            firstNonBlank(zone.sourceAlerts(), this::cause),
            groupedResolution(zone.sourceAlerts()),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getRszLength),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getStationDistance),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getTrackPercent),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getReducedSpeed),
            firstNonBlank(zone.sourceAlerts(), AlertEntity::getAverageSpeed)
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

    private String sourceLabel(AlertEntity alert, String liveAlertsDefault) {
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

    private String stationLabel(String stationId) {
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
            if (!firstResolutionSet) {
                resolution = value;
                firstResolutionSet = true;
            } else if (!resolution.equals(value)) {
                multipleDates = true;
            }
        }
        return multipleDates ? "Multiple dates" : resolution;
    }

    private String cause(AlertEntity alert) {
        if (!isBlank(alert.getCauseDescription())) {
            return cleanMetadataValue(alert.getCauseDescription());
        }
        if (!isBlank(alert.getCause())) {
            return cleanMetadataValue(alert.getCause());
        }
        return null;
    }

    private String resolution(AlertEntity alert) {
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
        Map<String, Integer> segmentOrders = segmentOrders(segments);
        return Comparator
            .comparingInt((PlannedClosureDto dto) -> lineSortOrder(dto.lineId(), dto.lineNumber()))
            .thenComparingInt(dto -> firstSegmentOrder(dto.previewSegmentIds(), segmentOrders))
            .thenComparing(PlannedClosureDto::startedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(PlannedClosureDto::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private Map<String, Integer> segmentOrders(List<LineSegmentEntity> segments) {
        Map<String, Integer> orders = new LinkedHashMap<>();
        for (LineSegmentEntity segment : segments) {
            orders.put(segment.getId(), segment.getSortOrder());
        }
        return orders;
    }

    private int firstSegmentOrder(List<String> segmentIds, Map<String, Integer> segmentOrders) {
        if (segmentIds == null || segmentIds.isEmpty()) {
            return Integer.MAX_VALUE;
        }
        return segmentIds.stream()
            .map(segmentOrders::get)
            .filter(order -> order != null)
            .min(Integer::compareTo)
            .orElse(Integer.MAX_VALUE);
    }

    private int lineSortOrder(String lineId, String lineNumber) {
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

    private boolean hasImpactKind(AlertEntity alert, String kind) {
        return kind.equalsIgnoreCase(alert.getImpactKind());
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String nullToEmpty(String value) {
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
        String travelDirection
    ) {
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
    }

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
