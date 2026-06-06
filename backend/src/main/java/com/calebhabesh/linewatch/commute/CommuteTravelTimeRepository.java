package com.calebhabesh.linewatch.commute;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CommuteTravelTimeRepository {
    public static final String GTFS_SOURCE = "gtfs-scheduled-median";

    private final NamedParameterJdbcTemplate jdbc;

    public CommuteTravelTimeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, SegmentTravelTime> findActiveScheduledSegmentWeights() {
        List<SegmentTravelTime> rows = jdbc.query("""
            with active_import as (
                select id
                from gtfs_schedule_imports
                where active = true
                order by imported_at desc
                limit 1
            ),
            station_times as (
                select route.line_id,
                       station_stop.station_id,
                       stop_time.trip_id,
                       stop_time.stop_sequence,
                       stop_time.arrival_seconds,
                       stop_time.departure_seconds
                from active_import
                join gtfs_station_stops station_stop
                  on station_stop.import_id = active_import.id
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
            ),
            adjacent as (
                select current_time.line_id,
                       current_time.station_id as station_a_id,
                       next_time.station_id as station_b_id,
                       next_time.arrival_seconds - current_time.departure_seconds as travel_seconds
                from station_times current_time
                join station_times next_time
                  on next_time.line_id = current_time.line_id
                 and next_time.trip_id = current_time.trip_id
                 and next_time.stop_sequence = current_time.stop_sequence + 1
                where current_time.station_id <> next_time.station_id
                  and next_time.arrival_seconds - current_time.departure_seconds between 30 and 900
            ),
            matched as (
                select segment.id as segment_id,
                       adjacent.travel_seconds
                from adjacent
                join line_segments segment
                  on segment.line_id = adjacent.line_id
                 and (
                    (
                        segment.station_a_id = adjacent.station_a_id
                        and segment.station_b_id = adjacent.station_b_id
                    )
                    or
                    (
                        segment.station_a_id = adjacent.station_b_id
                        and segment.station_b_id = adjacent.station_a_id
                    )
                 )
            )
            select segment_id,
                   round(percentile_cont(0.5) within group (order by travel_seconds))::integer as travel_seconds,
                   count(*)::integer as sample_count
            from matched
            group by segment_id
            order by segment_id
            """, Map.of(), (rs, rowNum) -> new SegmentTravelTime(
                rs.getString("segment_id"),
                rs.getInt("travel_seconds"),
                rs.getInt("sample_count"),
                GTFS_SOURCE
            ));

        return rows.stream().collect(Collectors.toMap(
            SegmentTravelTime::segmentId,
            row -> row,
            (left, right) -> left,
            java.util.LinkedHashMap::new
        ));
    }

    public record SegmentTravelTime(
        String segmentId,
        int travelSeconds,
        int sampleCount,
        String source
    ) {}
}
