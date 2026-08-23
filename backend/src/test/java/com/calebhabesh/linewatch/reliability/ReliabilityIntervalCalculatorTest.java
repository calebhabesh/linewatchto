package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReliabilityIntervalCalculatorTest {
    private static OffsetDateTime at(String value) {
        return OffsetDateTime.parse("2026-08-01T" + value + ":00-04:00");
    }

    @Test
    void unionsOverlappingIncidentsBeforeCalculatingLineImpactTime() {
        List<ReliabilityIntervalCalculator.TimeRange> merged = ReliabilityIntervalCalculator.merge(List.of(
            new ReliabilityIntervalCalculator.TimeRange(at("08:00"), at("09:00")),
            new ReliabilityIntervalCalculator.TimeRange(at("08:30"), at("10:00"))
        ), Duration.ZERO);

        assertThat(ReliabilityIntervalCalculator.minutes(merged)).isEqualTo(120);
    }

    @Test
    void stitchesBriefFeedChurnButKeepsGenuineReopeningsSeparate() {
        List<ReliabilityIntervalCalculator.TimeRange> merged = ReliabilityIntervalCalculator.merge(List.of(
            new ReliabilityIntervalCalculator.TimeRange(at("08:00"), at("09:00")),
            new ReliabilityIntervalCalculator.TimeRange(at("09:01"), at("10:00")),
            new ReliabilityIntervalCalculator.TimeRange(at("11:00"), at("12:00"))
        ), Duration.ofMinutes(5));

        assertThat(merged).hasSize(2);
        assertThat(ReliabilityIntervalCalculator.minutes(merged)).isEqualTo(180);
    }

    @Test
    void countsOnlyTheIntersectionOfApplicableObservedAndScheduledTime() {
        List<ReliabilityIntervalCalculator.TimeRange> result = ReliabilityIntervalCalculator.intersectAll(
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("01:00"), at("08:00"))),
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("00:00"), at("09:00"))),
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("06:00"), at("09:00")))
        );

        assertThat(ReliabilityIntervalCalculator.minutes(result)).isEqualTo(120);
    }

    @Test
    void excludesAPlannedClosureNoticeOutsideItsApplicableServiceWindow() {
        List<ReliabilityIntervalCalculator.TimeRange> result = ReliabilityIntervalCalculator.intersectAll(
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("01:00"), at("05:00"))),
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("00:00"), at("09:00"))),
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("06:00"), at("09:00")))
        );

        assertThat(result).isEmpty();
    }

    @Test
    void doesNotBridgeUnobservedPollingGaps() {
        List<ReliabilityIntervalCalculator.TimeRange> result = ReliabilityIntervalCalculator.intersectAll(
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("08:00"), at("12:00"))),
            List.of(
                new ReliabilityIntervalCalculator.TimeRange(at("08:00"), at("09:00")),
                new ReliabilityIntervalCalculator.TimeRange(at("11:00"), at("12:00"))
            ),
            List.of(new ReliabilityIntervalCalculator.TimeRange(at("07:00"), at("13:00")))
        );

        assertThat(result).hasSize(2);
        assertThat(ReliabilityIntervalCalculator.minutes(result)).isEqualTo(120);
    }
}
