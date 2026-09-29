package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.alert.AlertActivePeriodRepository.AlertPeriod;
import com.calebhabesh.linewatch.alert.AlertDashboardService.ActiveAlertDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.PlannedClosureDto;
import com.calebhabesh.linewatch.alert.AlertDashboardService.SegmentImpact;
import com.calebhabesh.linewatch.ingestion.TtcServiceState;
import com.calebhabesh.linewatch.station.LineSegmentEntity;
import com.calebhabesh.linewatch.station.TransitLineEntity;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Pure projector for canonical TTC planned subway and LRT closures.
 *
 * <p>Accepts loaded records, active periods, reviewed segments, and an explicit
 * evaluation time, computing temporal window state, canonical parent projections,
 * and active-child operational details without HTTP, repository, or clock dependencies.</p>
 */
@Component
public class TtcClosureProjector {
    public static final String PLANNED_CLOSURE_TYPE = "planned-closure";
    public static final String PLANNED_CLOSURE_KIND = "planned-closure";
    public static final String SUSPENSION_KIND = "suspension";

    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter WINDOW_DATE_TIME_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_DATE_TIME_WITH_YEAR_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d, uuuu · h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_DAY_TIME_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter WINDOW_DAY_TIME_WITH_YEAR_FORMATTER =
        DateTimeFormatter.ofPattern("EEE, MMM d, uuuu h:mm a", Locale.ENGLISH);
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
    private static final String MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
    private static final Pattern PUBLISHED_DATE_RANGE = Pattern.compile(
        "(?i)\\b(" + MONTHS + ")\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\s+(?:to|[–—-])\\s+"
            + "(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s+)?"
            + "(" + MONTHS + ")\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b"
    );
    private static final DateTimeFormatter PUBLISHED_DATE = new java.time.format.DateTimeFormatterBuilder()
        .parseCaseInsensitive().appendPattern("MMMM d uuuu").toFormatter(Locale.ENGLISH)
        .withResolverStyle(java.time.format.ResolverStyle.STRICT);

    private final AlertSegmentMatcher segmentMatcher;

    @Autowired
    public TtcClosureProjector(AlertSegmentMatcher segmentMatcher) {
        this.segmentMatcher = Objects.requireNonNull(segmentMatcher, "segmentMatcher");
    }

    public TtcClosureProjector() {
        this(new AlertSegmentMatcher());
    }

    /**
     * Projects canonical closures given alerts, periods, segments, and explicit evaluation instant.
     */
    public List<ClosureProjection> project(
        Collection<AlertEntity> alerts,
        Map<String, List<AlertPeriod>> periodsByAlertId,
        List<LineSegmentEntity> segments,
        Instant evaluationTime
    ) {
        Objects.requireNonNull(evaluationTime, "evaluationTime");
        return project(
            alerts,
            periodsByAlertId,
            segments,
            evaluationTime.atZone(TORONTO_ZONE).toOffsetDateTime()
        );
    }

