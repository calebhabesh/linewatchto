package com.calebhabesh.linewatch.reliability;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public final class SubwayOperatingHoursCalculator {
    public static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private SubwayOperatingHoursCalculator() {}

    /**
     * Calculates the number of minutes within [start, end] that fall strictly within
     * Toronto subway operating hours.
     * Mon-Sat: 6:00 AM - 2:00 AM (closed 2:00 AM - 6:00 AM)
     * Sun: 8:00 AM - 2:00 AM (closed 2:00 AM - 8:00 AM)
     */
    public static long calculateSubwayOperatingMinutes(OffsetDateTime start, OffsetDateTime end) {
        if (start == null || end == null || !end.isAfter(start)) {
            return 0;
        }
        ZonedDateTime zStart = start.atZoneSameInstant(TORONTO_ZONE);
        ZonedDateTime zEnd = end.atZoneSameInstant(TORONTO_ZONE);

        long totalMinutes = Duration.between(zStart, zEnd).toMinutes();
        long closedMinutes = 0;

        LocalDate startDate = zStart.toLocalDate();
        LocalDate endDate = zEnd.toLocalDate();

        for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
            ZonedDateTime closedStart = date.atTime(2, 0).atZone(TORONTO_ZONE);
            int openHour = (date.getDayOfWeek() == DayOfWeek.SUNDAY) ? 8 : 6;
            ZonedDateTime closedEnd = date.atTime(openHour, 0).atZone(TORONTO_ZONE);

            ZonedDateTime overlapStart = zStart.isAfter(closedStart) ? zStart : closedStart;
            ZonedDateTime overlapEnd = zEnd.isBefore(closedEnd) ? zEnd : closedEnd;

            if (overlapEnd.isAfter(overlapStart)) {
                closedMinutes += Duration.between(overlapStart, overlapEnd).toMinutes();
            }
        }

        return Math.max(0, totalMinutes - closedMinutes);
    }
}
