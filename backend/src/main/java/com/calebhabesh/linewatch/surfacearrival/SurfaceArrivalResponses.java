package com.calebhabesh.linewatch.surfacearrival;

import java.time.OffsetDateTime;
import java.util.List;

public final class SurfaceArrivalResponses {
    private SurfaceArrivalResponses() {
    }

    public record SnapshotResponse(
        String networkId,
        String stationId,
        String stationName,
        String availability,
        OffsetDateTime generatedAt,
        OffsetDateTime sourceUpdatedAt,
        String source,
        String message,
        List<ArrivalResponse> arrivals
    ) {
    }

    public record ArrivalResponse(
        String agency,
        String mode,
        String route,
        String routeName,
        String destination,
        Integer minutes,
        OffsetDateTime predictedAt,
        OffsetDateTime scheduledAt,
        String bayPlatform,
        String stopName,
        String tripId,
        String source,
        String status
    ) {
    }
}