    /**
     * Projects canonical closures given alerts, periods, segments, and explicit evaluation time.
     */
    public List<ClosureProjection> project(
        Collection<AlertEntity> alerts,
        Map<String, List<AlertPeriod>> periodsByAlertId,
        List<LineSegmentEntity> segments,
        OffsetDateTime evaluationTime
    ) {
        Objects.requireNonNull(evaluationTime, "evaluationTime");
        if (alerts == null || alerts.isEmpty()) {
            return List.of();
        }

        List<LineSegmentEntity> safeSegments = segments == null ? List.of() : segments;
        Map<String, List<AlertPeriod>> safePeriods = periodsByAlertId == null ? Map.of() : periodsByAlertId;

        // Keep completion signals from inactive or expired children. Their parent can
        // still carry the original scheduled end after the child leaves the live feed.
        Set<String> completedSourceIds = alerts.stream()
            .filter(Objects::nonNull)
            .filter(alert -> TtcServiceState.hasEndedEarlyStatus(alert.getTitle()))
            .map(AlertEntity::getSourceId)
            .filter(sourceId -> !AlertDashboardService.isBlank(sourceId))
            .collect(Collectors.toSet());

        List<AlertEntity> sourceAlerts = alerts.stream()
            .filter(Objects::nonNull)
            .filter(AlertEntity::isActive)
            .filter(alert -> alert.getType() == null || PLANNED_CLOSURE_TYPE.equalsIgnoreCase(alert.getType()))
            .filter(alert -> PLANNED_CLOSURE_KIND.equalsIgnoreCase(alert.getImpactKind())
                || "limited-service".equalsIgnoreCase(alert.getImpactKind()))
            .filter(alert -> isCurrentOrFuture(alert, evaluationTime))
            .toList();

        if (sourceAlerts.isEmpty()) {
            return List.of();
        }

        Map<String, AlertEntity> alertsBySourceId = alerts.stream()
            .filter(Objects::nonNull)
            .filter(AlertEntity::isActive)
            .filter(alert -> isCurrentOrFuture(alert, evaluationTime))
            .filter(alert -> !AlertDashboardService.isBlank(alert.getSourceId()))
            .collect(Collectors.toMap(
                AlertEntity::getSourceId,
                Function.identity(),
                (first, ignored) -> first,
                LinkedHashMap::new
            ));

        Set<String> linkedChildSourceIds = new LinkedHashSet<>();
        for (List<AlertPeriod> periods : safePeriods.values()) {
            if (periods == null) {
                continue;
            }
            for (AlertPeriod period : periods) {
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
                List<AlertPeriod> periods = safePeriods.get(alert.getId());
                boolean completedChildWindow = periods != null && periods.stream()
                    .anyMatch(period -> !isParentPeriod(period)
                        && completedSourceIds.contains(period.sourcePeriodId()));
                if (completedChildWindow) {
                    periods = periods.stream()
                        .filter(period -> !isParentPeriod(period))
                        .filter(period -> !completedSourceIds.contains(period.sourcePeriodId()))
                        .toList();
                    if (periods.isEmpty()) {
                        return Optional.<ClosureProjection>empty();
                    }
                }
                WindowState ws = windowState(alert, periods, evaluationTime);
                if (completedChildWindow && "unknown".equals(ws.timingStatus())) {
                    return Optional.<ClosureProjection>empty();
                }
                PlannedClosureDto canonicalClosure = toPlannedClosure(alert, safeSegments, ws, evaluationTime);
                AlertEntity currentSourceAlert = ws.activeSourcePeriodId() == null
                    ? null
                    : currentClosureSourceAlert(alertsBySourceId.get(ws.activeSourcePeriodId()));
                PlannedClosureDto activePresentation = ws.activeNow()
                    ? activeClosurePresentation(canonicalClosure, currentSourceAlert, safeSegments)
                    : canonicalClosure;
                ActiveAlertDto activeClosureAlert = ws.activeNow()
                    ? toActiveClosureAlert(activePresentation, currentSourceAlert, canonicalClosure.id())
                    : null;
                return Optional.of(new ClosureProjection(
                    canonicalClosure,
                    currentSourceAlert,
                    activePresentation,
                    activeClosureAlert
                ));
            })
            .flatMap(Optional::stream)
            .toList();
    }

    /**
     * Convenience projection returning the canonical planned closures list sorted by canonical order.
     */
    public List<PlannedClosureDto> plannedClosures(
        Collection<AlertEntity> alerts,
        Map<String, List<AlertPeriod>> periodsByAlertId,
        List<LineSegmentEntity> segments,
        OffsetDateTime evaluationTime
    ) {
        return project(alerts, periodsByAlertId, segments, evaluationTime).stream()
            .map(ClosureProjection::canonicalClosure)
            .sorted(plannedClosureComparator(segments))
            .toList();
    }

    /**
     * Convenience projection returning the active planned closures presentation sorted by canonical order.
     */
    public List<PlannedClosureDto> activePlannedClosures(
        Collection<AlertEntity> alerts,
        Map<String, List<AlertPeriod>> periodsByAlertId,
        List<LineSegmentEntity> segments,
        OffsetDateTime evaluationTime
    ) {
        return project(alerts, periodsByAlertId, segments, evaluationTime).stream()
            .filter(ClosureProjection::activeNow)
            .map(ClosureProjection::activePresentation)
            .sorted(plannedClosureComparator(segments))
            .toList();
    }

