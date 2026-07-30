package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AlertHistoryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AlertHistoryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AlertHistoryRow> findLifecycleRows(
        OffsetDateTime since,
        OffsetDateTime until,
        int limit
    ) {
        return jdbc.query("""
            with classified as (
                select s.id,
                       s.alert_id,
                       s.source_id,
                       s.line_id,
                       l.number as line_number,
                       l.name as line_name,
                       s.title,
                       s.description,
                       s.snapshot_time,
                       s.active,
                       s.source_updated_at,
                       s.event_type,
                       s.source_alert_type,
                       s.impact_kind,
                       s.start_station_id,
                       s.end_station_id,
                       s.direction,
                       s.cause,
                       s.cause_description,
                       lag(s.active) over (
                           partition by s.alert_id
                           order by s.snapshot_time asc, s.id asc
                       ) as previous_active
                from snapshots s
                left join transit_lines l on l.id = s.line_id
            )
            select id, alert_id, source_id, line_id, line_number, line_name,
                   title, description, snapshot_time, active, source_updated_at,
                   event_type, source_alert_type, impact_kind, start_station_id,
                   end_station_id, direction, cause, cause_description,
                   case
                       when active = false then 'cleared'
                       when previous_active is null or previous_active = false then 'opened'
                       else 'updated'
                   end as lifecycle_state
            from classified
            where snapshot_time >= :since and snapshot_time < :until
            order by snapshot_time desc, id desc
            limit :limit
            """, new MapSqlParameterSource()
                .addValue("since", since)
                .addValue("until", until)
                .addValue("limit", limit),
            historyRowMapper());
    }

    public List<AlertHistoryRow> findRegionalLifecycleRows(
        OffsetDateTime since,
        OffsetDateTime until,
        int limit
    ) {
        return jdbc.query("""
            with classified as (
                select s.id,
                       s.alert_id,
                       a.source_id,
                       s.line_id,
                       s.title,
                       a.description,
                       s.snapshot_time,
                       s.active,
                       a.source_updated_at,
                       s.impact_kind,
                       case when jsonb_array_length(s.station_ids) > 0
                           then s.station_ids ->> 0 end as start_station_id,
                       case when jsonb_array_length(s.station_ids) > 0
                           then s.station_ids ->> (jsonb_array_length(s.station_ids) - 1) end as end_station_id,
                       a.cause,
                       a.source_system,
                       lag(s.active) over (
                           partition by s.alert_id
                           order by s.snapshot_time asc, s.id asc
                       ) as previous_active
                from regional_alert_snapshots s
                left join regional_alerts a on a.id = s.alert_id
            )
            select id, alert_id, source_id, line_id,
                   null::varchar as line_number, null::varchar as line_name,
                   title, description, snapshot_time, active, source_updated_at,
                   impact_kind as event_type, source_system as source_alert_type,
                   impact_kind, start_station_id, end_station_id,
                   null::varchar as direction, cause, null::varchar as cause_description,
                   case
                       when active = false then 'cleared'
                       when previous_active is null or previous_active = false then 'opened'
                       else 'updated'
                   end as lifecycle_state
            from classified
            where snapshot_time >= :since and snapshot_time < :until
            order by snapshot_time desc, id desc
            limit :limit
            """, new MapSqlParameterSource()
                .addValue("since", since)
                .addValue("until", until)
                .addValue("limit", limit),
            historyRowMapper());
    }

    private RowMapper<AlertHistoryRow> historyRowMapper() {
        return (rs, rowNum) -> new AlertHistoryRow(
            rs.getLong("id"),
            rs.getString("alert_id"),
            rs.getString("source_id"),
            rs.getString("line_id"),
            rs.getString("line_number"),
            rs.getString("line_name"),
            rs.getString("title"),
            rs.getString("description"),
            rs.getObject("snapshot_time", OffsetDateTime.class),
            rs.getBoolean("active"),
            rs.getObject("source_updated_at", OffsetDateTime.class),
            rs.getString("event_type"),
            rs.getString("source_alert_type"),
            rs.getString("impact_kind"),
            rs.getString("start_station_id"),
            rs.getString("end_station_id"),
            rs.getString("direction"),
            rs.getString("cause"),
            rs.getString("cause_description"),
            rs.getString("lifecycle_state")
        );
    }

    public Optional<OffsetDateTime> findLatestClearedSnapshotTime(String alertId) {
        if (alertId == null || alertId.isBlank()) {
            return Optional.empty();
        }
        List<OffsetDateTime> rows = jdbc.query("""
            select snapshot_time
            from snapshots
            where alert_id = :alertId and active = false
            order by snapshot_time desc, id desc
            limit 1
            """, new MapSqlParameterSource("alertId", alertId.trim()),
            (rs, rowNum) -> rs.getObject("snapshot_time", OffsetDateTime.class));
        return rows.stream().findFirst();
    }

    public Optional<OffsetDateTime> findLatestOpenedSnapshotTime(String alertId) {
        if (alertId == null || alertId.isBlank()) {
            return Optional.empty();
        }
        List<OffsetDateTime> rows = jdbc.query("""
            with classified as (
                select id,
                       snapshot_time,
                       active,
                       lag(active) over (
                           partition by alert_id
                           order by snapshot_time asc, id asc
                       ) as previous_active
                from snapshots
                where alert_id = :alertId
            )
            select snapshot_time
            from classified
            where active = true
              and (previous_active is null or previous_active = false)
            order by snapshot_time desc, id desc
            limit 1
            """, new MapSqlParameterSource("alertId", alertId.trim()),
            (rs, rowNum) -> rs.getObject("snapshot_time", OffsetDateTime.class));
        return rows.stream().findFirst();
    }

    public record AlertHistoryRow(
        Long id,
        String alertId,
        String sourceId,
        String lineId,
        String lineNumber,
        String lineName,
        String title,
        String description,
        OffsetDateTime snapshotTime,
        boolean active,
        OffsetDateTime sourceUpdatedAt,
        String eventType,
        String sourceAlertType,
        String impactKind,
        String startStationId,
        String endStationId,
        String direction,
        String cause,
        String causeDescription,
        String lifecycleState
    ) {}
}
