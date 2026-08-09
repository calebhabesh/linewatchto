package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public final class RegionalServiceDateFormatter {
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter MONTH_DAY = DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH);

    private RegionalServiceDateFormatter() {}

    public static String format(OffsetDateTime startInclusive, OffsetDateTime endExclusive) {
        if (startInclusive == null || endExclusive == null) {
            return null;
        }
        LocalDate start = startInclusive.atZoneSameInstant(TORONTO).toLocalDate();
        LocalDate end = endExclusive.atZoneSameInstant(TORONTO).toLocalDate().minusDays(1);
        if (end.isBefore(start)) {
            return null;
        }
        if (start.equals(end)) {
            return MONTH_DAY.format(start);
        }
        if (start.getYear() == end.getYear() && start.getMonth() == end.getMonth()) {
            return MONTH_DAY.format(start) + "–" + end.getDayOfMonth();
        }
        return MONTH_DAY.format(start) + "–" + MONTH_DAY.format(end);
    }
}