    /**
     * Convenience projection returning the active closure alerts for inclusion in the active alerts list.
     */
    public List<ActiveAlertDto> activeClosureAlerts(
        Collection<AlertEntity> alerts,
        Map<String, List<AlertPeriod>> periodsByAlertId,
        List<LineSegmentEntity> segments,
        OffsetDateTime evaluationTime
    ) {
        return project(alerts, periodsByAlertId, segments, evaluationTime).stream()
            .filter(ClosureProjection::activeNow)
            .map(ClosureProjection::activeClosureAlert)
            .toList();
    }

    private boolean isCurrentOrFuture(AlertEntity alert, OffsetDateTime evaluationTime) {
        OffsetDateTime endsAt = alert.getActivePeriodEnd();
        return endsAt == null || !endsAt.isBefore(evaluationTime);
    }

    private boolean startsAtOrBefore(OffsetDateTime startsAt, OffsetDateTime now) {
        return startsAt == null || !startsAt.isAfter(now);
    }

    private boolean endsAfter(OffsetDateTime endsAt, OffsetDateTime now) {
        return endsAt == null || endsAt.isAfter(now);
    }

    private boolean isNightly(
        AlertEntity alert,
        List<AlertPeriod> periods
    ) {
        if (periods == null || periods.isEmpty()) {
            return false;
        }
        String alertText = String.join(" ",
            AlertDashboardService.nullToEmpty(alert.getTitle()),
            AlertDashboardService.nullToEmpty(alert.getDescription()),
            AlertDashboardService.nullToEmpty(alert.getEffectDescription())
        ).toLowerCase(Locale.ROOT);
        if (alertText.contains("late opening")
            || alertText.matches(
                "(?s).*\\b(?:service|trains?)\\s+(?:(?:will\\s+)?start|starts?)"
                    + "\\s+(?:at|by)\\b.*"
            )) {
            return false;
        }
        if (alertText.contains("nightly")
            || alertText.contains("each night")
            || alertText.contains("every night")) {
            return true;
        }
        if (periods.size() > 1) {
            return true;
        }
        AlertPeriod period = periods.getFirst();
        if (isParentPeriod(period) || period.startsAt() == null || period.endsAt() == null) {
            return false;
        }
        LocalDate startsOn = period.startsAt().atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        LocalDate endsOn = period.endsAt().atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        return endsOn.isAfter(startsOn)
            && Duration.between(period.startsAt(), period.endsAt()).compareTo(Duration.ofHours(12)) <= 0;
    }

    private WindowState windowState(
        AlertEntity alert,
        List<AlertPeriod> periods,
        OffsetDateTime now
    ) {
        boolean hasStoredPeriods = periods != null && !periods.isEmpty();
        boolean parentOnlyRecurringWindow = hasStoredPeriods
            && periods.size() == 1
            && isParentPeriod(periods.getFirst())
            && isRecurringClosureParentWindow(alert);
        boolean recurringParentWindow = (!hasStoredPeriods || parentOnlyRecurringWindow)
            && isRecurringClosureParentWindow(alert);
        boolean hasUsablePeriods = hasStoredPeriods && !parentOnlyRecurringWindow;
        boolean hasChildPeriods = hasStoredPeriods && periods.stream().anyMatch(p -> !isParentPeriod(p));
        List<AlertPeriod> usablePeriods = hasUsablePeriods
            ? (hasChildPeriods ? periods.stream().filter(p -> !isParentPeriod(p)).toList() : periods)
            : recurringParentWindow
                ? List.of()
                : List.of(new AlertPeriod(
                alert.getId(),
                "parent",
                alert.getActivePeriodStart(),
                alert.getActivePeriodEnd(),
                0,
                false
            ));
        List<AlertPeriod> reliablePeriods = usablePeriods.stream()
            .filter(period -> isReliableClosureWindow(alert, period))
            .toList();
        boolean nightly = isNightly(alert, reliablePeriods) || recurringParentWindow;
        String windowHours = closureWindowHours(reliablePeriods);
        String windowDates = closureWindowDates(alert, reliablePeriods, nightly, now);

        Optional<AlertPeriod> active = reliablePeriods.stream()
            .filter(period -> !isParentPeriod(period)
                || isBoundedSingleWindow(period)
                || period.sourceCurrentContinuous())
            .filter(period -> startsAtOrBefore(period.startsAt(), now))
            .filter(period -> endsAfter(period.endsAt(), now))
            .findFirst();

        if (active.isPresent()) {
            AlertPeriod period = active.orElseThrow();
            return new WindowState(true, "active-now", nightly,
                period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt(), now),
                null, null, null, windowHours, windowDates, period.sourcePeriodId());
        }

