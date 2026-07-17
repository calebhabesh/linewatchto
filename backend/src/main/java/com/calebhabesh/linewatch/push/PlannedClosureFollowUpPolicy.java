package com.calebhabesh.linewatch.push;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Locale;

public enum PlannedClosureFollowUpPolicy {
    SMART("smart"),
    WITHIN_24_HOURS("within-24-hours"),
    DAY_OF("day-of"),
    ANNOUNCEMENTS_ONLY("announcements-only");

    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final LocalTime DAY_OF_START = LocalTime.of(6, 0);
    private final String apiValue;

    PlannedClosureFollowUpPolicy(String apiValue) {
        this.apiValue = apiValue;
    }

    public String apiValue() {
        return apiValue;
    }

    public static PlannedClosureFollowUpPolicy fromApiValue(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        for (PlannedClosureFollowUpPolicy policy : values()) {
            if (policy.apiValue.equals(normalized)) {
                return policy;
            }
        }
        throw new IllegalArgumentException("Unsupported planned closure follow-up policy: " + value);
    }

    public static PlannedClosureFollowUpPolicy fromLegacy(boolean closure24h, boolean closureMorning) {
        if (closure24h && closureMorning) return SMART;
        if (closure24h) return WITHIN_24_HOURS;
        if (closureMorning) return DAY_OF;
        return ANNOUNCEMENTS_ONLY;
    }

    public boolean legacyClosure24hEnabled() {
        return this == SMART || this == WITHIN_24_HOURS;
    }

    public boolean legacyClosureMorningEnabled() {
        return this == SMART || this == DAY_OF;
    }

    public boolean allowsReminderBucket(String reminderBucket) {
        return switch (reminderBucket) {
            case "on-change" -> true;
            case "closure-24h" -> this == SMART || this == WITHIN_24_HOURS;
            case "closure-morning" -> this == SMART || this == DAY_OF;
            default -> true;
        };
    }

    public String reminderBucket(Instant now, Instant eventStart) {
        if (now == null || eventStart == null || !now.isBefore(eventStart)) {
            return "on-change";
        }

        Duration untilStart = Duration.between(now, eventStart);
        boolean within24Hours = untilStart.compareTo(Duration.ofHours(24)) <= 0;
        ZonedDateTime nowToronto = now.atZone(TORONTO_ZONE);
        ZonedDateTime startToronto = eventStart.atZone(TORONTO_ZONE);
        boolean eligibleDayOf = nowToronto.toLocalDate().equals(startToronto.toLocalDate())
            && !nowToronto.toLocalTime().isBefore(DAY_OF_START);

        return switch (this) {
            case ANNOUNCEMENTS_ONLY -> "on-change";
            case WITHIN_24_HOURS -> within24Hours ? "closure-24h" : "on-change";
            case DAY_OF -> eligibleDayOf ? "closure-morning" : "on-change";
            case SMART -> smartBucket(within24Hours, eligibleDayOf, startToronto.toLocalTime());
        };
    }

    private String smartBucket(boolean within24Hours, boolean eligibleDayOf, LocalTime startTime) {
        boolean earlyMorningClosure = !startTime.isAfter(DAY_OF_START);
        if (earlyMorningClosure) {
            return within24Hours ? "closure-24h" : "on-change";
        }
        return eligibleDayOf ? "closure-morning" : "on-change";
    }
}
