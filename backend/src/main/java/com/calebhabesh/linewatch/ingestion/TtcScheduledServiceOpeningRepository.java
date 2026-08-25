package com.calebhabesh.linewatch.ingestion;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcScheduledServiceOpeningRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcScheduledServiceOpeningRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Integer> firstDepartureSeconds(
        String lineId,
        LocalDate serviceDate,
        List<String> stationIds
    ) {
        List<String> scopedStationIds = stationIds == null
            ? List.of()
            : stationIds.stream().filter(value -> value != null && !value.isBlank()).distinct().toList();
        String stationFilter = scopedStationIds.isEmpty() ? "" : """
              and exists (
                  select 1
                  from gtfs_station_stops mapping
                  where mapping.import_id = stop_time.import_id
                    and mapping.stop_id = stop_time.stop_id
                    and mapping.line_id = :lineId
                    and mapping.station_id in (:stationIds)
              )
            """;
        MapSqlParameterSource params = new MapSqlParameterSource(Map.of(
            "lineId", lineId,
            "serviceDate", serviceDate
        ));
        if (!scopedStationIds.isEmpty()) {
            params.addValue("stationIds", scopedStationIds);
        }

        List<Integer> values = jdbc.query("""
            with selected_import as (
                select schedule_import.id
                from gtfs_schedule_imports schedule_import
                where schedule_import.service_start <= :serviceDate
                  and schedule_import.service_end >= :serviceDate
                order by schedule_import.active desc,
                         schedule_import.imported_at desc,
                         schedule_import.id desc
                limit 1
            ), active_services as (
                select service.import_id, service.service_id
                from selected_import selected
                join gtfs_services service on service.import_id = selected.id
                where service.start_date <= :serviceDate
                  and service.end_date >= :serviceDate
                  and case extract(isodow from cast(:serviceDate as date))
                    when 1 then service.monday
                    when 2 then service.tuesday
                    when 3 then service.wednesday
                    when 4 then service.thursday
                    when 5 then service.friday
                    when 6 then service.saturday
                    when 7 then service.sunday
                end
                  and not exists (
                      select 1
                      from gtfs_service_exceptions service_exception
                      where service_exception.import_id = service.import_id
                        and service_exception.service_id = service.service_id
                        and service_exception.service_date = :serviceDate
                        and service_exception.exception_type = 2
                  )
                union
                select service_exception.import_id, service_exception.service_id
                from selected_import selected
                join gtfs_service_exceptions service_exception
                  on service_exception.import_id = selected.id
                where service_exception.service_date = :serviceDate
                  and service_exception.exception_type = 1
            )
            select min(stop_time.departure_seconds) first_departure_seconds
            from active_services active
            join gtfs_trips trip
              on trip.import_id = active.import_id
             and trip.service_id = active.service_id
            join gtfs_routes route
              on route.import_id = trip.import_id
             and route.route_id = trip.route_id
             and route.line_id = :lineId
            join gtfs_stop_times stop_time
              on stop_time.import_id = trip.import_id
             and stop_time.trip_id = trip.trip_id
            """ + stationFilter, params, (rs, rowNum) -> {
                Number value = (Number) rs.getObject("first_departure_seconds");
                return value == null ? null : value.intValue();
            });
        return values.stream().filter(java.util.Objects::nonNull).findFirst();
    }
}
