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

    /**
     * Whether a closure window [startInclusive, endExclusive) meets any occurrence of the leg's
     * trip times: each selected day's start-to-end minutes in Toronto time (past midnight when the
     * end is not after the start; the whole day when either is unset).
     */
    public static boolean overlaps(
        SavedCommuteEntity commute,
        String legId,
        OffsetDateTime startInclusive,
        OffsetDateTime endExclusive
    ) {
        if (commute == null || startInclusive == null || endExclusive == null) {
            return false;
        }
        boolean returnLeg = "return".equals(legId);
        return overlaps(
            returnLeg ? commute.getNotificationReturnDayMask() : commute.getNotificationOutboundDayMask(),
            returnLeg ? commute.getNotificationReturnStartMinute() : commute.getNotificationOutboundStartMinute(),
            returnLeg ? commute.getNotificationReturnEndMinute() : commute.getNotificationOutboundEndMinute(),
            startInclusive.toInstant(),
            endExclusive.toInstant()
        );
    }

    public static boolean overlaps(int dayMask, Integer startMinute, Integer endMinute, Instant start, Instant end) {
        if (start == null || end == null || !start.isBefore(end)) {
            return false;
        }
        // A trip occurrence starts on its selected day and may run into the next one.
        LocalDate date = start.atZone(TORONTO_ZONE).toLocalDate().minusDays(1);
        LocalDate last = end.atZone(TORONTO_ZONE).toLocalDate();
        for (int days = 0; !date.isAfter(last) && days < MAX_OVERLAP_DAYS; days++, date = date.plusDays(1)) {
            if (!includes(dayMask, date)) {
                continue;
            }
            Instant occurrenceStart;
            Instant occurrenceEnd;
            if (startMinute == null || endMinute == null) {
                occurrenceStart = date.atStartOfDay(TORONTO_ZONE).toInstant();
                occurrenceEnd = date.plusDays(1).atStartOfDay(TORONTO_ZONE).toInstant();
            } else {
                occurrenceStart = atMinute(date, startMinute);
                occurrenceEnd = atMinute(startMinute < endMinute ? date : date.plusDays(1), endMinute);
            }
            if (occurrenceStart.isBefore(end) && start.isBefore(occurrenceEnd)) {
                return true;
            }
        }
        // A window longer than the scan meets every selected day.
        return !date.isAfter(last) && dayMask != 0;
    }

    private static final int MAX_OVERLAP_DAYS = 400;

    private static Instant atMinute(LocalDate date, int minute) {
        // Wall-clock minutes, so a 7:00 AM trip stays 7:00 AM on a clock-change day.
        return date.atStartOfDay().plusMinutes(minute).atZone(TORONTO_ZONE).toInstant();
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
