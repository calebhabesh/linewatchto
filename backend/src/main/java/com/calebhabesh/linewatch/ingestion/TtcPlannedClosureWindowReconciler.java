package com.calebhabesh.linewatch.ingestion;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class TtcPlannedClosureWindowReconciler {
    private static final Duration MAX_SCHEDULED_WINDOW = Duration.ofHours(18);
    private static final Duration MIN_SCHEDULED_WINDOW = Duration.ofHours(1);
    private static final Duration MIN_DAILY_CADENCE = Duration.ofHours(20);
    private static final Duration MAX_DAILY_CADENCE = Duration.ofHours(28);

    private TtcPlannedClosureWindowReconciler() {}

    static List<NormalizedRouteAlert> reconcile(
        List<NormalizedRouteAlert> alerts,
        OffsetDateTime now
    ) {
        List<NormalizedRouteAlert> scheduleCompleteAlerts = alerts.stream()
            .map(alert -> restoreMissingDailyOccurrence(alert, now))
            .toList();
        // A standalone child is mutable operational copy. When it becomes a short
        // restoration notice, its parent child-period end changes to the restoration
        // timestamp. Repair only that linked occurrence from the remaining schedule.
        Set<String> restorationSourceIds = scheduleCompleteAlerts.stream()
            .filter(TtcServiceState::isRestoration)
            .map(NormalizedRouteAlert::sourceId)
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
        if (restorationSourceIds.isEmpty()) {
            return scheduleCompleteAlerts;
        }
        return scheduleCompleteAlerts.stream()
            .map(alert -> repairRestorationPeriods(alert, restorationSourceIds))
            .toList();
    }

    private static NormalizedRouteAlert restoreMissingDailyOccurrence(
        NormalizedRouteAlert alert,
        OffsetDateTime now
    ) {
        if (alert.impactKind() != AlertImpactKind.PLANNED_CLOSURE
            || !isRecurringClosure(alert)) {
            return alert;
        }

        List<NormalizedAlertPeriod> futureScheduledPeriods = alert.periods().stream()
            .filter(period -> period.startsAt() != null && period.startsAt().isAfter(now))
            .filter(period -> isScheduledDuration(duration(period)))
            .sorted(Comparator.comparing(NormalizedAlertPeriod::startsAt))
            .toList();
        if (futureScheduledPeriods.size() < 2) {
            return alert;
        }

        NormalizedAlertPeriod next = futureScheduledPeriods.get(0);
        NormalizedAlertPeriod following = futureScheduledPeriods.get(1);
        Duration cadence = Duration.between(next.startsAt(), following.startsAt());
        if (cadence.compareTo(MIN_DAILY_CADENCE) < 0
            || cadence.compareTo(MAX_DAILY_CADENCE) > 0) {
            return alert;
        }

        OffsetDateTime derivedStart = next.startsAt().minus(cadence);
        OffsetDateTime derivedEnd = next.endsAt().minus(cadence);
        if (derivedStart.isAfter(now)
            || !derivedEnd.isAfter(now)
            || (alert.activePeriodStart() != null
                && derivedStart.isBefore(alert.activePeriodStart()))
            || (alert.activePeriodEnd() != null
                && !derivedStart.isBefore(alert.activePeriodEnd()))) {
            return alert;
        }

        List<NormalizedAlertPeriod> periods = new ArrayList<>(alert.periods());
        for (int index = 0; index < periods.size(); index++) {
            NormalizedAlertPeriod existing = periods.get(index);
            if (derivedStart.equals(existing.startsAt())) {
                if (existing.endsAt() == null || existing.endsAt().isBefore(derivedEnd)) {
                    periods.set(index, new NormalizedAlertPeriod(
                        existing.sourcePeriodId(),
                        existing.startsAt(),
                        derivedEnd,
                        existing.sortOrder(),
                        existing.sourceCurrentContinuous()
                    ));
                    return alert.withPeriods(sortedPeriods(periods));
                }
                return alert;
            }
        }

        periods.add(new NormalizedAlertPeriod(
            "derived-before-" + next.sourcePeriodId(),
            derivedStart,
            derivedEnd,
            next.sortOrder() - 1
        ));
        return alert.withPeriods(sortedPeriods(periods));
    }

    private static List<NormalizedAlertPeriod> sortedPeriods(
        List<NormalizedAlertPeriod> periods
    ) {
        return periods.stream()
            .sorted(Comparator.comparing(NormalizedAlertPeriod::startsAt)
                .thenComparing(NormalizedAlertPeriod::sourcePeriodId))
            .toList();
    }

    private static boolean isScheduledDuration(Duration duration) {
        return duration != null
            && duration.compareTo(MIN_SCHEDULED_WINDOW) >= 0
            && duration.compareTo(MAX_SCHEDULED_WINDOW) <= 0;
    }

    private static boolean isRecurringClosure(NormalizedRouteAlert alert) {
        String text = String.join(" ",
            nullToEmpty(alert.title()),
            nullToEmpty(alert.description()),
            nullToEmpty(alert.effectDescription())
        ).toLowerCase(Locale.ROOT);
        return text.contains("nightly")
            || text.contains("closure windows")
            || text.contains("early access");
    }

    private static NormalizedRouteAlert repairRestorationPeriods(
        NormalizedRouteAlert alert,
        Set<String> restorationSourceIds
    ) {
        if (alert.impactKind() != AlertImpactKind.PLANNED_CLOSURE
            || alert.periods().stream()
                .noneMatch(period -> restorationSourceIds.contains(period.sourcePeriodId()))) {
            return alert;
        }

        List<Duration> scheduledDurations = alert.periods().stream()
            .filter(period -> !restorationSourceIds.contains(period.sourcePeriodId()))
            .map(TtcPlannedClosureWindowReconciler::duration)
            .filter(java.util.Objects::nonNull)
            .filter(candidate -> candidate.compareTo(MIN_SCHEDULED_WINDOW) >= 0)
            .filter(candidate -> candidate.compareTo(MAX_SCHEDULED_WINDOW) <= 0)
            .sorted()
            .toList();
        if (scheduledDurations.isEmpty()) {
            return alert;
        }

        Duration representativeDuration = scheduledDurations.get(scheduledDurations.size() / 2);
        List<NormalizedAlertPeriod> periods = alert.periods().stream()
            .map(period -> repairRestorationPeriod(
                period,
                restorationSourceIds,
                representativeDuration
            ))
            .toList();
        return alert.withPeriods(periods);
    }

    private static NormalizedAlertPeriod repairRestorationPeriod(
        NormalizedAlertPeriod period,
        Set<String> restorationSourceIds,
        Duration representativeDuration
    ) {
        if (!restorationSourceIds.contains(period.sourcePeriodId())
            || period.startsAt() == null) {
            return period;
        }
        Duration currentDuration = duration(period);
        if (currentDuration != null
            && currentDuration.compareTo(MIN_SCHEDULED_WINDOW) >= 0) {
            return period;
        }
        return new NormalizedAlertPeriod(
            period.sourcePeriodId(),
            period.startsAt(),
            period.startsAt().plus(representativeDuration),
            period.sortOrder(),
            period.sourceCurrentContinuous()
        );
    }

    private static Duration duration(NormalizedAlertPeriod period) {
        if (period.startsAt() == null || period.endsAt() == null
            || !period.endsAt().isAfter(period.startsAt())) {
            return null;
        }
        return Duration.between(period.startsAt(), period.endsAt());
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