        Optional<AlertPeriod> next = reliablePeriods.stream()
            .filter(period -> period.startsAt().isAfter(now))
            .min(Comparator.comparing(
                AlertPeriod::startsAt,
                Comparator.naturalOrder()
            ));

        if (next.isPresent()) {
            AlertPeriod period = next.orElseThrow();
            return new WindowState(false, "upcoming", nightly,
                null, null, null,
                period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt(), now),
                windowHours, windowDates, null);
        }

        return new WindowState(false, "unknown", nightly,
            null, null, null, null, null, null, windowHours, windowDates, null);
    }

    private boolean isReliableClosureWindow(
        AlertEntity alert,
        AlertPeriod period
    ) {
        if (!isStructurallyValidClosureWindow(period)) {
            return false;
        }
        if (period.sourceCurrentContinuous()) {
            return true;
        }
        if (!isParentPeriod(period) || isBoundedSingleWindow(period)) {
            return true;
        }
        OffsetDateTime publishedAt = AlertDashboardService.sourceUpdatedAt(alert);
        if (publishedAt == null) {
            return false;
        }
        return period.startsAt().isAfter(publishedAt.plus(MAX_PUBLICATION_START_SKEW));
    }

    private boolean isStructurallyValidClosureWindow(AlertPeriod period) {
        return period != null
            && period.startsAt() != null
            && period.endsAt() != null
            && period.endsAt().isAfter(period.startsAt());
    }

    private boolean isBoundedSingleWindow(AlertPeriod period) {
        return isStructurallyValidClosureWindow(period)
            && Duration.between(period.startsAt(), period.endsAt()).compareTo(MAX_SINGLE_CLOSURE_WINDOW) <= 0;
    }

    private String closureWindowHours(List<AlertPeriod> periods) {
        LinkedHashSet<String> ranges = new LinkedHashSet<>();
        for (AlertPeriod period : periods) {
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
        return ranges.size() == 1 ? ranges.getFirst() : "Varies by advisory date";
    }

    private String closureWindowDates(
        AlertEntity alert,
        List<AlertPeriod> periods,
        boolean nightly,
        OffsetDateTime now
    ) {
        List<LocalDate> startDates = periods.stream()
            .map(AlertPeriod::startsAt)
            .filter(Objects::nonNull)
            .map(value -> value.atZoneSameInstant(TORONTO_ZONE).toLocalDate())
            .distinct()
            .sorted()
            .toList();
        if (nightly) {
            List<LocalDate> published = publishedNightlyDateRange(alert, startDates);
            if (!published.isEmpty()) return summarizedDates(published, now);
        }
        if (startDates.isEmpty()) {
            return null;
        }

        if (nightly) {
            return summarizedDates(startDates, now);
        }

        LocalDate firstDate = startDates.getFirst();
        LocalDate lastDate = periods.stream()
            .map(AlertPeriod::endsAt)
            .filter(Objects::nonNull)
            .map(value -> value.atZoneSameInstant(TORONTO_ZONE).toLocalDate())
            .max(Comparator.naturalOrder())
            .orElse(firstDate);
        if (firstDate.equals(lastDate)) {
            return formattedClosureDate(firstDate, now);
        }
        return formattedClosureDate(firstDate, now) + " – " + formattedClosureDate(lastDate, now);
    }

    // Published date copy supplies display context only. It never creates an
    // occurrence or changes an active/next window when past periods leave the feed.
    private List<LocalDate> publishedNightlyDateRange(AlertEntity alert, List<LocalDate> occurrenceDates) {
        OffsetDateTime anchor = alert.getActivePeriodEnd() == null ? alert.getActivePeriodStart() : alert.getActivePeriodEnd();
        if (anchor == null && occurrenceDates.isEmpty()) return List.of();
        int anchorYear = occurrenceDates.isEmpty() ? anchor.atZoneSameInstant(TORONTO_ZONE).getYear() : occurrenceDates.getLast().getYear();
        java.util.regex.Matcher matcher = PUBLISHED_DATE_RANGE.matcher(
            AlertDashboardService.nullToEmpty(alert.getTitle()) + " " + AlertDashboardService.nullToEmpty(alert.getDescription()));
        while (matcher.find()) {
            try {
                int endYear = matcher.group(6) == null ? anchorYear : Integer.parseInt(matcher.group(6));
                LocalDate end = LocalDate.parse(matcher.group(4) + " " + matcher.group(5) + " " + endYear, PUBLISHED_DATE);
                int startYear = matcher.group(3) == null ? endYear : Integer.parseInt(matcher.group(3));
                LocalDate start = LocalDate.parse(matcher.group(1) + " " + matcher.group(2) + " " + startYear, PUBLISHED_DATE);
                if (matcher.group(3) == null && start.isAfter(end)) start = start.minusYears(1);
                if (start.isAfter(end) || java.time.temporal.ChronoUnit.DAYS.between(start, end) > 366) continue;
                LocalDate publishedStart = start;
                if (occurrenceDates.stream().anyMatch(date -> date.isBefore(publishedStart) || date.isAfter(end))) continue;
                return start.datesUntil(end.plusDays(1)).toList();
            } catch (java.time.DateTimeException | NumberFormatException ignored) {
                // Malformed publication copy leaves verified occurrence dates intact.
            }
        }
        return List.of();
    }

    private String summarizedDates(List<LocalDate> dates, OffsetDateTime now) {
        if (dates == null || dates.isEmpty()) {
            return null;
        }
        if (dates.size() == 1) {
            return formattedClosureDate(dates.getFirst(), now);
        }
        List<String> formattedSpans = new ArrayList<>();
        int i = 0;
        while (i < dates.size()) {
            LocalDate start = dates.get(i);
            LocalDate end = start;
            while (i + 1 < dates.size() && dates.get(i + 1).equals(end.plusDays(1))) {
                end = dates.get(i + 1);
                i++;
            }
            if (start.equals(end)) {
                formattedSpans.add(formattedClosureDate(start, now));
            } else {
                formattedSpans.add(formattedClosureDate(start, now) + " – " + formattedClosureDate(end, now));
            }
            i++;
        }
        return String.join("; ", formattedSpans);
    }

    private String formattedClosureDate(LocalDate date, OffsetDateTime now) {
        int currentTorontoYear = now.atZoneSameInstant(TORONTO_ZONE).getYear();
        DateTimeFormatter formatter = date.getYear() == currentTorontoYear
            ? WINDOW_DATE_FORMATTER
            : WINDOW_DATE_WITH_YEAR_FORMATTER;
        return formatter.format(date);
    }

    private boolean isParentPeriod(AlertPeriod period) {
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
            AlertDashboardService.nullToEmpty(alert.getTitle()),
            AlertDashboardService.nullToEmpty(alert.getDescription()),
            AlertDashboardService.nullToEmpty(alert.getEffectDescription()),
            AlertDashboardService.nullToEmpty(alert.getCause()),
            AlertDashboardService.nullToEmpty(alert.getCauseDescription()),
            AlertDashboardService.nullToEmpty(alert.getRawPayload())
        ).toLowerCase(Locale.ROOT);
        return text.contains("nightly")
            || text.contains("closure windows")
            || text.contains("early access");
    }

    private AlertEntity currentClosureSourceAlert(AlertEntity alert) {
        return alert == null || isRestoration(alert)
            || !Set.of("limited-service", "delay", "suspension", "planned-closure").contains(
                AlertDashboardService.nullToEmpty(alert.getImpactKind())) ? null : alert;
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

    private PlannedClosureDto toPlannedClosure(
        AlertEntity alert,
        List<LineSegmentEntity> segments,
        WindowState ws,
        OffsetDateTime evaluationTime
    ) {
        TransitLineEntity line = alert.getLine();
        List<String> previewSegmentIds = affectedSegmentIds(alert, segments);
        return new PlannedClosureDto(
            alert.getId(),
            line == null ? null : line.getId(),
            line == null ? null : line.getNumber(),
            closureDisplayTitle(alert.getTitle(), ws),
            displayWindow(alert, ws, evaluationTime),
            AlertDashboardService.location(alert),
            AlertDashboardService.displayDirection(alert),
            alert.getDescription(),
            alert.getActivePeriodStart(),
            alert.getSourceUpdatedAt(),
            previewSegmentIds,
            !AlertDashboardService.isBlank(alert.getShuttleType()),
            AlertDashboardService.sourceLabel(alert, "TTC Service Advisory"),
            AlertDashboardService.cause(alert),
            AlertDashboardService.resolution(alert),
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
        ).withServiceEffect("limited-service".equals(alert.getImpactKind()) ? "limited-service" : "suspension")
            .withPreviewStationIds(previewSegmentIds.isEmpty() ? alert.getStationIds() : List.of());
    }

    private PlannedClosureDto activeClosurePresentation(
        PlannedClosureDto closure,
        AlertEntity currentSourceAlert,
        List<LineSegmentEntity> segments
    ) {
        if (currentSourceAlert == null) {
            return closure;
        }
        TransitLineEntity line = currentSourceAlert.getLine();
        List<String> childSegmentIds = affectedSegmentIds(currentSourceAlert, segments);
        boolean hasChildScope = (!AlertDashboardService.isBlank(currentSourceAlert.getStartStationId())
            && !AlertDashboardService.isBlank(currentSourceAlert.getEndStationId()))
            || !currentSourceAlert.getStationIds().isEmpty();
        List<String> previewSegmentIds = childSegmentIds.isEmpty() && !hasChildScope
            ? closure.previewSegmentIds() : childSegmentIds;
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
            AlertDashboardService.location(currentSourceAlert),
            AlertDashboardService.displayDirection(currentSourceAlert),
            currentSourceAlert.getDescription(),
            closure.startedAt(),
            AlertDashboardService.sourceUpdatedAt(currentSourceAlert),
            previewSegmentIds,
            !AlertDashboardService.isBlank(currentSourceAlert.getShuttleType()),
            AlertDashboardService.sourceLabel(currentSourceAlert, "TTC Service Advisory"),
            AlertDashboardService.cause(currentSourceAlert),
            AlertDashboardService.resolution(currentSourceAlert),
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
        ).withServiceEffect("limited-service".equals(currentSourceAlert.getImpactKind()) ? "limited-service"
            : "delay".equals(currentSourceAlert.getImpactKind()) ? "delay" : "suspension")
            .withPreviewStationIds(previewSegmentIds.isEmpty() ? currentSourceAlert.getStationIds() : List.of());
    }

    private ActiveAlertDto toActiveClosureAlert(
        PlannedClosureDto closure,
        AlertEntity currentSourceAlert,
        String canonicalClosureId
    ) {
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
            currentSourceAlert == null ? null : canonicalClosureId,
            closure.notificationTitle()
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
            .map(segment -> AlertDashboardService.travelDirection(alert, segment))
            .orElse("bidirectional");
    }

    private String closureNotificationTitle(String title) {
        if (AlertDashboardService.isBlank(title)) {
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

    static String closureDisplayTitle(
        String title,
        String windowHours,
        String windowDates,
        boolean nightly,
        boolean overnight
    ) {
        if (AlertDashboardService.isBlank(title)) {
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
        boolean discreteOccurrences = windowDates != null && windowDates.contains(";");
        boolean isDateRange = windowDates != null && (windowDates.contains("–") || windowDates.contains("—") || windowDates.contains(" - "));
        if (hours == null && dates == null) {
            return baseTitle;
        }

        StringBuilder titleBuilder = new StringBuilder(baseTitle);
        if (dates != null) {
            String dateConnector;
            if (isDateRange && !discreteOccurrences) {
                dateConnector = overnight ? " overnight from " : " from ";
            } else {
                dateConnector = overnight ? " overnight on " : " on ";
            }
            titleBuilder.append(dateConnector).append(dates);
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

    private static boolean isOvernightClosure(OffsetDateTime startsAt, OffsetDateTime endsAt) {
        if (startsAt == null || endsAt == null) {
            return false;
        }
        LocalDate localStartDate = startsAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        LocalDate localEndDate = endsAt.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        return localEndDate.isAfter(localStartDate);
    }

    private static String naturalClosureHours(String windowHours) {
        if (AlertDashboardService.isBlank(windowHours) || "Varies by advisory date".equalsIgnoreCase(windowHours)
            || "Varies by closure date".equalsIgnoreCase(windowHours)) {
            return null;
        }
        return windowHours.replace(" – ", " until ");
    }

    private static String naturalClosureDates(String windowDates) {
        if (AlertDashboardService.isBlank(windowDates)) {
            return null;
        }
        List<String> occurrences = java.util.Arrays.stream(windowDates.split(";\\s*"))
            .map(TtcClosureProjector::expandedClosureDateNames)
            .toList();
        if (occurrences.size() == 2) {
            return occurrences.getFirst() + " and " + occurrences.getLast();
        }
        if (occurrences.size() > 2) {
            return String.join(", ", occurrences.subList(0, occurrences.size() - 1))
                + ", and "
                + occurrences.getLast();
        }
        return occurrences.getFirst();
    }

    private static String expandedClosureDateNames(String windowDate) {
        String natural = windowDate.replaceAll("\\s*[–—-]+\\s*", " to ");
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

    private String displayWindow(AlertEntity alert, WindowState ws, OffsetDateTime evaluationTime) {
        if (ws.nightly()) {
            return "Nightly closure windows";
        }
        if ("unknown".equals(ws.timingStatus())) {
            return "Closure timing unavailable";
        }
        return window(alert.getActivePeriodStart(), alert.getActivePeriodEnd(), evaluationTime);
    }

    static String window(OffsetDateTime startsAt, OffsetDateTime endsAt, OffsetDateTime evaluationTime) {
        if (startsAt == null && endsAt == null) {
            return "Timing TBD";
        }
        int currentTorontoYear = evaluationTime.atZoneSameInstant(TORONTO_ZONE).getYear();
        if (startsAt == null) {
            ZonedDateTime endZdt = endsAt.atZoneSameInstant(TORONTO_ZONE);
            DateTimeFormatter formatter = endZdt.getYear() == currentTorontoYear
                ? WINDOW_DATE_TIME_FORMATTER
                : WINDOW_DATE_TIME_WITH_YEAR_FORMATTER;
            return "Until " + formatter.format(endZdt);
        }
        if (endsAt == null) {
            ZonedDateTime startZdt = startsAt.atZoneSameInstant(TORONTO_ZONE);
            DateTimeFormatter formatter = startZdt.getYear() == currentTorontoYear
                ? WINDOW_DATE_TIME_FORMATTER
                : WINDOW_DATE_TIME_WITH_YEAR_FORMATTER;
            return "From " + formatter.format(startZdt);
        }

        ZonedDateTime startZdt = startsAt.atZoneSameInstant(TORONTO_ZONE);
        ZonedDateTime endZdt = endsAt.atZoneSameInstant(TORONTO_ZONE);
        LocalDate startDate = startZdt.toLocalDate();
        LocalDate endDate = endZdt.toLocalDate();

        DateTimeFormatter startFormatter = startZdt.getYear() == currentTorontoYear
            ? WINDOW_DATE_TIME_FORMATTER
            : WINDOW_DATE_TIME_WITH_YEAR_FORMATTER;

        if (startDate.equals(endDate)) {
            return startFormatter.format(startZdt) + " – " + WINDOW_HOURS_FORMATTER.format(endZdt);
        }

        if (endDate.equals(startDate.plusDays(1))
            && Duration.between(startsAt, endsAt).compareTo(MAX_SINGLE_CLOSURE_WINDOW) <= 0) {
            DateTimeFormatter endDayTimeFormatter = endZdt.getYear() == currentTorontoYear
                ? WINDOW_DAY_TIME_FORMATTER
                : WINDOW_DAY_TIME_WITH_YEAR_FORMATTER;
            return startFormatter.format(startZdt) + " – " + endDayTimeFormatter.format(endZdt);
        }

        DateTimeFormatter endFormatter = endZdt.getYear() == currentTorontoYear
            ? WINDOW_DATE_TIME_FORMATTER
            : WINDOW_DATE_TIME_WITH_YEAR_FORMATTER;
        return startFormatter.format(startZdt) + " – " + endFormatter.format(endZdt);
    }

    /**
     * Canonical comparator for planned closures matching dashboard display ordering.
     */
    public static Comparator<PlannedClosureDto> plannedClosureComparator(List<LineSegmentEntity> segments) {
        Map<String, Integer> segmentOrders = segmentOrders(segments);
        return Comparator
            .comparingInt((PlannedClosureDto dto) -> lineSortOrder(dto.lineId(), dto.lineNumber()))
            .thenComparingInt(dto -> firstSegmentOrder(dto.previewSegmentIds(), segmentOrders))
            .thenComparing(PlannedClosureDto::startedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(PlannedClosureDto::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    /**
     * Canonical comparator for closure projections matching dashboard display ordering.
     */
    public static Comparator<ClosureProjection> closureComparator(List<LineSegmentEntity> segments) {
        Comparator<PlannedClosureDto> comp = plannedClosureComparator(segments);
        return (c1, c2) -> comp.compare(c1.canonicalClosure(), c2.canonicalClosure());
    }

    public static Map<String, Integer> segmentOrders(List<LineSegmentEntity> segments) {
        if (segments == null) {
            return Map.of();
        }
        Map<String, Integer> orders = new LinkedHashMap<>();
        for (LineSegmentEntity segment : segments) {
            orders.put(segment.getId(), segment.getSortOrder());
        }
        return orders;
    }

    public static int firstSegmentOrder(List<String> segmentIds, Map<String, Integer> segmentOrders) {
        if (segmentIds == null || segmentIds.isEmpty() || segmentOrders == null) {
            return Integer.MAX_VALUE;
        }
        return segmentIds.stream()
            .map(segmentOrders::get)
            .filter(Objects::nonNull)
            .min(Integer::compareTo)
            .orElse(Integer.MAX_VALUE);
    }

    public static int lineSortOrder(String lineId, String lineNumber) {
        if (!AlertDashboardService.isBlank(lineNumber)) {
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

    /**
     * Complete canonical closure projection containing temporal state and active-child identity.
     */
    public record ClosureProjection(
        PlannedClosureDto canonicalClosure,
        AlertEntity currentSourceAlert,
        PlannedClosureDto activePresentation,
        ActiveAlertDto activeClosureAlert
    ) {
        public boolean activeNow() {
            return canonicalClosure != null && canonicalClosure.activeNow();
        }

        public String id() {
            return canonicalClosure != null ? canonicalClosure.id() : null;
        }

        public String title() {
            return canonicalClosure != null ? canonicalClosure.title() : null;
        }

        /**
         * Computes segment impacts for this closure when active, using current active-child identity when present.
         */
        public List<Map.Entry<String, SegmentImpact>> activeSegmentImpacts() {
            if (!activeNow()) {
                return List.of();
            }
            PlannedClosureDto presentation = activePresentation != null ? activePresentation : canonicalClosure;
            String cardId = currentSourceAlert == null ? canonicalClosure.id() : currentSourceAlert.getId();
            SegmentImpact impact = new SegmentImpact(
                "suspension".equals(presentation.serviceEffect()) ? SUSPENSION_KIND : "delay",
                cardId,
                presentation.travelDirection(),
                List.of(cardId)
            );
            List<Map.Entry<String, SegmentImpact>> impacts = new ArrayList<>();
            for (String segmentId : presentation.previewSegmentIds()) {
                impacts.add(Map.entry(segmentId, impact));
            }
            return impacts;
        }
    }
}
