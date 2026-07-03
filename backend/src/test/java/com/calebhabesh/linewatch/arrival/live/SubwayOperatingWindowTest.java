package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class SubwayOperatingWindowTest {

    @Test
    void keepsServiceOpenBeforeTwoAmBecausePreviousServiceDayIsStillEnding() {
        SubwayOperatingWindow window = windowAt("2026-07-03T05:45:00Z"); // 1:45 AM EDT

        assertThat(window.isOpen()).isTrue();
    }

    @Test
    void closesAfterTwoAmUntilWeekdayStart() {
        assertThat(windowAt("2026-07-03T06:20:00Z").isOpen()).isFalse(); // 2:20 AM EDT
        assertThat(windowAt("2026-07-03T09:55:00Z").isOpen()).isFalse(); // 5:55 AM EDT
        assertThat(windowAt("2026-07-03T10:00:00Z").isOpen()).isTrue(); // 6:00 AM EDT
    }

    @Test
    void usesLaterSundayStart() {
        assertThat(windowAt("2026-07-05T11:30:00Z").isOpen()).isFalse(); // Sunday 7:30 AM EDT
        assertThat(windowAt("2026-07-05T12:00:00Z").isOpen()).isTrue(); // Sunday 8:00 AM EDT
    }

    private SubwayOperatingWindow windowAt(String instant) {
        return new SubwayOperatingWindow(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }
}
