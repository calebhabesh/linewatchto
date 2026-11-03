package com.calebhabesh.linewatch.streetcarposition;

import java.time.OffsetDateTime;
import java.util.List;

/** One indexed read of the vehicle feed: the streetcars it could identify, and what it left out. */
public record TtcStreetcarPositionSnapshot(
    OffsetDateTime sourceUpdatedAt,
    OffsetDateTime indexedAt,
    boolean scheduleAvailable,
    List<StreetcarPosition> vehicles,
    Omitted omitted
) {
    public TtcStreetcarPositionSnapshot {
        vehicles = List.copyOf(vehicles);
    }

    public record StreetcarPosition(
        String vehicleId,
        String tripId,
        String route,
        String routeName,
        String destination,
        double latitude,
        double longitude,
        Double bearing,
        OffsetDateTime reportedAt
    ) {
    }

    /** Vehicles on the feed that are not drawn, by reason (logged; not a public claim). */
    public record Omitted(int withoutTrip, int unmatchedTrip, int replacementBus, int withoutTimestamp) {
    }
}
