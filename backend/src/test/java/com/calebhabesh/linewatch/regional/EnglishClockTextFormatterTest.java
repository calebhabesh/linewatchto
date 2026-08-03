package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EnglishClockTextFormatterTest {
    @Test
    void convertsMetrolinxClockTimesAndRanges() {
        assertThat(EnglishClockTextFormatter.toTwelveHourClock(
            "Trains operate from 06:30 to 09:45 and again from 15:30-24:00."
        )).isEqualTo(
            "Trains operate from 6:30 AM to 9:45 AM and again from 3:30 PM-12:00 AM."
        );
    }

    @Test
    void handlesNoonAndMidnight() {
        assertThat(EnglishClockTextFormatter.toTwelveHourClock("00:00, 12:00, 12:01, 23:59"))
            .isEqualTo("12:00 AM, 12:00 PM, 12:01 PM, 11:59 PM");
    }

    @Test
    void leavesDatesDurationsIdentifiersAndExistingTwelveHourTimesUntouched() {
        String source = "2026-08-03T15:30:00Z; runtime 01:30:45; route 21:30A; 3:30 p.m.; 24:15";

        assertThat(EnglishClockTextFormatter.toTwelveHourClock(source)).isEqualTo(source);
    }

    @Test
    void preservesNullAndBlankValues() {
        assertThat(EnglishClockTextFormatter.toTwelveHourClock(null)).isNull();
        assertThat(EnglishClockTextFormatter.toTwelveHourClock("  ")).isEqualTo("  ");
    }
}
