package com.calebhabesh.linewatch.surfacearrival;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class TtcSurfaceStopResponses {
    private TtcSurfaceStopResponses() {
    }

    /**
     * Departures at one TTC surface stop. availability is available, no-departures, disabled,
     * not-in-schedule (the stop code is only in a retained older schedule) or unavailable
     * (the stop catalog is not loaded). Every departure carries status live or scheduled.
     */
    public record StopArrivalsResponse(
        String networkId,
        String stopCode,
        String stopId,
        String stopName,
        String stationId,
        Double latitude,
        Double longitude,
        String availability,
        String message,
        OffsetDateTime generatedAt,
        int horizonMinutes,
        LiveSource live,
        ScheduleSource schedule,
        List<RouteDepartures> routes
    ) {
    }

    /** state: live (fresh), stale, unavailable or disabled. Only fresh predictions are returned. */
    public record LiveSource(String state, OffsetDateTime sourceUpdatedAt, long maxAgeSeconds, String source) {
    }

    /** state: available or unavailable; the service dates are those of the schedule the stop was found in. */
    public record ScheduleSource(String state, LocalDate serviceStart, LocalDate serviceEnd, String source) {
    }

    public record RouteDepartures(
        String route,
        String routeName,
        String mode,
        String destination,
        List<Departure> departures
    ) {
    }

    public record Departure(
        String status,
        OffsetDateTime at,
        OffsetDateTime predictedAt,
        OffsetDateTime scheduledAt,
        int minutes
    ) {
    }
}
