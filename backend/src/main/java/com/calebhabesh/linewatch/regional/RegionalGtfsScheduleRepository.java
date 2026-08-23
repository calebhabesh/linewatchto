package com.calebhabesh.linewatch.regional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class RegionalGtfsScheduleRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public RegionalGtfsScheduleRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public long replace(RegionalGtfsScheduleImport schedule, OffsetDateTime importedAt) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update("""
            insert into regional_gtfs_schedule_imports (
                source_system, source_url, imported_at, service_start, service_end, active
            ) values (
                :sourceSystem, :sourceUrl, :importedAt, :serviceStart, :serviceEnd, false
            )
            """, new MapSqlParameterSource()
            .addValue("sourceSystem", schedule.sourceSystem())
            .addValue("sourceUrl", schedule.sourceUrl())
            .addValue("importedAt", importedAt)
            .addValue("serviceStart", schedule.serviceStart())
            .addValue("serviceEnd", schedule.serviceEnd()), keys, new String[]{"id"});
        Number key = keys.getKey();
        if (key == null) throw new IllegalStateException("Failed to create regional GTFS import");
        long importId = key.longValue();

        batch("""
            insert into regional_gtfs_services (
                import_id, service_id, monday, tuesday, wednesday, thursday, friday,
                saturday, sunday, start_date, end_date
            ) values (
                :importId, :serviceId, :monday, :tuesday, :wednesday, :thursday, :friday,
                :saturday, :sunday, :startDate, :endDate
            )
            """, schedule.services().stream().map(row -> new MapSqlParameterSource()
            .addValue("importId", importId).addValue("serviceId", row.serviceId())
            .addValue("monday", row.monday()).addValue("tuesday", row.tuesday())
            .addValue("wednesday", row.wednesday()).addValue("thursday", row.thursday())
            .addValue("friday", row.friday()).addValue("saturday", row.saturday())
            .addValue("sunday", row.sunday()).addValue("startDate", row.startDate())
            .addValue("endDate", row.endDate())).toList());
        batch("""
            insert into regional_gtfs_service_exceptions (
                import_id, service_id, service_date, exception_type
            ) values (:importId, :serviceId, :serviceDate, :exceptionType)
            """, schedule.exceptions().stream().map(row -> new MapSqlParameterSource()
            .addValue("importId", importId).addValue("serviceId", row.serviceId())
            .addValue("serviceDate", row.serviceDate()).addValue("exceptionType", row.exceptionType())).toList());

        for (int start = 0; start < schedule.departures().size(); start += 1000) {
            List<RegionalGtfsScheduleImport.Departure> rows =
                schedule.departures().subList(start, Math.min(start + 1000, schedule.departures().size()));
            batch("""
                insert into regional_gtfs_departures (
                    import_id, station_id, line_id, service_id, trip_id, trip_short_name, direction,
                    departure_seconds, platform, stop_sequence
                ) values (
                    :importId, :stationId, :lineId, :serviceId, :tripId, :tripShortName, :direction,
                    :departureSeconds, :platform, :stopSequence
                ) on conflict do nothing
                """, rows.stream().map(row -> new MapSqlParameterSource()
                .addValue("importId", importId).addValue("stationId", row.stationId())
                .addValue("lineId", row.lineId()).addValue("serviceId", row.serviceId())
                .addValue("tripId", row.tripId()).addValue("tripShortName", row.tripShortName())
                .addValue("direction", row.direction())
                .addValue("departureSeconds", row.departureSeconds())
                .addValue("platform", row.platform()).addValue("stopSequence", row.stopSequence())).toList());
        }

        jdbc.update("""
            update regional_gtfs_schedule_imports
            set active = false
            where source_system = :sourceSystem and active = true
            """, Map.of("sourceSystem", schedule.sourceSystem()));
        jdbc.update("update regional_gtfs_schedule_imports set active = true where id = :id", Map.of("id", importId));
        jdbc.update("""
            delete from regional_gtfs_schedule_imports
            where source_system = :sourceSystem
              and active = false
              and id not in (
                  select id
                  from regional_gtfs_schedule_imports
                  where source_system = :sourceSystem and active = false
                  order by imported_at desc, id desc
                  limit 1
              )
            """, Map.of("sourceSystem", schedule.sourceSystem()));
        jdbc.getJdbcTemplate().execute("""
            analyze regional_gtfs_schedule_imports, regional_gtfs_services,
                    regional_gtfs_service_exceptions, regional_gtfs_departures
            """);
        return importId;
    }

    public List<ScheduledDeparture> upcoming(
        String stationId,
        List<String> lineIds,
        LocalDate serviceDate,
        int minimumSeconds,
        int maximumSeconds
    ) {
        if (lineIds.isEmpty()) return List.of();
        return jdbc.query("""
            with active_services as (
                select service.import_id, service.service_id
                from regional_gtfs_services service
                where service.start_date <= :serviceDate
                  and service.end_date >= :serviceDate
                  and case extract(isodow from cast(:serviceDate as date))
                        when 1 then service.monday when 2 then service.tuesday
                        when 3 then service.wednesday when 4 then service.thursday
                        when 5 then service.friday when 6 then service.saturday
                        when 7 then service.sunday end = true
                  and not exists (
                      select 1 from regional_gtfs_service_exceptions service_exception
                      where service_exception.import_id = service.import_id
                        and service_exception.service_id = service.service_id
                        and service_exception.service_date = :serviceDate
                        and service_exception.exception_type = 2
                  )
                union
                select service_exception.import_id, service_exception.service_id
                from regional_gtfs_service_exceptions service_exception
                where service_exception.service_date = :serviceDate
                  and service_exception.exception_type = 1
            )
            select departure.line_id, departure.direction, departure.departure_seconds,
                   departure.platform, departure.trip_id, import.imported_at
            from regional_gtfs_departures departure
            join regional_gtfs_schedule_imports import on import.id = departure.import_id
            where import.active = true
              and import.service_start <= :serviceDate
              and import.service_end >= :serviceDate
              and departure.station_id = :stationId
              and departure.line_id in (:lineIds)
              and exists (
                  select 1 from active_services active_service
                  where active_service.import_id = departure.import_id
                    and active_service.service_id = departure.service_id
              )
              and departure.departure_seconds between :minimumSeconds and :maximumSeconds
            order by departure.departure_seconds, departure.line_id, departure.trip_id
            """, new MapSqlParameterSource()
            .addValue("stationId", stationId).addValue("lineIds", lineIds)
            .addValue("serviceDate", serviceDate).addValue("minimumSeconds", minimumSeconds)
            .addValue("maximumSeconds", maximumSeconds),
            (rs, row) -> new ScheduledDeparture(
                rs.getString("line_id"), rs.getString("direction"),
                rs.getInt("departure_seconds"), rs.getString("platform"),
                rs.getString("trip_id"), serviceDate,
                rs.getObject("imported_at", OffsetDateTime.class)
            ));
    }

    public List<Coverage> activeCoverage() {
        return jdbc.query("""
            select departure.line_id, departure.station_id, count(*) as departure_count
            from regional_gtfs_departures departure
            join regional_gtfs_schedule_imports import on import.id = departure.import_id and import.active = true
            group by departure.line_id, departure.station_id
            order by departure.line_id, departure.station_id
            """, (rs, row) -> new Coverage(
                rs.getString("line_id"), rs.getString("station_id"), rs.getLong("departure_count")
            ));
    }

    public List<MatchedDeparture> findActiveTrip(String identity, LocalDate serviceDate) {
        if (identity == null || identity.isBlank() || serviceDate == null) return List.of();
        return jdbc.query("""
            with active_services as (
                select service.import_id, service.service_id
                from regional_gtfs_services service
                where service.start_date <= :serviceDate
                  and service.end_date >= :serviceDate
                  and case extract(isodow from cast(:serviceDate as date))
                        when 1 then service.monday when 2 then service.tuesday
                        when 3 then service.wednesday when 4 then service.thursday
                        when 5 then service.friday when 6 then service.saturday
                        when 7 then service.sunday end = true
                  and not exists (
                      select 1 from regional_gtfs_service_exceptions service_exception
                      where service_exception.import_id = service.import_id
                        and service_exception.service_id = service.service_id
                        and service_exception.service_date = :serviceDate
                        and service_exception.exception_type = 2
                  )
                union
                select service_exception.import_id, service_exception.service_id
                from regional_gtfs_service_exceptions service_exception
                where service_exception.service_date = :serviceDate
                  and service_exception.exception_type = 1
            )
            select departure.line_id, departure.direction, departure.trip_id,
                   departure.trip_short_name, departure.station_id, departure.stop_sequence,
                   departure.departure_seconds, departure.platform
            from regional_gtfs_departures departure
            join regional_gtfs_schedule_imports import
              on import.id = departure.import_id and import.active = true and import.source_system = 'go'
            where (departure.trip_id = :identity
                   or departure.trip_short_name = :identity
                   or departure.trip_id like '%-' || :identity
                   or departure.trip_id like '%_' || :identity)
              and exists (
                  select 1 from active_services active_service
                  where active_service.import_id = departure.import_id
                    and active_service.service_id = departure.service_id
              )
            order by departure.trip_id, departure.stop_sequence nulls last, departure.departure_seconds
            """, new MapSqlParameterSource("identity", identity).addValue("serviceDate", serviceDate),
            (rs, row) -> new MatchedDeparture(
                rs.getString("line_id"), rs.getString("direction"), rs.getString("trip_id"),
                rs.getString("trip_short_name"), rs.getString("station_id"),
                rs.getObject("stop_sequence", Integer.class), rs.getInt("departure_seconds"),
                rs.getString("platform"), serviceDate
            ));
    }

    public Optional<ActiveImport> activeImport(String sourceSystem) {
        return jdbc.query("""
            select id, source_system, source_url, imported_at, service_start, service_end
            from regional_gtfs_schedule_imports
            where source_system = :sourceSystem and active = true
            order by imported_at desc limit 1
            """, Map.of("sourceSystem", sourceSystem), (rs, row) -> new ActiveImport(
            rs.getLong("id"), rs.getString("source_system"), rs.getString("source_url"),
            rs.getObject("imported_at", OffsetDateTime.class),
            rs.getObject("service_start", LocalDate.class), rs.getObject("service_end", LocalDate.class)
        )).stream().findFirst();
    }

    private void batch(String sql, List<MapSqlParameterSource> rows) {
        if (!rows.isEmpty()) jdbc.batchUpdate(sql, rows.toArray(SqlParameterSource[]::new));
    }

    public record ScheduledDeparture(
        String lineId, String direction, int departureSeconds, String platform,
        String tripId, LocalDate serviceDate, OffsetDateTime importedAt
    ) {}
    public record Coverage(String lineId, String stationId, long departureCount) {}
    public record MatchedDeparture(
        String lineId, String direction, String tripId, String tripShortName,
        String stationId, Integer stopSequence, int departureSeconds, String platform,
        LocalDate serviceDate
    ) {}
    public record ActiveImport(
        long id, String sourceSystem, String sourceUrl, OffsetDateTime importedAt,
        LocalDate serviceStart, LocalDate serviceEnd
    ) {}
}
