package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public final class SavedCommuteNotificationSchedule {
    public static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");

    private SavedCommuteNotificationSchedule() {}

    public static boolean matches(SavedCommuteEntity commute, String legId, Instant instant) {
        if (commute == null) {
            return false;
        }
        if ("return".equals(legId)) {
            return matches(
                commute.getNotificationReturnDayMask(),
                commute.getNotificationReturnStartMinute(),
                commute.getNotificationReturnEndMinute(),
                instant
            );
        }
        return matches(
            commute.getNotificationOutboundDayMask(),
            commute.getNotificationOutboundStartMinute(),
            commute.getNotificationOutboundEndMinute(),
            instant
        );
    }

    public static boolean matches(int dayMask, Integer startMinute, Integer endMinute, Instant instant) {
        if (instant == null) {
            return false;
        }
        ZonedDateTime local = instant.atZone(TORONTO_ZONE);
        int minute = local.getHour() * 60 + local.getMinute();

        if (startMinute == null || endMinute == null) {
            return includes(dayMask, local.toLocalDate());
        }
        if (startMinute < endMinute) {
            return includes(dayMask, local.toLocalDate())
                && minute >= startMinute
                && minute < endMinute;
        }
        if (minute >= startMinute) {
            return includes(dayMask, local.toLocalDate());
        }
        if (minute < endMinute) {
            return includes(dayMask, local.toLocalDate().minusDays(1));
        }
        return false;
    }

    /**
     * Matches an imprecise, all-day service-date range against the configured leg days.
     * The range end is exclusive, matching normalized alert active periods.
     */
    public static boolean overlapsServiceDates(
        SavedCommuteEntity commute,
        String legId,
        OffsetDateTime startInclusive,
        OffsetDateTime endExclusive
    ) {
        if (commute == null || startInclusive == null || endExclusive == null) {
            return false;
        }
        int dayMask = "return".equals(legId)
            ? commute.getNotificationReturnDayMask()
            : commute.getNotificationOutboundDayMask();
        LocalDate date = startInclusive.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        LocalDate end = endExclusive.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        while (date.isBefore(end)) {
            if (includes(dayMask, date)) {
                return true;
            }
            date = date.plusDays(1);
        }
        return false;
    }

    private static boolean includes(int dayMask, LocalDate date) {
        return (dayMask & dayBit(date)) != 0;
    }

    private static int dayBit(LocalDate date) {
        return switch (date.getDayOfWeek()) {
            case SUNDAY -> 1;
            case MONDAY -> 2;
            case TUESDAY -> 4;
            case WEDNESDAY -> 8;
            case THURSDAY -> 16;
            case FRIDAY -> 32;
            case SATURDAY -> 64;
        };
    }
}
