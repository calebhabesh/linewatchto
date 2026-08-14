package com.calebhabesh.linewatch.surfacearrival;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcSurfaceScheduleCatalog {
    private final NamedParameterJdbcTemplate jdbc;
    private volatile Catalog cached = Catalog.empty();

    public TtcSurfaceScheduleCatalog(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Catalog active() {
        Optional<Long> importId = jdbc.query("""
            select id from gtfs_schedule_imports where active = true order by imported_at desc limit 1
            """, Map.of(), (rs, row) -> rs.getLong("id")).stream().findFirst();
        if (importId.isEmpty()) return Catalog.empty();
        Catalog current = cached;
        if (current.importId() == importId.get()) return current;
        synchronized (this) {
            if (cached.importId() == importId.get()) return cached;
            cached = load(importId.get());
            return cached;
        }
    }

    private Catalog load(long importId) {
        List<Route> routes = jdbc.query("""
            select route_id, route_short_name, route_long_name, mode
            from ttc_surface_routes where import_id = :importId
            """, Map.of("importId", importId), (rs, row) -> new Route(
            rs.getString("route_id"), rs.getString("route_short_name"),
            rs.getString("route_long_name"), rs.getString("mode")
        ));
        List<Stop> stops = jdbc.query("""
            select stop_id, station_id, stop_name, coalesce(bay_platform, '') as bay_platform
            from ttc_surface_station_stops where import_id = :importId
            """, Map.of("importId", importId), (rs, row) -> new Stop(
            rs.getString("stop_id"), rs.getString("station_id"),
            rs.getString("stop_name"), rs.getString("bay_platform")
        ));
        List<Trip> trips = jdbc.query("""
            select trip_id, route_id, coalesce(trip_headsign, '') as trip_headsign
            from ttc_surface_trips where import_id = :importId
            """, Map.of("importId", importId), (rs, row) -> new Trip(
            rs.getString("trip_id"), rs.getString("route_id"), rs.getString("trip_headsign")
        ));
        return new Catalog(
            importId,
            index(routes, Route::routeId),
            index(stops, Stop::stopId),
            index(trips, Trip::tripId),
            stops.stream().map(Stop::stationId).collect(Collectors.toUnmodifiableSet())
        );
    }

    private static <T> Map<String, T> index(List<T> values, Function<T, String> key) {
        return values.stream().collect(Collectors.toUnmodifiableMap(key, Function.identity(), (a, b) -> a));
    }

    public record Route(String routeId, String shortName, String longName, String mode) {
    }
    public record Stop(String stopId, String stationId, String stopName, String bayPlatform) {
    }
    public record Trip(String tripId, String routeId, String headsign) {
    }
    public record Catalog(
        long importId,
        Map<String, Route> routes,
        Map<String, Stop> stops,
        Map<String, Trip> trips,
        Set<String> mappedStationIds
    ) {
        static Catalog empty() { return new Catalog(-1, Map.of(), Map.of(), Map.of(), Set.of()); }
        public boolean available() {
            return importId >= 0 && !routes.isEmpty() && !stops.isEmpty() && !trips.isEmpty();
        }
    }
}
