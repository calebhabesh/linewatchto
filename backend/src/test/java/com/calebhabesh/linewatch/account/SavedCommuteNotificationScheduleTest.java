package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class SavedCommuteNotificationScheduleTest {
    @Test
    void usesStartInclusiveAndEndExclusiveTorontoLocalTime() {
        int weekdays = 62;

        assertThat(SavedCommuteNotificationSchedule.matches(
            weekdays, 7 * 60, 9 * 60, Instant.parse("2026-06-05T11:00:00Z")
        )).isTrue();
        assertThat(SavedCommuteNotificationSchedule.matches(
            weekdays, 7 * 60, 9 * 60, Instant.parse("2026-06-05T12:59:59Z")
        )).isTrue();
        assertThat(SavedCommuteNotificationSchedule.matches(
            weekdays, 7 * 60, 9 * 60, Instant.parse("2026-06-05T13:00:00Z")
        )).isFalse();
    }

    @Test
    void overnightWindowUsesTheDayOnWhichTheWindowStarts() {
        int mondayOnly = 2;

        assertThat(SavedCommuteNotificationSchedule.matches(
            mondayOnly, 22 * 60, 2 * 60, Instant.parse("2026-06-09T03:30:00Z")
        )).isTrue();
        assertThat(SavedCommuteNotificationSchedule.matches(
            mondayOnly, 22 * 60, 2 * 60, Instant.parse("2026-06-09T06:00:00Z")
        )).isFalse();
    }

    @Test
    void resolvesBothRepeatedFallBackHoursInToronto() {
        int sundayOnly = 1;

        assertThat(SavedCommuteNotificationSchedule.matches(
            sundayOnly, 60, 2 * 60, Instant.parse("2026-11-01T05:30:00Z")
        )).isTrue();
        assertThat(SavedCommuteNotificationSchedule.matches(
            sundayOnly, 60, 2 * 60, Instant.parse("2026-11-01T06:30:00Z")
        )).isTrue();
    }
}
