package com.calebhabesh.linewatch.arrival.schedule;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Converts between GTFS service-day times (seconds such as 25:30:00) and real instants.
 *
 * <p>GTFS measures stop times from "noon minus 12 hours" on the service date, not from midnight.
 * The two differ only on daylight-saving change days: on the autumn change midnight is still
 * on summer time, so anchoring at midnight puts every later departure an hour early, and on the
 * spring change an hour late. Always go through this class instead of adding seconds to the
 * start of the day or using the wall-clock second of day; GtfsServiceTimeTest fails the build
 * if either pattern appears in main sources.
 * TTC and Metrolinx both publish {@code agency_timezone} America/Toronto.
 */
public final class GtfsServiceTime {
    public static final ZoneId TORONTO = ZoneId.of("America/Toronto");

    private GtfsServiceTime() {
    }

    /** The instant GTFS time 00:00:00 refers to on {@code serviceDate}. */
    public static ZonedDateTime origin(LocalDate serviceDate) {
        return serviceDate.atTime(LocalTime.NOON).atZone(TORONTO).minusHours(12);
    }

    /** The instant of GTFS time {@code seconds} on {@code serviceDate}. */
    public static OffsetDateTime at(LocalDate serviceDate, long seconds) {
        return origin(serviceDate).plusSeconds(seconds).toOffsetDateTime();
    }

    /** {@code instant} as GTFS seconds on {@code serviceDate}; negative before the origin. */
    public static int secondsAt(LocalDate serviceDate, Instant instant) {
        return Math.toIntExact(Duration.between(origin(serviceDate).toInstant(), instant).toSeconds());
    }
}
