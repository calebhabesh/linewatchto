package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.core.namedparam.SqlParameterSourceUtils;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class GtfsScheduleImportRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public GtfsScheduleImportRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long beginReplacementImport(
        String sourceName,
        String sourceUrl,
        OffsetDateTime importedAt,
        LocalDate serviceStart,
        LocalDate serviceEnd
    ) {
        String sql = """
            insert into gtfs_schedule_imports (
                source_name, source_url, imported_at, service_start, service_end, active
            ) values (
                :sourceName, :sourceUrl, :importedAt, :serviceStart, :serviceEnd, false
            )
            """;
        SqlParameterSource params = new MapSqlParameterSource()
            .addValue("sourceName", sourceName)
            .addValue("sourceUrl", sourceUrl)
            .addValue("importedAt", importedAt)
            .addValue("serviceStart", serviceStart)
            .addValue("serviceEnd", serviceEnd);
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(sql, params, keyHolder, new String[]{"id"});
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to generate import ID");
        }
        return key.longValue();
    }

    public void insertRoutes(long importId, List<GtfsImportModels.RouteRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_routes (
                import_id, route_id, line_id, route_short_name, route_long_name
            ) values (
                :importId, :routeId, :lineId, :shortName, :longName
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("routeId", row.routeId())
                .addValue("lineId", row.lineId())
                .addValue("shortName", row.shortName())
                .addValue("longName", row.longName()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertStops(long importId, List<GtfsImportModels.StopRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_stops (
                import_id, stop_id, stop_name, parent_station
            ) values (
                :importId, :stopId, :stopName, :parentStation
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("stopId", row.stopId())
                .addValue("stopName", row.stopName())
                .addValue("parentStation", row.parentStation().isEmpty() ? null : row.parentStation()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertServices(long importId, List<GtfsImportModels.ServiceRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_services (
                import_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
            ) values (
                :importId, :serviceId, :monday, :tuesday, :wednesday, :thursday, :friday, :saturday, :sunday, :startDate, :endDate
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("serviceId", row.serviceId())
                .addValue("monday", row.monday())
                .addValue("tuesday", row.tuesday())
                .addValue("wednesday", row.wednesday())
                .addValue("thursday", row.thursday())
                .addValue("friday", row.friday())
                .addValue("saturday", row.saturday())
                .addValue("sunday", row.sunday())
                .addValue("startDate", row.startDate())
                .addValue("endDate", row.endDate()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertServiceExceptions(long importId, List<GtfsImportModels.ServiceExceptionRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_service_exceptions (
                import_id, service_id, service_date, exception_type
            ) values (
                :importId, :serviceId, :serviceDate, :exceptionType
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("serviceId", row.serviceId())
                .addValue("serviceDate", row.serviceDate())
                .addValue("exceptionType", row.exceptionType()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertTrips(long importId, List<GtfsImportModels.TripRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_trips (
                import_id, trip_id, route_id, service_id, trip_headsign, direction_id
            ) values (
                :importId, :tripId, :routeId, :serviceId, :tripHeadsign, :directionId
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("tripId", row.tripId())
                .addValue("routeId", row.routeId())
                .addValue("serviceId", row.serviceId())
                .addValue("tripHeadsign", row.tripHeadsign())
                .addValue("directionId", row.directionId()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertStopTimes(long importId, List<GtfsImportModels.StopTimeRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_stop_times (
                import_id, trip_id, stop_id, arrival_seconds, departure_seconds, stop_sequence
            ) values (
                :importId, :tripId, :stopId, :arrivalSeconds, :departureSeconds, :stopSequence
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("tripId", row.tripId())
                .addValue("stopId", row.stopId())
                .addValue("arrivalSeconds", row.arrivalSeconds())
                .addValue("departureSeconds", row.departureSeconds())
                .addValue("stopSequence", row.stopSequence()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertStationStops(long importId, List<GtfsImportModels.StationStopRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into gtfs_station_stops (
                import_id, station_id, line_id, stop_id
            ) values (
                :importId, :stationId, :lineId, :stopId
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("stationId", row.stationId())
                .addValue("lineId", row.lineId())
                .addValue("stopId", row.stopId()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertSurfaceRoutes(long importId, List<GtfsImportModels.SurfaceRouteRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into ttc_surface_routes (
                import_id, route_id, route_short_name, route_long_name, mode
            ) values (
                :importId, :routeId, :shortName, :longName, :mode
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("routeId", row.routeId())
                .addValue("shortName", row.shortName())
                .addValue("longName", row.longName())
                .addValue("mode", row.mode()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertSurfaceStationStops(
        long importId,
        List<GtfsImportModels.SurfaceStationStopRow> rows
    ) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into ttc_surface_station_stops (
                import_id, stop_id, station_id, stop_name, parent_station, bay_platform
            ) values (
                :importId, :stopId, :stationId, :stopName, :parentStation, :bayPlatform
            )
            """;
        SqlParameterSource[] batch = rows.stream()
            .map(row -> new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("stopId", row.stopId())
                .addValue("stationId", row.stationId())
                .addValue("stopName", row.stopName())
                .addValue("parentStation", row.parentStation())
                .addValue("bayPlatform", row.bayPlatform().isBlank() ? null : row.bayPlatform()))
            .toArray(SqlParameterSource[]::new);
        jdbc.batchUpdate(sql, batch);
    }

    public void insertSurfaceTrips(long importId, List<GtfsImportModels.SurfaceTripRow> rows) {
        if (rows.isEmpty()) return;
        String sql = """
            insert into ttc_surface_trips (
                import_id, trip_id, route_id, trip_headsign
            ) values (
                :importId, :tripId, :routeId, :tripHeadsign
            )
            """;
        for (int start = 0; start < rows.size(); start += 1000) {
            int end = Math.min(start + 1000, rows.size());
            SqlParameterSource[] batch = rows.subList(start, end).stream()
                .map(row -> new MapSqlParameterSource()
                    .addValue("importId", importId)
                    .addValue("tripId", row.tripId())
                    .addValue("routeId", row.routeId())
                    .addValue("tripHeadsign", row.tripHeadsign()))
                .toArray(SqlParameterSource[]::new);
            jdbc.batchUpdate(sql, batch);
        }
    }

    public void activateImport(long importId) {
        jdbc.update(
            "update gtfs_schedule_imports set active = false where active = true",
            Map.of()
        );
        jdbc.update(
            "update gtfs_schedule_imports set active = true where id = :importId",
            Map.of("importId", importId)
        );
    }

    public Optional<Long> activateLatestImportCoveringDate(LocalDate serviceDate) {
        List<ActivationCandidate> candidates = jdbc.query("""
            select id, active
            from gtfs_schedule_imports
            where service_start <= :serviceDate
              and service_end >= :serviceDate
            order by service_start desc,
                     imported_at desc,
                     id desc
            limit 1
            """, new MapSqlParameterSource(Map.of(
                "serviceDate", serviceDate
            )), (rs, rowNum) -> new ActivationCandidate(
                rs.getLong("id"),
                rs.getBoolean("active")
            ));

        Optional<ActivationCandidate> candidate = candidates.stream().findFirst();
        candidate
            .filter(importCandidate -> !importCandidate.active())
            .ifPresent(importCandidate -> activateImport(importCandidate.id()));
        return candidate.map(ActivationCandidate::id);
    }

    private record ActivationCandidate(long id, boolean active) {
    }
}
