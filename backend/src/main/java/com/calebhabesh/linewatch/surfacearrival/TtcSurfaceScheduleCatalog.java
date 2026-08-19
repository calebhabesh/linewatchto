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
        List<Connection> connections = jdbc.query("""
            select station_id, stop_id, route_id, mode, route_short_name, route_long_name,
                   coalesce(destination, '') as destination,
                   coalesce(bay_platform, '') as bay_platform,
                   stop_name
            from ttc_surface_station_connections where import_id = :importId
            order by route_short_name asc, destination asc
            """, Map.of("importId", importId), (rs, row) -> new Connection(
            rs.getString("station_id"), rs.getString("stop_id"), rs.getString("route_id"),
            rs.getString("mode"), rs.getString("route_short_name"), rs.getString("route_long_name"),
            rs.getString("destination"), rs.getString("bay_platform"), rs.getString("stop_name")
        ));
        if (connections.isEmpty()) {
            connections = loadDefaultConnections();
        }
        Map<String, List<Connection>> connectionsByStation = connections.stream()
            .collect(Collectors.groupingBy(Connection::stationId, Collectors.toUnmodifiableList()));

        Map<String, Route> routeMap = new java.util.HashMap<>(index(routes, Route::routeId));
        Map<String, Stop> stopMap = new java.util.HashMap<>(index(stops, Stop::stopId));
        Set<String> mappedStationIds = new java.util.HashSet<>(stops.stream().map(Stop::stationId).collect(Collectors.toSet()));

        for (Connection conn : connections) {
            if (!conn.stopId().isBlank() && !stopMap.containsKey(conn.stopId())) {
                stopMap.put(conn.stopId(), new Stop(conn.stopId(), conn.stationId(), conn.stopName(), conn.bayPlatform()));
            }
            if (!conn.routeId().isBlank() && !routeMap.containsKey(conn.routeId())) {
                routeMap.put(conn.routeId(), new Route(conn.routeId(), conn.routeShortName(), conn.routeLongName(), conn.mode()));
            }
            if (!conn.routeShortName().isBlank() && !routeMap.containsKey(conn.routeShortName())) {
                routeMap.put(conn.routeShortName(), new Route(conn.routeShortName(), conn.routeShortName(), conn.routeLongName(), conn.mode()));
            }
            mappedStationIds.add(conn.stationId());
        }

        return new Catalog(
            importId,
            Map.copyOf(routeMap),
            Map.copyOf(stopMap),
            index(trips, Trip::tripId),
            connectionsByStation,
            Set.copyOf(mappedStationIds)
        );
    }

    static List<Connection> loadDefaultConnections() {
        try (java.io.InputStream is = TtcSurfaceScheduleCatalog.class.getResourceAsStream("/arrival/ttc-surface-station-connections.csv")) {
            if (is == null) return List.of();
            try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8))) {
                List<Connection> list = new java.util.ArrayList<>();
                String line = reader.readLine(); // skip header
                while ((line = reader.readLine()) != null) {
                    if (line.isBlank()) continue;
                    String[] parts = line.split(",", -1);
                    if (parts.length >= 9) {
                        list.add(new Connection(
                            parts[0].trim(), parts[1].trim(), parts[2].trim(), parts[3].trim(),
                            parts[4].trim(), parts[5].trim(), parts[6].trim(), parts[7].trim(), parts[8].trim()
                        ));
                    }
                }
                return List.copyOf(list);
            }
        } catch (Exception ignored) {
            return List.of();
        }
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
    public record Connection(
        String stationId,
        String stopId,
        String routeId,
        String mode,
        String routeShortName,
        String routeLongName,
        String destination,
        String bayPlatform,
        String stopName
    ) {
    }
    public record Catalog(
        long importId,
        Map<String, Route> routes,
        Map<String, Stop> stops,
        Map<String, Trip> trips,
        Map<String, List<Connection>> connectionsByStation,
        Set<String> mappedStationIds
    ) {
        public static Catalog empty() {
            return new Catalog(-1, Map.of(), Map.of(), Map.of(), Map.of(), Set.of());
        }

        public static Catalog defaults() {
            List<Connection> defaults = loadDefaultConnections();
            Map<String, List<Connection>> connectionsByStation = defaults.stream()
                .collect(Collectors.groupingBy(Connection::stationId, Collectors.toUnmodifiableList()));
            Map<String, Route> routeMap = new java.util.HashMap<>();
            Map<String, Stop> stopMap = new java.util.HashMap<>();
            for (Connection conn : defaults) {
                if (!conn.stopId().isBlank()) {
                    stopMap.put(conn.stopId(), new Stop(conn.stopId(), conn.stationId(), conn.stopName(), conn.bayPlatform()));
                }
                if (!conn.routeId().isBlank()) {
                    routeMap.put(conn.routeId(), new Route(conn.routeId(), conn.routeShortName(), conn.routeLongName(), conn.mode()));
                }
                if (!conn.routeShortName().isBlank()) {
                    routeMap.put(conn.routeShortName(), new Route(conn.routeShortName(), conn.routeShortName(), conn.routeLongName(), conn.mode()));
                }
            }
            return new Catalog(-1, Map.copyOf(routeMap), Map.copyOf(stopMap), Map.of(), connectionsByStation, connectionsByStation.keySet());
        }
        public boolean available() {
            return !stops.isEmpty();
        }
        public List<Connection> connectionsFor(String stationId) {
            return connectionsByStation.getOrDefault(stationId, List.of());
        }
    }
}
