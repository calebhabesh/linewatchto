package com.calebhabesh.linewatch.arrival.schedule;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class GtfsScheduleReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public GtfsScheduleReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Long> findActiveImportId() {
        List<Long> ids = jdbc.query("""
            select id
            from gtfs_schedule_imports
            where active = true
            order by imported_at desc
            limit 1
            """, (rs, rowNum) -> rs.getLong("id"));
        return ids.stream().findFirst();
    }

    public Optional<ActiveScheduleImport> findActiveImport() {
        List<ActiveScheduleImport> imports = jdbc.query("""
            select id,
                   source_name,
                   source_url,
                   imported_at,
                   service_start,
                   service_end
            from gtfs_schedule_imports
            where active = true
            order by imported_at desc
            limit 1
            """, (rs, rowNum) -> new ActiveScheduleImport(
                rs.getLong("id"),
                rs.getString("source_name"),
                rs.getString("source_url"),
                rs.getObject("imported_at", OffsetDateTime.class),
                rs.getObject("service_start", LocalDate.class),
                rs.getObject("service_end", LocalDate.class)
            ));
        return imports.stream().findFirst();
    }

    public List<String> findActiveServiceIds(long importId, LocalDate serviceDate) {
        return jdbc.query("""
            select service_id
            from gtfs_services
            where import_id = :importId
              and start_date <= :serviceDate
              and end_date >= :serviceDate
              and case extract(isodow from cast(:serviceDate as date))
                    when 1 then monday
                    when 2 then tuesday
                    when 3 then wednesday
                    when 4 then thursday
                    when 5 then friday
                    when 6 then saturday
                    when 7 then sunday
                  end = true
              and service_id not in (
                    select service_id
                    from gtfs_service_exceptions
                    where import_id = :importId
                      and service_date = :serviceDate
                      and exception_type = 2
              )
            union
            select service_id
            from gtfs_service_exceptions
            where import_id = :importId
              and service_date = :serviceDate
              and exception_type = 1
            order by service_id
            """, new MapSqlParameterSource(Map.of(
                "importId", importId,
                "serviceDate", serviceDate
            )), (rs, rowNum) -> rs.getString("service_id"));
    }

    public List<ScheduledDeparture> findUpcomingDepartures(
        long importId,
        String stationId,
        List<String> lineIds,
        List<String> activeServiceIds,
        int minDepartureSeconds,
        int maxDepartureSeconds,
        int limitPerDirection
    ) {
        if (lineIds.isEmpty() || activeServiceIds.isEmpty()) {
            return List.of();
        }
        return jdbc.query("""
            select route.line_id,
                   coalesce(nullif(trip.trip_headsign, ''), route.route_long_name) as direction,
                   stop_time.departure_seconds
            from gtfs_station_stops station_stop
            join gtfs_stop_times stop_time
              on stop_time.import_id = station_stop.import_id
             and stop_time.stop_id = station_stop.stop_id
            join gtfs_trips trip
              on trip.import_id = stop_time.import_id
             and trip.trip_id = stop_time.trip_id
            join gtfs_routes route
              on route.import_id = trip.import_id
             and route.route_id = trip.route_id
             and route.line_id = station_stop.line_id
            where station_stop.import_id = :importId
              and station_stop.station_id = :stationId
              and route.line_id in (:lineIds)
              and trip.service_id in (:activeServiceIds)
              and stop_time.departure_seconds >= :minDepartureSeconds
              and stop_time.departure_seconds <= :maxDepartureSeconds
            order by route.line_id asc, stop_time.departure_seconds asc
            """, new MapSqlParameterSource()
                .addValue("importId", importId)
                .addValue("stationId", stationId)
                .addValue("lineIds", lineIds)
                .addValue("activeServiceIds", activeServiceIds)
                .addValue("minDepartureSeconds", minDepartureSeconds)
                .addValue("maxDepartureSeconds", maxDepartureSeconds),
            (rs, rowNum) -> new ScheduledDeparture(
                rs.getString("line_id"),
                rs.getString("direction"),
                rs.getString("departure_seconds") != null ? rs.getInt("departure_seconds") : 0,
                null
            )).stream()
            .collect(java.util.stream.Collectors.groupingBy(
                departure -> new DepartureDirectionKey(departure.lineId(), departure.direction()),
                java.util.LinkedHashMap::new,
                java.util.stream.Collectors.toList()
            ))
            .values()
            .stream()
            .flatMap(rows -> rows.stream().limit(limitPerDirection))
            .toList();
    }

    private record DepartureDirectionKey(String lineId, String direction) {
    }

    public record ScheduledDeparture(String lineId, String direction, int departureSeconds, LocalDate serviceDate) {
        public ScheduledDeparture withServiceDate(LocalDate date) {
            return new ScheduledDeparture(lineId, direction, departureSeconds, date);
        }
    }

    public record ActiveScheduleImport(
        long id,
        String sourceName,
        String sourceUrl,
        OffsetDateTime importedAt,
        LocalDate serviceStart,
        LocalDate serviceEnd
    ) {}
}
