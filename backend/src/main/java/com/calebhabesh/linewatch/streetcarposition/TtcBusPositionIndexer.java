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
 * Keeps the vehicles the active static schedule says are buses (plan 13, S8): a trip in the
 * schedule on a bus route (night routes included), or a streetcar route's replacement-bus trip,
 * which is kept and marked. Streetcar trips are left to {@link TtcStreetcarPositionIndexer}.
 * Vehicles without a trip and trips the schedule does not know are left out, as for streetcars.
 */
@Component
public class TtcBusPositionIndexer {
    private static final String BUS = "bus";
    private static final String STREETCAR = "streetcar";
    private final TtcSurfaceScheduleCatalog scheduleCatalog;

    public TtcBusPositionIndexer(TtcSurfaceScheduleCatalog scheduleCatalog) {
        this.scheduleCatalog = scheduleCatalog;
    }

    public TtcBusPositionSnapshot index(TtcVehiclePositionParser.Feed feed, OffsetDateTime indexedAt) {
        TtcSurfaceScheduleCatalog.Catalog catalog = scheduleCatalog.active();
        if (catalog.importId() < 0 || catalog.trips().isEmpty()) {
            return new TtcBusPositionSnapshot(feed.sourceUpdatedAt(), indexedAt, false, List.of(),
                new TtcBusPositionSnapshot.Omitted(0, 0, 0, 0));
        }
        Map<String, TtcBusPositionSnapshot.BusPosition> byVehicle = new LinkedHashMap<>();
        int withoutTrip = 0;
        int unmatched = 0;
        int streetcar = 0;
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
            if (route == null) continue;
            boolean replacement = false;
            if (STREETCAR.equals(route.mode())) {
                if (!trip.headsign().toLowerCase(Locale.ROOT).contains("replacement bus")) {
                    streetcar++;
                    continue;
                }
                replacement = true;
            } else if (!BUS.equals(route.mode())) {
                continue;
            }
            if (vehicle.reportedAt() == null) {
                withoutTimestamp++;
                continue;
            }
            if (!TtcStreetcarPositionIndexer.plausible(vehicle.latitude(), vehicle.longitude())) continue;
            String key = vehicle.vehicleId() != null && !vehicle.vehicleId().isBlank()
                ? vehicle.vehicleId() : "trip:" + vehicle.tripId();
            TtcBusPositionSnapshot.BusPosition position = new TtcBusPositionSnapshot.BusPosition(
                vehicle.vehicleId(), vehicle.tripId(), route.shortName(), route.longName(), trip.headsign(),
                vehicle.latitude(), vehicle.longitude(), vehicle.bearing(), vehicle.reportedAt(), replacement);
            TtcBusPositionSnapshot.BusPosition existing = byVehicle.get(key);
            if (existing == null || existing.reportedAt().isBefore(position.reportedAt())) byVehicle.put(key, position);
        }
        List<TtcBusPositionSnapshot.BusPosition> vehicles = new ArrayList<>(byVehicle.values());
        vehicles.sort(Comparator.comparing(TtcBusPositionSnapshot.BusPosition::route)
            .thenComparing(position -> position.vehicleId() == null ? "" : position.vehicleId()));
        return new TtcBusPositionSnapshot(feed.sourceUpdatedAt(), indexedAt, true, vehicles,
            new TtcBusPositionSnapshot.Omitted(withoutTrip, unmatched, streetcar, withoutTimestamp));
    }
}
