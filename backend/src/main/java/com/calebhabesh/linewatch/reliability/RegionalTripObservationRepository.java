package com.calebhabesh.linewatch.reliability;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/**
 * Plan 17 A10 (D5): persists derived GO/UP per-trip-day observations and reads preserved
 * daily scheduled trip counts for honest on-time performance and coverage reporting.
 */
@Repository
public class RegionalTripObservationRepository {
    private static final int BATCH_SIZE = 1000;

    private final NamedParameterJdbcTemplate jdbc;

    public RegionalTripObservationRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Scheduled trips running on {@code serviceDate} for {@code sourceSystem}'s active GTFS import,
     * with each trip's line, trip number, and final (terminal) stop station + scheduled time.
     */
    public List<ScheduledTripMeta> activeScheduledTrips(String sourceSystem, LocalDate serviceDate) {
        return jdbc.query("""
            with active_import as (
                select id from regional_gtfs_schedule_imports
                where source_system = :sourceSystem and active = true
                order by imported_at desc, id desc
                limit 1
            ), active_services as (
                select service.import_id, service.service_id
                from active_import imp
                join regional_gtfs_services service on service.import_id = imp.id
                where service.start_date <= :serviceDate and service.end_date >= :serviceDate
                  and case extract(isodow from cast(:serviceDate as date))
                    when 1 then service.monday when 2 then service.tuesday
                    when 3 then service.wednesday when 4 then service.thursday
                    when 5 then service.friday when 6 then service.saturday
                    when 7 then service.sunday end
                  and not exists (
                    select 1 from regional_gtfs_service_exceptions ex
                    where ex.import_id = service.import_id
                      and ex.service_id = service.service_id
                      and ex.service_date = :serviceDate
                      and ex.exception_type = 2
                  )
                union
                select ex.import_id, ex.service_id
                from active_import imp
                join regional_gtfs_service_exceptions ex on ex.import_id = imp.id
                where ex.service_date = :serviceDate and ex.exception_type = 1
            ), terminal_stops as (
                select distinct on (d.trip_id)
                       d.trip_id, d.line_id, d.trip_short_name,
                       d.station_id terminal_station_id,
                       d.departure_seconds terminal_seconds
                from active_services s
                join regional_gtfs_departures d
                  on d.import_id = s.import_id and d.service_id = s.service_id
                order by d.trip_id, d.stop_sequence desc nulls last, d.departure_seconds desc
            )
            select trip_id, line_id, trip_short_name, terminal_station_id, terminal_seconds
            from terminal_stops
            """, new MapSqlParameterSource()
                .addValue("sourceSystem", sourceSystem)
                .addValue("serviceDate", serviceDate),
            (rs, row) -> new ScheduledTripMeta(
                rs.getString("trip_id"),
                rs.getString("line_id"),
                rs.getString("trip_short_name"),
                rs.getString("terminal_station_id"),
                rs.getInt("terminal_seconds")
            ));
    }

    public int upsertObservations(List<TripObservationRow> rows) {
        if (rows.isEmpty()) return 0;
        String sql = """
            insert into regional_trip_observations (
                source_system, service_date, trip_id, trip_number, line_id,
                first_seen_at, last_seen_at, latest_delay_seconds,
                terminal_arrival_delay_seconds, observed_stop_count, cancelled, updated_at
            ) values (
                :sourceSystem, :serviceDate, :tripId, :tripNumber, :lineId,
                :firstSeenAt, :lastSeenAt, :latestDelaySeconds,
                :terminalArrivalDelaySeconds, :observedStopCount, :cancelled, :updatedAt
            )
            on conflict (source_system, service_date, trip_id) do update
            set trip_number = coalesce(excluded.trip_number, regional_trip_observations.trip_number),
                first_seen_at = least(regional_trip_observations.first_seen_at, excluded.first_seen_at),
                last_seen_at = greatest(regional_trip_observations.last_seen_at, excluded.last_seen_at),
                latest_delay_seconds = coalesce(excluded.latest_delay_seconds, regional_trip_observations.latest_delay_seconds),
                terminal_arrival_delay_seconds = coalesce(excluded.terminal_arrival_delay_seconds, regional_trip_observations.terminal_arrival_delay_seconds),
                observed_stop_count = greatest(regional_trip_observations.observed_stop_count, excluded.observed_stop_count),
                cancelled = regional_trip_observations.cancelled or excluded.cancelled,
                updated_at = excluded.updated_at
            """;
        List<SqlParameterSource> batch = new ArrayList<>(rows.size());
        for (TripObservationRow r : rows) {
            batch.add(new MapSqlParameterSource()
                .addValue("sourceSystem", r.sourceSystem())
                .addValue("serviceDate", r.serviceDate())
                .addValue("tripId", r.tripId())
                .addValue("tripNumber", r.tripNumber())
                .addValue("lineId", r.lineId())
                .addValue("firstSeenAt", r.firstSeenAt())
                .addValue("lastSeenAt", r.lastSeenAt())
                .addValue("latestDelaySeconds", r.latestDelaySeconds())
                .addValue("terminalArrivalDelaySeconds", r.terminalArrivalDelaySeconds())
                .addValue("observedStopCount", r.observedStopCount())
                .addValue("cancelled", r.cancelled())
                .addValue("updatedAt", r.updatedAt()));
        }
        for (int start = 0; start < batch.size(); start += BATCH_SIZE) {
            jdbc.batchUpdate(sql, batch.subList(start, Math.min(start + BATCH_SIZE, batch.size()))
                .toArray(SqlParameterSource[]::new));
        }
        return rows.size();
    }

