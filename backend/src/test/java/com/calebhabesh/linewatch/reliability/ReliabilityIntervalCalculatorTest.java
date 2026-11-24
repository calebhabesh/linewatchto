package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.calebhabesh.linewatch.alert.AlertCategoryLabels;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.WeightedInterval;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
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

    @Test
    void unionsOverlappingStationSetsWhenIntegratingWeightedMinutes() {
        // 10 scheduled stations:
        // Ep A: {s1, s2, s3} 08:00..09:00 (30m alone -> 9.0, 30m overlap)
        // Ep B: {s2, s3, s4} 08:30..09:30 (30m overlap with union {s1,s2,s3,s4} -> 12.0, 30m alone -> 9.0)
        // Total weighted = 30.0 minutes (not 36.0 from double-counting s2, s3).
        double weighted = ReliabilityIntervalCalculator.weightedMinutes(List.of(
            new WeightedInterval(List.of(new TimeRange(at("08:00"), at("09:00"))), Set.of("s1", "s2", "s3"), false),
            new WeightedInterval(List.of(new TimeRange(at("08:30"), at("09:30"))), Set.of("s2", "s3", "s4"), false)
        ), 10);

        assertThat(weighted).isCloseTo(30.0, within(0.001));
    }

    @Test
    void wholeLineAlertCoversFullDenominatorEvenWhenOverlappingPartialAlert() {
        // 10 scheduled stations:
        // Partial alert: {s1, s2} 08:00..10:00 (60m alone -> 12.0, 60m overlapped by whole-line -> 60.0)
        // Whole-line alert: 09:00..10:00
        double weighted = ReliabilityIntervalCalculator.weightedMinutes(List.of(
            new WeightedInterval(List.of(new TimeRange(at("08:00"), at("10:00"))), Set.of("s1", "s2"), false),
            new WeightedInterval(List.of(new TimeRange(at("09:00"), at("10:00"))), Set.of(), true)
        ), 10);

        assertThat(weighted).isCloseTo(72.0, within(0.001));
    }

    @Test
    void classifiesImpactKindsIntoDisruptionClassesAndPlannedFlag() {
        assertThat(AlertCategoryLabels.disruptionClass("suspension")).isEqualTo("service-stopped");
        assertThat(AlertCategoryLabels.disruptionClass("closure")).isEqualTo("service-stopped");
        assertThat(AlertCategoryLabels.disruptionClass("planned-closure")).isEqualTo("service-stopped");
        assertThat(AlertCategoryLabels.disruptionClass("delay")).isEqualTo("delay");
        assertThat(AlertCategoryLabels.disruptionClass("limited-service")).isEqualTo("delay");
        assertThat(AlertCategoryLabels.disruptionClass("reduced-speed-zone")).isEqualTo("slow-zone");
        assertThat(AlertCategoryLabels.disruptionClass("rsz")).isEqualTo("slow-zone");

        assertThat(AlertCategoryLabels.disruptionClassLabel("service-stopped")).isEqualTo("Service Stopped");
        assertThat(AlertCategoryLabels.disruptionClassLabel("delay")).isEqualTo("Delays");
        assertThat(AlertCategoryLabels.disruptionClassLabel("slow-zone")).isEqualTo("Slow Zones");

        assertThat(AlertCategoryLabels.isPlannedImpactKind("planned-closure")).isTrue();
        assertThat(AlertCategoryLabels.isPlannedImpactKind("suspension")).isFalse();
        assertThat(AlertCategoryLabels.isPlannedImpactKind("delay")).isFalse();
        assertThat(AlertCategoryLabels.isPlannedImpactKind("reduced-speed-zone")).isFalse();
    }
}
