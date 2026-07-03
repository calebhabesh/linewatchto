package com.calebhabesh.linewatch.arrival.live;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.springframework.stereotype.Component;

@Component
public class SubwayOperatingWindow {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final int CLOSE_MINUTES = 2 * 60;
    private static final int WEEKDAY_SATURDAY_OPEN_MINUTES = 6 * 60;
    private static final int SUNDAY_OPEN_MINUTES = 8 * 60;

    private final Clock clock;

    public SubwayOperatingWindow(Clock clock) {
        this.clock = clock;
    }

    public boolean isOpen() {
        return isOpenAt(Instant.now(clock));
    }

    boolean isOpenAt(Instant instant) {
        ZonedDateTime torontoNow = instant.atZone(TORONTO_ZONE);
        int minutesAfterMidnight = torontoNow.getHour() * 60 + torontoNow.getMinute();
        int openingMinutes = openingMinutesFor(torontoNow.getDayOfWeek());
        return minutesAfterMidnight < CLOSE_MINUTES || minutesAfterMidnight >= openingMinutes;
    }

    private int openingMinutesFor(DayOfWeek dayOfWeek) {
        return dayOfWeek == DayOfWeek.SUNDAY ? SUNDAY_OPEN_MINUTES : WEEKDAY_SATURDAY_OPEN_MINUTES;
    }
}
