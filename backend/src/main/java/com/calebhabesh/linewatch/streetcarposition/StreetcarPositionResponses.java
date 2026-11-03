package com.calebhabesh.linewatch.streetcarposition;

import java.time.OffsetDateTime;
import java.util.List;

public final class StreetcarPositionResponses {
    private StreetcarPositionResponses() {
    }

    /**
     * {@code state}: live (fresh source), stale (source header older than its limit; every car
     * is marked stale), unavailable (no read or no schedule to identify streetcars yet), disabled.
     * Unavailable and disabled carry no vehicles.
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

    /** {@code ageSeconds} is measured on the server clock at {@code generatedAt}. */
    public record Vehicle(
        String vehicleId,
        String route,
        String routeName,
        String destination,
        double latitude,
        double longitude,
        Double bearing,
        OffsetDateTime reportedAt,
        long ageSeconds,
        boolean stale
    ) {
    }
}
