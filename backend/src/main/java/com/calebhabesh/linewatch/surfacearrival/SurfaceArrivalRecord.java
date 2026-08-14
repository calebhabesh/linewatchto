package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;

public record SurfaceArrivalRecord(
    String stationId,
    String agency,
    String mode,
    String route,
    String routeName,
    String destination,
    OffsetDateTime scheduledAt,
    OffsetDateTime predictedAt,
    String bayPlatform,
    String stopName,
    String tripId,
    String source,
    String status
) {
}
