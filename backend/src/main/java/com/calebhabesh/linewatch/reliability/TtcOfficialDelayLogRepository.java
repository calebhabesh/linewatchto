package com.calebhabesh.linewatch.reliability;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

/**
 * Plan 17 A10 (D6): stores and queries Open Data Toronto TTC official subway delay incidents
 * ({@code ttc_official_delay_incidents}) strictly separate from LineWatchTO-observed minutes.
 */
@Repository
public class TtcOfficialDelayLogRepository {
    private static final int BATCH_SIZE = 1000;

    private final NamedParameterJdbcTemplate jdbc;

    public TtcOfficialDelayLogRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ImportMetadata> latestImport() {
        List<ImportMetadata> rows = jdbc.query("""
            select resource_url, resource_last_modified, min_date, max_date, row_count, imported_at
            from ttc_official_delay_imports
            order by imported_at desc, id desc
            limit 1
            """, (rs, row) -> new ImportMetadata(
                rs.getString("resource_url"),
                rs.getString("resource_last_modified"),
                rs.getObject("min_date", LocalDate.class),
                rs.getObject("max_date", LocalDate.class),
                rs.getInt("row_count"),
                rs.getObject("imported_at", OffsetDateTime.class)
            ));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    public int upsertIncidents(List<DelayIncidentRow> rows) {
        if (rows.isEmpty()) return 0;
        String sql = """
            insert into ttc_official_delay_incidents (
                source_row_id, incident_date, incident_time, day_of_week, line_id, raw_line,
                station_name, delay_code, delay_code_description, min_delay, min_gap,
                bound, vehicle, imported_at
            ) values (
                :sourceRowId, :incidentDate, :incidentTime, :dayOfWeek, :lineId, :rawLine,
                :stationName, :delayCode, :delayCodeDescription, :minDelay, :minGap,
                :bound, :vehicle, :importedAt
            )
            on conflict (incident_date, source_row_id) do update
            set incident_time = excluded.incident_time,
                day_of_week = excluded.day_of_week,
                line_id = excluded.line_id,
                raw_line = excluded.raw_line,
                station_name = excluded.station_name,
                delay_code = excluded.delay_code,
                delay_code_description = excluded.delay_code_description,
                min_delay = excluded.min_delay,
                min_gap = excluded.min_gap,
                bound = excluded.bound,
                vehicle = excluded.vehicle,
                imported_at = excluded.imported_at
            """;
        List<SqlParameterSource> batch = new ArrayList<>(rows.size());
        for (DelayIncidentRow r : rows) {
            batch.add(new MapSqlParameterSource()
                .addValue("sourceRowId", r.sourceRowId())
                .addValue("incidentDate", r.incidentDate())
                .addValue("incidentTime", r.incidentTime())
                .addValue("dayOfWeek", r.dayOfWeek())
                .addValue("lineId", r.lineId())
                .addValue("rawLine", r.rawLine())
                .addValue("stationName", r.stationName())
                .addValue("delayCode", r.delayCode())
                .addValue("delayCodeDescription", r.delayCodeDescription())
                .addValue("minDelay", r.minDelay())
                .addValue("minGap", r.minGap())
                .addValue("bound", r.bound())
                .addValue("vehicle", r.vehicle())
                .addValue("importedAt", r.importedAt()));
        }
        for (int start = 0; start < batch.size(); start += BATCH_SIZE) {
            jdbc.batchUpdate(sql, batch.subList(start, Math.min(start + BATCH_SIZE, batch.size()))
                .toArray(SqlParameterSource[]::new));
        }
        return rows.size();
    }

    public void recordImport(ImportMetadata meta) {
        jdbc.update("""
            insert into ttc_official_delay_imports (
                resource_url, resource_last_modified, min_date, max_date, row_count, imported_at
            ) values (
                :resourceUrl, :resourceLastModified, :minDate, :maxDate, :rowCount, :importedAt
            )
            """, new MapSqlParameterSource()
                .addValue("resourceUrl", meta.resourceUrl())
                .addValue("resourceLastModified", meta.resourceLastModified())
                .addValue("minDate", meta.minDate())
                .addValue("maxDate", meta.maxDate())
                .addValue("rowCount", meta.rowCount())
                .addValue("importedAt", meta.importedAt()));
    }

    public List<DailyAggregate> dailyAggregates(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = baseParams(from, to, lineId);
        return jdbc.query("""
            select incident_date, count(*)::integer incidents, coalesce(sum(min_delay), 0)::integer delay_minutes
            from ttc_official_delay_incidents
            where incident_date between :from and :to
              and min_delay > 0
            """ + lineFilter(lineId) + """
            group by incident_date
            order by incident_date
            """, params, (rs, row) -> new DailyAggregate(
                rs.getObject("incident_date", LocalDate.class),
                rs.getInt("incidents"),
                rs.getInt("delay_minutes")
            ));
    }

    public List<LineAggregate> lineAggregates(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = baseParams(from, to, lineId);
        return jdbc.query("""
            select line_id, count(*)::integer incidents, coalesce(sum(min_delay), 0)::integer delay_minutes
            from ttc_official_delay_incidents
            where incident_date between :from and :to
              and min_delay > 0
            """ + lineFilter(lineId) + """
            group by line_id
            order by delay_minutes desc, line_id asc
            """, params, (rs, row) -> new LineAggregate(
                rs.getString("line_id"),
                rs.getInt("incidents"),
                rs.getInt("delay_minutes")
            ));
    }

    public List<CodeAggregate> topCodes(LocalDate from, LocalDate to, String lineId, int limit) {
        MapSqlParameterSource params = baseParams(from, to, lineId).addValue("limit", limit);
        return jdbc.query("""
            select coalesce(delay_code, 'UNKNOWN') delay_code,
                   max(delay_code_description) description,
                   count(*)::integer incidents,
                   coalesce(sum(min_delay), 0)::integer delay_minutes
            from ttc_official_delay_incidents
            where incident_date between :from and :to
              and min_delay > 0
            """ + lineFilter(lineId) + """
            group by coalesce(delay_code, 'UNKNOWN')
            order by delay_minutes desc, incidents desc, delay_code asc
            limit :limit
            """, params, (rs, row) -> new CodeAggregate(
                rs.getString("delay_code"),
                rs.getString("description"),
                rs.getInt("incidents"),
                rs.getInt("delay_minutes")
            ));
    }

    public Integer medianDelayMinutes(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = baseParams(from, to, lineId);
        Double median = jdbc.queryForObject("""
            select percentile_cont(0.5) within group (order by min_delay)
            from ttc_official_delay_incidents
            where incident_date between :from and :to
              and min_delay > 0
            """ + lineFilter(lineId), params, Double.class);
        return median == null ? null : (int) Math.round(median);
    }

    private static MapSqlParameterSource baseParams(LocalDate from, LocalDate to, String lineId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("from", from)
            .addValue("to", to);
        if (lineId != null && !lineId.isBlank()) params.addValue("lineId", lineId);
        return params;
    }

    private static String lineFilter(String lineId) {
        return lineId != null && !lineId.isBlank() ? " and line_id = :lineId " : " ";
    }

    public record ImportMetadata(
        String resourceUrl,
        String resourceLastModified,
        LocalDate minDate,
        LocalDate maxDate,
        int rowCount,
        OffsetDateTime importedAt
    ) {}

    public record DelayIncidentRow(
        int sourceRowId,
        LocalDate incidentDate,
        String incidentTime,
        String dayOfWeek,
        String lineId,
        String rawLine,
        String stationName,
        String delayCode,
        String delayCodeDescription,
        int minDelay,
        int minGap,
        String bound,
        String vehicle,
        OffsetDateTime importedAt
    ) {}

    public record DailyAggregate(LocalDate date, int incidents, int delayMinutes) {}

    public record LineAggregate(String lineId, int incidents, int delayMinutes) {}

    public record CodeAggregate(String code, String description, int incidents, int delayMinutes) {}
}
