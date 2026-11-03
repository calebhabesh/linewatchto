package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;

/** One departure at one TTC surface stop, live (predictedAt set) or scheduled. */
public record TtcSurfaceStopArrival(
    String stopId,
    String routeId,
    String route,
    String routeName,
    String mode,
    String destination,
    OffsetDateTime scheduledAt,
    OffsetDateTime predictedAt,
    String tripId,
    String status
) {
    OffsetDateTime eventTime() {
        return predictedAt != null ? predictedAt : scheduledAt;
    }
}
