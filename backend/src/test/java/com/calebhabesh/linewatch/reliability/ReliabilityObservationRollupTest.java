package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityObservationRollup.ObservationDay;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The pure parts of plan 17 A3: per-date clipping, merging and Toronto calendar days. */
class ReliabilityObservationRollupTest {
    private static OffsetDateTime at(String value) {
        return OffsetDateTime.parse(value);
    }

    @Test
    void aPollJustBeforeMidnightCoversBothDatesAndTheirPartsMergeBack() {
        List<OffsetDateTime> polls = List.of(at("2026-11-20T23:55:00-05:00"), at("2026-11-21T00:03:00-05:00"));
        OffsetDateTime since = at("2026-11-20T12:00:00-05:00");
        OffsetDateTime until = at("2026-11-21T12:00:00-05:00");

        List<TimeRange> whole = ReliabilityObservationRollup.windowsFromCompletions(polls, since, until);
        List<ObservationDay> days = ReliabilityObservationRollup.observationDays(since, until);
        List<List<TimeRange>> perDay = days.stream()
            .map(day -> ReliabilityObservationRollup.windowsFromCompletions(polls, day.range().start(), day.range().end()))
            .toList();

        assertThat(whole).containsExactly(new TimeRange(at("2026-11-20T23:55:00-05:00"), at("2026-11-21T00:13:00-05:00")));
        assertThat(perDay.get(0)).containsExactly(
            new TimeRange(at("2026-11-20T23:55:00-05:00"), at("2026-11-21T00:00:00-05:00")));
        // The 23:55 poll's window reaches into the next date, which reads it from 10 minutes back.
        assertThat(perDay.get(1)).containsExactly(
            new TimeRange(at("2026-11-21T00:00:00-05:00"), at("2026-11-21T00:13:00-05:00")));
        List<TimeRange> stitched = new ArrayList<>();
        perDay.forEach(stitched::addAll);
        assertThat(ReliabilityIntervalCalculator.merge(stitched, Duration.ZERO)).isEqualTo(whole);
        assertThat(ReliabilityIntervalCalculator.minutes(stitched)).isEqualTo(18);
    }

    @Test
    void aGapLongerThanTenMinutesStaysUncoveredAndTouchingWindowsMerge() {
        OffsetDateTime start = at("2026-11-20T09:00:00-05:00");
        OffsetDateTime end = at("2026-11-20T12:00:00-05:00");

        assertThat(ReliabilityObservationRollup.windowsFromCompletions(List.of(
            at("2026-11-20T10:00:00-05:00"), at("2026-11-20T10:11:00-05:00")), start, end)).containsExactly(
            new TimeRange(at("2026-11-20T10:00:00-05:00"), at("2026-11-20T10:10:00-05:00")),
            new TimeRange(at("2026-11-20T10:11:00-05:00"), at("2026-11-20T10:21:00-05:00")));
        assertThat(ReliabilityObservationRollup.windowsFromCompletions(List.of(
            at("2026-11-20T10:00:00-05:00"), at("2026-11-20T10:10:00-05:00")), start, end)).containsExactly(
            new TimeRange(at("2026-11-20T10:00:00-05:00"), at("2026-11-20T10:20:00-05:00")));
    }

    @Test
    void torontoDatesAre23And25HoursLongOnDstChanges() {
        List<ObservationDay> fallBack = ReliabilityObservationRollup.observationDays(
            at("2026-10-31T00:00:00-04:00"), at("2026-11-03T00:00:00-05:00"));
        assertThat(fallBack).extracting(ObservationDay::date).containsExactly(
            LocalDate.parse("2026-10-31"), LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-02"));
        assertThat(fallBack).extracting(day -> Duration.between(day.range().start(), day.range().end()).toHours())
            .containsExactly(24L, 25L, 24L);

        List<ObservationDay> springForward = ReliabilityObservationRollup.observationDays(
            at("2026-03-08T00:00:00-05:00"), at("2026-03-09T00:00:00-04:00"));
        assertThat(springForward).hasSize(1);
        assertThat(Duration.between(springForward.getFirst().range().start(), springForward.getFirst().range().end()))
            .isEqualTo(Duration.ofHours(23));
    }

    @Test
    void aWindowIsSplitAtTorontoMidnightsAndEndsAtItsUntil() {
        List<ObservationDay> days = ReliabilityObservationRollup.observationDays(
            at("2026-11-20T17:00:00Z"), at("2026-11-22T05:00:00Z"));

        assertThat(days).containsExactly(
            new ObservationDay(LocalDate.parse("2026-11-20"),
                new TimeRange(at("2026-11-20T17:00:00Z"), ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-21")))),
            new ObservationDay(LocalDate.parse("2026-11-21"),
                new TimeRange(ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-21")), at("2026-11-22T05:00:00Z"))));
        assertThat(ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-21")).toInstant())
            .isEqualTo(at("2026-11-21T05:00:00Z").toInstant());
    }
}
