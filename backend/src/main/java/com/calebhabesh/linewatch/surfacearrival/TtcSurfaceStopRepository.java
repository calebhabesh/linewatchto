package com.calebhabesh.linewatch.surfacearrival;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Reads the all-stops TTC surface catalog (V91) by stop code, the number on the stop pole. */
@Repository
public class TtcSurfaceStopRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcSurfaceStopRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ActiveCatalog> activeCatalog() {
        return jdbc.query("""
            select id, surface_stop_catalog_available, service_start, service_end
            from gtfs_schedule_imports where active = true order by imported_at desc limit 1
            """, Map.of(), (rs, row) -> new ActiveCatalog(
                rs.getLong("id"), rs.getBoolean("surface_stop_catalog_available"),
                rs.getObject("service_start", LocalDate.class), rs.getObject("service_end", LocalDate.class)
            )).stream().findFirst();
    }

    public Optional<Stop> findStop(long importId, String stopCode) {
        return jdbc.query("""
            select stop_id, stop_code, stop_name, station_id, latitude, longitude
            from ttc_surface_stops where import_id = :importId and stop_code = :stopCode
            order by stop_id limit 1
            """, Map.of("importId", importId, "stopCode", stopCode), (rs, row) -> stop(rs)).stream().findFirst();
    }

    /** The newest other retained import that knew this stop code, for a stop the active schedule dropped. */
    public Optional<Stop> findStopInOtherImport(long activeImportId, String stopCode) {
        return jdbc.query("""
            select s.stop_id, s.stop_code, s.stop_name, s.station_id, s.latitude, s.longitude
            from ttc_surface_stops s
            join gtfs_schedule_imports i on i.id = s.import_id
            where s.stop_code = :stopCode and s.import_id <> :importId
            order by i.service_end desc nulls last, i.id desc limit 1
            """, Map.of("importId", activeImportId, "stopCode", stopCode), (rs, row) -> stop(rs))
            .stream().findFirst();
    }

    public List<StopRoute> routes(long importId, String stopId) {
        return jdbc.query("""
            select r.route_id, r.route_short_name, coalesce(r.route_long_name, '') as route_long_name, r.mode,
                   sr.destination
            from ttc_surface_stop_routes sr
            join ttc_surface_routes r on r.import_id = sr.import_id and r.route_id = sr.route_id
            where sr.import_id = :importId and sr.stop_id = :stopId
            order by r.route_short_name, sr.destination
            """, Map.of("importId", importId, "stopId", stopId), (rs, row) -> new StopRoute(
                rs.getString("route_id"), rs.getString("route_short_name"), rs.getString("route_long_name"),
                rs.getString("mode"), rs.getString("destination")
            ));
    }

    private static Stop stop(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Stop(
            rs.getString("stop_id"), rs.getString("stop_code"), rs.getString("stop_name"), rs.getString("station_id"),
            (Double) rs.getObject("latitude"), (Double) rs.getObject("longitude")
        );
    }

    public record ActiveCatalog(long importId, boolean stopCatalogAvailable, LocalDate serviceStart, LocalDate serviceEnd) {
    }

    public record Stop(String stopId, String stopCode, String stopName, String stationId, Double latitude, Double longitude) {
    }

    public record StopRoute(String routeId, String route, String routeName, String mode, String destination) {
    }
}
