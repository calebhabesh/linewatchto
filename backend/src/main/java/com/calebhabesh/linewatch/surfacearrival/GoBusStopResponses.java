package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.List;

public final class GoBusStopResponses {
    private GoBusStopResponses() {
    }

    /**
     * One GO bus stop's departures (plan 13, S6). {@code availability} is
     * {@code available}, {@code no-departures}, {@code disabled} or
     * {@code unavailable} (source failed, stale or busy); only
     * {@code available} carries departures.
     */
    public record StopDeparturesResponse(
        String networkId,
        String stopCode,
        String stopName,
        List<String> routes,
        String availability,
        String message,
        OffsetDateTime generatedAt,
        OffsetDateTime sourceUpdatedAt,
        String source,
        int horizonMinutes,
        List<DepartureResponse> departures
    ) {
    }

    /**
     * {@code status} is {@code live} only when Metrolinx computed a time that
     * differs from the schedule; a computed time equal to the schedule, or no
     * computed time, is {@code scheduled}.
     */
    public record DepartureResponse(
        String route,
        String routeName,
        String destination,
        int minutes,
        OffsetDateTime at,
        OffsetDateTime predictedAt,
        OffsetDateTime scheduledAt,
        String bayPlatform,
        String tripId,
        String status
    ) {
    }
}
