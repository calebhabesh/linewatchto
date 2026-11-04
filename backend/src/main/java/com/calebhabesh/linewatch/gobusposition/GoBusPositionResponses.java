package com.calebhabesh.linewatch.gobusposition;

import java.time.OffsetDateTime;
import java.util.List;

/** Live GO bus positions (plan 13, S9): the TTC bus contract's shape, for GO. */
public final class GoBusPositionResponses {
    private GoBusPositionResponses() {
    }

    /**
     * {@code state}: live, stale, unavailable or disabled. {@code vehicles} holds only buses on a
     * trip that has started, inside the requested area when one was given.
     */
    public record PositionsResponse(
        String networkId,
        String state,
        String source,
        OffsetDateTime generatedAt,
        OffsetDateTime sourceUpdatedAt,
        long maxSourceAgeSeconds,
        long vehicleStaleAfterSeconds,
        long vehicleMaxAgeSeconds,
        long refreshSeconds,
        List<Vehicle> vehicles
    ) {
    }

    /**
     * {@code ageSeconds} is measured on the server clock at {@code generatedAt}.
     * {@code nextStopCode}: the GO stop number the bus is heading to or at (GO publishes no
     * heading for buses, so there is no bearing).
     */
    public record Vehicle(
        String vehicleId,
        String tripId,
        String route,
        String destination,
        double latitude,
        double longitude,
        OffsetDateTime reportedAt,
        long ageSeconds,
        boolean stale,
        String nextStopCode
    ) {
    }
}
