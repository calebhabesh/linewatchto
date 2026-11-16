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

    @Test
    void closureWindowOverlapsTripTimesOnlyWhenTheyShareAMoment() {
        int weekdays = 62;
        // Mon Nov 16, 11:00 PM to Tue 5:30 AM: over before a 6:30 to 9:30 trip starts.
        assertThat(SavedCommuteNotificationSchedule.overlaps(weekdays, 390, 570,
            Instant.parse("2026-11-17T04:00:00Z"), Instant.parse("2026-11-17T10:30:00Z"))).isFalse();
        // The same closure running to 7:00 AM meets Tuesday's trip.
        assertThat(SavedCommuteNotificationSchedule.overlaps(weekdays, 390, 570,
            Instant.parse("2026-11-17T04:00:00Z"), Instant.parse("2026-11-17T12:00:00Z"))).isTrue();
        // A 9:30 AM end is exclusive: a closure starting then misses the trip.
        assertThat(SavedCommuteNotificationSchedule.overlaps(weekdays, 390, 570,
            Instant.parse("2026-11-17T14:30:00Z"), Instant.parse("2026-11-17T16:00:00Z"))).isFalse();
    }

    @Test
    void weekendClosureMissesWeekdayTripsButMeetsAFridayNightTripRunningPastMidnight() {
        Instant saturdayStart = Instant.parse("2026-11-21T05:00:00Z");
        Instant mondayEarly = Instant.parse("2026-11-23T10:00:00Z");
        assertThat(SavedCommuteNotificationSchedule.overlaps(62, 390, 570, saturdayStart, mondayEarly)).isFalse();
        assertThat(SavedCommuteNotificationSchedule.overlaps(62, 900, 1140, saturdayStart, mondayEarly)).isFalse();
        int fridayOnly = 32;
        assertThat(SavedCommuteNotificationSchedule.overlaps(fridayOnly, 22 * 60, 2 * 60, saturdayStart, mondayEarly)).isTrue();
    }

    @Test
    void unsetTripTimesCoverTheWholeSelectedDay() {
        Instant start = Instant.parse("2026-11-21T15:00:00Z");
        Instant end = Instant.parse("2026-11-21T16:00:00Z");
        assertThat(SavedCommuteNotificationSchedule.overlaps(64, null, null, start, end)).isTrue();
        assertThat(SavedCommuteNotificationSchedule.overlaps(62, null, null, start, end)).isFalse();
    }

    @Test
    void tripTimesStayOnTheWallClockOnAClockChangeDay() {
        // Sun Nov 1 2026 falls back at 2 AM: a 7:00 to 8:00 AM trip is 12:00 to 13:00 UTC.
        assertThat(SavedCommuteNotificationSchedule.overlaps(1, 7 * 60, 8 * 60,
            Instant.parse("2026-11-01T12:15:00Z"), Instant.parse("2026-11-01T12:45:00Z"))).isTrue();
        assertThat(SavedCommuteNotificationSchedule.overlaps(1, 7 * 60, 8 * 60,
            Instant.parse("2026-11-01T11:00:00Z"), Instant.parse("2026-11-01T11:59:00Z"))).isFalse();
    }

    @Test
    void windowLongerThanTheScanMeetsAnySelectedDay() {
        assertThat(SavedCommuteNotificationSchedule.overlaps(2, 390, 570,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2028-01-01T00:00:00Z"))).isTrue();
        assertThat(SavedCommuteNotificationSchedule.overlaps(0, 390, 570,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2028-01-01T00:00:00Z"))).isFalse();
    }
}
