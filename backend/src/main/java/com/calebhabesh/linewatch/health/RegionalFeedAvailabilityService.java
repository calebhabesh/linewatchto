package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.MetrolinxSourceSystem;
import com.calebhabesh.linewatch.regional.RegionalIngestionRunStore;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RegionalFeedAvailabilityService {
    static final int PERIOD_DAYS = 30;
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final double SUFFICIENT_DAILY_COVERAGE = 0.95;
    private static final double DEGRADED_AVAILABILITY_FLOOR = 0.95;
    private static final int MINIMUM_CONFIRMED_FAILURES_FOR_DOWN = 3;
    private static final long REQUIRED_CHECKS_PER_POLL = MetrolinxSourceSystem.descriptors().stream()
        .filter(MetrolinxSourceSystem.Descriptor::required)
        .count();

    private final RegionalIngestionRunStore store;
    private final MetrolinxProperties properties;
    private final Clock clock;

    public RegionalFeedAvailabilityService(
        RegionalIngestionRunStore store,
        MetrolinxProperties properties,
        Clock clock
    ) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    public RegionalFeedAvailability summarize() {
        ZonedDateTime now = clock.instant().atZone(TORONTO);
        LocalDate firstDate = now.toLocalDate().minusDays(PERIOD_DAYS - 1L);
        ZonedDateTime periodStart = firstDate.atStartOfDay(TORONTO);
        OffsetDateTime queryStart = periodStart.toOffsetDateTime();
        OffsetDateTime queryEnd = now.toOffsetDateTime();

        Map<LocalDate, RegionalIngestionRunStore.SourceFetchDailyCount> countsByDate = new HashMap<>();
        for (RegionalIngestionRunStore.SourceFetchDailyCount count
            : store.requiredSourceFetchDailyCounts(queryStart, queryEnd)) {
            countsByDate.put(count.date(), count);
        }

        ZonedDateTime trackingStart = store.findFirstRequiredSourceFetchAt()
            .map(value -> value.atZoneSameInstant(TORONTO))
            .map(value -> value.isBefore(periodStart) ? periodStart : value)
            .orElse(null);
        long intervalMillis = Math.max(1, properties.getFixedDelay().toMillis());
        List<RegionalFeedAvailabilityDay> buckets = new ArrayList<>(PERIOD_DAYS);
        int successfulChecks = 0;
        int failedChecks = 0;
        int totalChecks = 0;
        long expectedChecks = 0;

        for (int index = 0; index < PERIOD_DAYS; index++) {
            LocalDate date = firstDate.plusDays(index);
            RegionalIngestionRunStore.SourceFetchDailyCount count = countsByDate.getOrDefault(
                date,
                new RegionalIngestionRunStore.SourceFetchDailyCount(date, 0, 0, 0)
            );
            long expectedForDay = expectedChecksForDay(date, trackingStart, now, intervalMillis)
                * REQUIRED_CHECKS_PER_POLL;
            expectedChecks += expectedForDay;
            successfulChecks += count.successfulChecks();
            failedChecks += count.failedChecks();
            totalChecks += count.totalChecks();
            buckets.add(new RegionalFeedAvailabilityDay(
                date,
                dailyStatus(count, expectedForDay),
                count.successfulChecks(),
                count.failedChecks(),
                count.totalChecks()
            ));
        }

        Double availabilityPercentage = totalChecks == 0
            ? null
            : roundedPercentage(successfulChecks, totalChecks);
        double monitoringCoveragePercentage = expectedChecks == 0
            ? 0.0
            : roundedPercentage(Math.min(totalChecks, expectedChecks), expectedChecks);

        return new RegionalFeedAvailability(
            PERIOD_DAYS,
            availabilityPercentage,
            monitoringCoveragePercentage,
            successfulChecks,
            failedChecks,
            totalChecks,
            trackingStart == null ? null : trackingStart.toLocalDate(),
            List.copyOf(buckets)
        );
    }

    private long expectedChecksForDay(
        LocalDate date,
        ZonedDateTime trackingStart,
        ZonedDateTime now,
        long intervalMillis
    ) {
        if (trackingStart == null) return 0;
        ZonedDateTime dayStart = date.atStartOfDay(TORONTO);
        ZonedDateTime dayEnd = date.plusDays(1).atStartOfDay(TORONTO);
        ZonedDateTime coveredStart = trackingStart.isAfter(dayStart) ? trackingStart : dayStart;
        ZonedDateTime coveredEnd = now.isBefore(dayEnd) ? now : dayEnd;
        if (!coveredEnd.isAfter(coveredStart)) return 0;
        long durationMillis = Duration.between(coveredStart.toInstant(), coveredEnd.toInstant()).toMillis();
        return Math.max(1, (durationMillis + intervalMillis - 1) / intervalMillis);
    }

    private String dailyStatus(RegionalIngestionRunStore.SourceFetchDailyCount count, long expectedChecks) {
        if (expectedChecks == 0 || count.totalChecks() < Math.ceil(expectedChecks * SUFFICIENT_DAILY_COVERAGE)) {
            return "unknown";
        }
        if (count.failedChecks() == 0) return "up";
        double availability = (double) count.successfulChecks() / count.totalChecks();
        return count.failedChecks() < MINIMUM_CONFIRMED_FAILURES_FOR_DOWN
            || availability >= DEGRADED_AVAILABILITY_FLOOR
            ? "degraded"
            : "down";
    }

    private double roundedPercentage(long numerator, long denominator) {
        return Math.round(numerator * 10_000.0 / denominator) / 100.0;
    }

    public record RegionalFeedAvailability(
        int periodDays,
        Double availabilityPercentage,
        double monitoringCoveragePercentage,
        int successfulChecks,
        int failedChecks,
        int totalChecks,
        LocalDate monitoringStartedOn,
        List<RegionalFeedAvailabilityDay> buckets
    ) {}

    public record RegionalFeedAvailabilityDay(
        LocalDate date,
        String status,
        int successfulChecks,
        int failedChecks,
        int totalChecks
    ) {}
}