    public List<ScheduledCountRow> scheduledCounts(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("from", from)
            .addValue("to", to);
        String filter = "";
        if (lineId != null && !lineId.isBlank()) {
            filter = " and line_id = :lineId ";
            params.addValue("lineId", lineId);
        }
        return jdbc.query("""
            select service_date, line_id, sum(scheduled_trips)::integer scheduled_trips
            from regional_scheduled_trip_counts
            where service_date between :from and :to
            """ + filter + """
            group by service_date, line_id
            order by service_date, line_id
            """, params, (rs, row) -> new ScheduledCountRow(
                rs.getObject("service_date", LocalDate.class),
                rs.getString("line_id"),
                rs.getInt("scheduled_trips")
            ));
    }

    public List<ObservationSummaryRow> observationRows(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("from", from)
            .addValue("to", to);
        String filter = "";
        if (lineId != null && !lineId.isBlank()) {
            filter = " and line_id = :lineId ";
            params.addValue("lineId", lineId);
        }
        return jdbc.query("""
            select service_date, line_id, latest_delay_seconds, terminal_arrival_delay_seconds, cancelled
            from regional_trip_observations
            where service_date between :from and :to
            """ + filter + """
            order by service_date, line_id
            """, params, (rs, row) -> new ObservationSummaryRow(
                rs.getObject("service_date", LocalDate.class),
                rs.getString("line_id"),
                rs.getObject("latest_delay_seconds", Integer.class),
                rs.getObject("terminal_arrival_delay_seconds", Integer.class),
                rs.getBoolean("cancelled")
            ));
    }

    public static Map<String, ScheduledTripMeta> indexByTripId(List<ScheduledTripMeta> trips) {
        Map<String, ScheduledTripMeta> map = new HashMap<>();
        for (ScheduledTripMeta meta : trips) {
            if (meta.tripId() == null) continue;
            String normalized = meta.tripId().trim().toLowerCase(Locale.CANADA);
            map.putIfAbsent(normalized, meta);
            String stripped = normalized.replaceFirst("^\\d{8}[-_]", "");
            if (!stripped.equals(normalized)) {
                map.putIfAbsent(stripped, meta);
            }
        }
        return map;
    }

    public record ScheduledTripMeta(
        String tripId,
        String lineId,
        String tripNumber,
        String terminalStationId,
        int terminalSeconds
    ) {}

    public record TripObservationRow(
        String sourceSystem,
        LocalDate serviceDate,
        String tripId,
        String tripNumber,
        String lineId,
        OffsetDateTime firstSeenAt,
        OffsetDateTime lastSeenAt,
        Integer latestDelaySeconds,
        Integer terminalArrivalDelaySeconds,
        int observedStopCount,
        boolean cancelled,
        OffsetDateTime updatedAt
    ) {}

    public record ScheduledCountRow(LocalDate serviceDate, String lineId, int scheduledTrips) {}

    public record ObservationSummaryRow(
        LocalDate serviceDate,
        String lineId,
        Integer latestDelaySeconds,
        Integer terminalArrivalDelaySeconds,
        boolean cancelled
    ) {}
}
