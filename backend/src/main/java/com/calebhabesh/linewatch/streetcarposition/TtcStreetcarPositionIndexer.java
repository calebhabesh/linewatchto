package com.calebhabesh.linewatch.streetcarposition;

import com.calebhabesh.linewatch.surfacearrival.TtcSurfaceScheduleCatalog;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Keeps the vehicles the active static schedule says are streetcars: a trip in the schedule,
 * on a streetcar route, whose headsign is not a replacement bus. Vehicles without a trip (yard
 * and out-of-service moves) and trips the schedule does not know are left out, since the map
 * cannot say what they are.
 *
 * <p>The feed's stop_id and current_stop_sequence do not match the published schedule's stops
 * (measured 2026-11-02), so no next stop is derived from them.
 */
@Component
public class TtcStreetcarPositionIndexer {
    private static final String STREETCAR = "streetcar";
    private final TtcSurfaceScheduleCatalog scheduleCatalog;

    public TtcStreetcarPositionIndexer(TtcSurfaceScheduleCatalog scheduleCatalog) {
        this.scheduleCatalog = scheduleCatalog;
    }

    public TtcStreetcarPositionSnapshot index(TtcVehiclePositionParser.Feed feed, OffsetDateTime indexedAt) {
        TtcSurfaceScheduleCatalog.Catalog catalog = scheduleCatalog.active();
        if (catalog.importId() < 0 || catalog.trips().isEmpty()) {
            return new TtcStreetcarPositionSnapshot(feed.sourceUpdatedAt(), indexedAt, false, List.of(),
                new TtcStreetcarPositionSnapshot.Omitted(0, 0, 0, 0));
        }
        Map<String, TtcStreetcarPositionSnapshot.StreetcarPosition> byVehicle = new LinkedHashMap<>();
        int withoutTrip = 0;
        int unmatched = 0;
        int replacement = 0;
        int withoutTimestamp = 0;
        for (TtcVehiclePositionParser.Vehicle vehicle : feed.vehicles()) {
            if (vehicle.tripId() == null || vehicle.tripId().isBlank()) {
                withoutTrip++;
                continue;
            }
            TtcSurfaceScheduleCatalog.Trip trip = catalog.trips().get(vehicle.tripId());
            if (trip == null) {
                unmatched++;
                continue;
            }
            TtcSurfaceScheduleCatalog.Route route = catalog.routes().get(trip.routeId());
            if (route == null || !STREETCAR.equals(route.mode())) continue;
            if (trip.headsign().toLowerCase(Locale.ROOT).contains("replacement bus")) {
                replacement++;
                continue;
            }
            if (vehicle.reportedAt() == null) {
                withoutTimestamp++;
                continue;
            }
            if (!plausible(vehicle.latitude(), vehicle.longitude())) continue;
            String key = vehicle.vehicleId() != null && !vehicle.vehicleId().isBlank()
                ? vehicle.vehicleId() : "trip:" + vehicle.tripId();
            TtcStreetcarPositionSnapshot.StreetcarPosition position = new TtcStreetcarPositionSnapshot.StreetcarPosition(
                vehicle.vehicleId(), vehicle.tripId(), route.shortName(), route.longName(), trip.headsign(),
                vehicle.latitude(), vehicle.longitude(), vehicle.bearing(), vehicle.reportedAt());
            TtcStreetcarPositionSnapshot.StreetcarPosition existing = byVehicle.get(key);
            if (existing == null || existing.reportedAt().isBefore(position.reportedAt())) byVehicle.put(key, position);
        }
        List<TtcStreetcarPositionSnapshot.StreetcarPosition> vehicles = new ArrayList<>(byVehicle.values());
        vehicles.sort(Comparator.comparing(TtcStreetcarPositionSnapshot.StreetcarPosition::route)
            .thenComparing(position -> position.vehicleId() == null ? "" : position.vehicleId()));
        return new TtcStreetcarPositionSnapshot(feed.sourceUpdatedAt(), indexedAt, true, vehicles,
            new TtcStreetcarPositionSnapshot.Omitted(withoutTrip, unmatched, replacement, withoutTimestamp));
    }

    /** A rough Greater Toronto box; a 0,0 or swapped fix is not a position. */
    static boolean plausible(double latitude, double longitude) {
        return latitude > 43.4 && latitude < 44.1 && longitude > -79.9 && longitude < -79.0;
    }
}
