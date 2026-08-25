package com.calebhabesh.linewatch.ingestion;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

@Component
public class TtcLateOpeningWindowResolver {
    private static final Logger log = LoggerFactory.getLogger(TtcLateOpeningWindowResolver.class);
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final LocalTime EARLIEST_PLAUSIBLE_OPENING = LocalTime.of(4, 0);
    private static final Duration MAX_PUBLISHED_HOURS_VARIANCE = Duration.ofHours(3);
    private static final Duration MIN_MEANINGFUL_LATE_OPENING = Duration.ofMinutes(15);

    private final TtcScheduledServiceOpeningRepository repository;

    public TtcLateOpeningWindowResolver(TtcScheduledServiceOpeningRepository repository) {
        this.repository = repository;
    }

    static TtcLateOpeningWindowResolver fallbackOnly() {
        return new TtcLateOpeningWindowResolver(null);
    }

    public Resolution resolve(
        TtcAlertRecord record,
        String lineId,
        List<String> stationIds,
        List<NormalizedAlertPeriod> periods,
        OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd
    ) {
        List<NormalizedAlertPeriod> sourcePeriods = periods == null ? List.of() : List.copyOf(periods);
        if (!isWebsiteLateOpening(record) || sourcePeriods.isEmpty()) {
            return new Resolution(sourcePeriods, activePeriodStart, activePeriodEnd, false);
        }

        List<NormalizedAlertPeriod> resolvedPeriods = new java.util.ArrayList<>();
        boolean scheduleRefined = false;
        for (NormalizedAlertPeriod period : sourcePeriods) {
            if (period.startsAt() == null || period.endsAt() == null
                || !period.startsAt().isBefore(period.endsAt())) {
                resolvedPeriods.add(period);
                continue;
            }
            LocalDate serviceDate = period.startsAt().atZoneSameInstant(TORONTO).toLocalDate();
            OffsetDateTime fallbackStart = period.startsAt();
            OffsetDateTime scheduledStart = scheduledStart(lineId, stationIds, serviceDate)
                .filter(candidate -> validScheduledStart(candidate, fallbackStart, period.endsAt()))
                .orElse(fallbackStart);
            if (!scheduledStart.isBefore(period.endsAt())) {
                scheduledStart = fallbackStart;
            }
            scheduleRefined |= !scheduledStart.equals(fallbackStart);
            resolvedPeriods.add(new NormalizedAlertPeriod(
                period.sourcePeriodId(),
                scheduledStart,
                period.endsAt(),
                period.sortOrder(),
                period.sourceCurrentContinuous()
            ));
        }

        OffsetDateTime resolvedStart = resolvedPeriods.stream()
            .map(NormalizedAlertPeriod::startsAt)
            .filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo)
            .orElse(activePeriodStart);
        OffsetDateTime resolvedEnd = resolvedPeriods.stream()
            .map(NormalizedAlertPeriod::endsAt)
            .filter(java.util.Objects::nonNull)
            .max(OffsetDateTime::compareTo)
            .orElse(activePeriodEnd);
        return new Resolution(
            List.copyOf(resolvedPeriods),
            resolvedStart,
            resolvedEnd,
            scheduleRefined
        );
    }

    private Optional<OffsetDateTime> scheduledStart(
        String lineId,
        List<String> stationIds,
        LocalDate serviceDate
    ) {
        if (repository == null || lineId == null || lineId.isBlank()) {
            return Optional.empty();
        }
        try {
            Optional<Integer> firstDeparture = repository.firstDepartureSeconds(
                lineId, serviceDate, stationIds
            );
            if (firstDeparture.isEmpty() && stationIds != null && !stationIds.isEmpty()) {
                firstDeparture = repository.firstDepartureSeconds(lineId, serviceDate, List.of());
            }
            return firstDeparture.map(seconds -> serviceDate.atStartOfDay(TORONTO)
                .plusSeconds(seconds)
                .toOffsetDateTime());
        } catch (DataAccessException exception) {
            log.warn(
                "Unable to resolve TTC late-opening start from the active GTFS schedule; using the published-hours fallback",
                exception
            );
            return Optional.empty();
        }
    }

    private boolean validScheduledStart(
        OffsetDateTime candidate,
        OffsetDateTime fallbackStart,
        OffsetDateTime lateOpening
    ) {
        LocalTime candidateTime = candidate.atZoneSameInstant(TORONTO).toLocalTime();
        return !candidateTime.isBefore(EARLIEST_PLAUSIBLE_OPENING)
            && candidate.isBefore(lateOpening)
            && !candidate.isAfter(fallbackStart.plus(MAX_PUBLISHED_HOURS_VARIANCE))
            && Duration.between(candidate, lateOpening).compareTo(MIN_MEANINGFUL_LATE_OPENING) >= 0;
    }

    private boolean isWebsiteLateOpening(TtcAlertRecord record) {
        if (record == null || !TtcSubwayClosureParser.SOURCE_ALERT_TYPE.equalsIgnoreCase(record.alertType())) {
            return false;
        }
        String text = String.join(" ",
            value(record.title()),
            value(record.headerText()),
            value(record.description())
        ).toLowerCase(Locale.ROOT);
        return text.contains("late opening")
            || text.matches(
                "(?s).*\\b(?:service|trains?)\\s+(?:(?:will\\s+)?start|starts?)"
                    + "\\s+(?:at|by)\\b.*"
            );
    }

    private String value(String value) {
        return value == null ? "" : value;
    }

    public record Resolution(
        List<NormalizedAlertPeriod> periods,
        OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd,
        boolean scheduleRefined
    ) {}
}
