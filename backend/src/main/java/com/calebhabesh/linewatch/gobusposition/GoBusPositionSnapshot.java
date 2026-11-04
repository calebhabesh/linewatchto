package com.calebhabesh.linewatch.gobusposition;

import java.time.OffsetDateTime;
import java.util.List;

/** One indexed GO VehiclePosition read: the GO buses it could place (plan 13, S9). */
public record GoBusPositionSnapshot(OffsetDateTime sourceUpdatedAt, List<GoBusPosition> buses, Omitted omitted) {
    public GoBusPositionSnapshot {
        buses = List.copyOf(buses);
    }

    /**
     * {@code route}: the GO route number ("41"). {@code destination}: from the vehicle label
     * ("41 - Hamilton GO" gives "Hamilton GO"), null when absent. {@code startsAt}: the trip's
     * scheduled start (start date and time, Toronto), null when the feed omits it.
     * {@code nextStopCode}: the GO stop number the bus is heading to or at.
     */
    public record GoBusPosition(
        String vehicleId,
        String tripId,
        String route,
        String destination,
        double latitude,
        double longitude,
        OffsetDateTime reportedAt,
        OffsetDateTime startsAt,
        String nextStopCode
    ) {
    }

    /** Bus entities on the feed that are not placed, by reason (not a public claim). */
    public record Omitted(int withoutTrip, int withoutPosition, int withoutTimestamp) {
    }
}
