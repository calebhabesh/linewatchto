package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class SubwayOperatingHoursCalculatorTest {

    @Test
    void ignoresOvernightClosedHours() {
        // Tuesday 2:00 AM - 6:00 AM EDT (06:00 UTC - 10:00 UTC)
        OffsetDateTime start = OffsetDateTime.parse("2026-07-14T06:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-07-14T10:00:00Z");

        long minutes = SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(start, end);
        assertThat(minutes).isEqualTo(0);
    }

    @Test
    void clipsOvernightPortionFromLateNightClosure() {
        // Tuesday 1:00 AM - 6:00 AM EDT (05:00 UTC - 10:00 UTC) -> only 1:00 AM - 2:00 AM is open (60 min)
        OffsetDateTime start = OffsetDateTime.parse("2026-07-14T05:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-07-14T10:00:00Z");

        long minutes = SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(start, end);
        assertThat(minutes).isEqualTo(60);
    }

    @Test
    void countsRegularDaytimeDelayNormally() {
        // Tuesday 2:00 PM - 2:45 PM EDT (18:00 UTC - 18:45 UTC) -> 45 min
        OffsetDateTime start = OffsetDateTime.parse("2026-07-14T18:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-07-14T18:45:00Z");

        long minutes = SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(start, end);
        assertThat(minutes).isEqualTo(45);
    }

    @Test
    void respectsSundayEightAmOpening() {
        // Sunday 1:00 AM - 9:00 AM EDT (05:00 UTC - 13:00 UTC) -> 1-2 AM (60 min) + 8-9 AM (60 min) = 120 min
        OffsetDateTime start = OffsetDateTime.parse("2026-07-19T05:00:00Z");
        OffsetDateTime end = OffsetDateTime.parse("2026-07-19T13:00:00Z");

        long minutes = SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(start, end);
        assertThat(minutes).isEqualTo(120);
    }
}
