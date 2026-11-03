package com.calebhabesh.linewatch.streetcarposition;

import java.time.OffsetDateTime;
import java.util.List;

/** One indexed read of the vehicle feed: the buses it could identify (plan 13, S8), and what it left out. */
public record TtcBusPositionSnapshot(
    OffsetDateTime sourceUpdatedAt,
    OffsetDateTime indexedAt,
    boolean scheduleAvailable,
    List<BusPosition> vehicles,
    Omitted omitted
) {
    public TtcBusPositionSnapshot {
        vehicles = List.copyOf(vehicles);
    }

    /** {@code replacement}: a bus running a streetcar route's replacement-bus trip (e.g. 503). */
    public record BusPosition(
        String vehicleId,
        String tripId,
        String route,
        String routeName,
        String destination,
        double latitude,
        double longitude,
        Double bearing,
        OffsetDateTime reportedAt,
        boolean replacement
    ) {
    }

    /** Vehicles on the feed that are not drawn as buses, by reason (logged; not a public claim). */
    public record Omitted(int withoutTrip, int unmatchedTrip, int streetcar, int withoutTimestamp) {
    }
}
