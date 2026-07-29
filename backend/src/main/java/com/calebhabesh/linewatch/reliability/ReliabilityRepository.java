package com.calebhabesh.linewatch.reliability;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReliabilityRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public ReliabilityRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public OffsetDateTime firstSnapshot(String networkId) {
        String table = "regional".equals(networkId) ? "regional_alert_snapshots" : "snapshots";
        return jdbc.query("select min(snapshot_time) as first_snapshot from " + table,
            new MapSqlParameterSource(),
            rs -> rs.next() ? rs.getObject("first_snapshot", OffsetDateTime.class) : null);
    }

    public List<AggregateRow> aggregateLines(String networkId, OffsetDateTime since, OffsetDateTime until) {
        return "regional".equals(networkId)
            ? regionalLines(since, until)
            : ttcLines(since, until);
    }

    public List<AggregateRow> aggregateStation(
        String networkId, String stationId, OffsetDateTime since, OffsetDateTime until
    ) {
        return "regional".equals(networkId)
            ? regionalStation(stationId, since, until)
            : ttcStation(stationId, since, until);
    }

    private List<AggregateRow> ttcLines(OffsetDateTime since, OffsetDateTime until) {
        return query("""
            with lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from snapshots s
                where s.line_id is not null and s.snapshot_time < :until
            ), episodes as (
                select o.alert_id, o.line_id, o.snapshot_time opened_at,
                       (select min(c.snapshot_time) from lifecycle c
                        where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at
                from lifecycle o
                where o.active = true and (o.previous_active is null or o.previous_active = false)
            )
            select l.id, l.number, l.name,
                   count(e.alert_id) filter (where coalesce(e.cleared_at, :until) >= :since) incidents,
                   count(e.alert_id) filter (where e.cleared_at is null and e.opened_at < :until) active_incidents,
                   percentile_cont(0.5) within group (
                       order by extract(epoch from (e.cleared_at - e.opened_at)) / 60
                   ) filter (where e.cleared_at is not null and e.cleared_at >= :since) median_minutes,
                   coalesce(sum(greatest(0, extract(epoch from (
                       least(coalesce(e.cleared_at, :until), :until) - greatest(e.opened_at, :since)
                   )) / 60)) filter (where coalesce(e.cleared_at, :until) >= :since and e.opened_at < :until), 0) disruption_minutes
            from transit_lines l
            left join episodes e on e.line_id = l.id
            where l.id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6')
            group by l.id, l.number, l.name
            order by l.number
            """, since, until);
    }

    private List<AggregateRow> regionalLines(OffsetDateTime since, OffsetDateTime until) {
        return query("""
            with lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from regional_alert_snapshots s where s.snapshot_time < :until
            ), episodes as (
                select o.alert_id, o.line_id, o.snapshot_time opened_at,
                       (select min(c.snapshot_time) from lifecycle c
                        where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at
                from lifecycle o where o.active = true and (o.previous_active is null or o.previous_active = false)
            )
            select line_id id, '' number, '' label,
                   count(*) filter (where coalesce(cleared_at, :until) >= :since) incidents,
                   count(*) filter (where cleared_at is null and opened_at < :until) active_incidents,
                   percentile_cont(0.5) within group (
                       order by extract(epoch from (cleared_at - opened_at)) / 60
                   ) filter (where cleared_at is not null and cleared_at >= :since) median_minutes,
                   coalesce(sum(greatest(0, extract(epoch from (
                       least(coalesce(cleared_at, :until), :until) - greatest(opened_at, :since)
                   )) / 60)) filter (where coalesce(cleared_at, :until) >= :since and opened_at < :until), 0) disruption_minutes
            from episodes group by line_id order by line_id
            """, since, until);
    }

    private List<AggregateRow> ttcStation(String stationId, OffsetDateTime since, OffsetDateTime until) {
        return query("""
            with filtered as (
                select s.* from snapshots s
                where (s.start_station_id = :stationId or s.end_station_id = :stationId)
            ), lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from filtered s where s.snapshot_time < :until
            ), episodes as (
                select o.alert_id, o.line_id, o.snapshot_time opened_at,
                       (select min(c.snapshot_time) from lifecycle c
                        where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at
                from lifecycle o where o.active = true and (o.previous_active is null or o.previous_active = false)
            )
            select l.id, l.number, l.name,
                   count(e.alert_id) filter (where coalesce(e.cleared_at, :until) >= :since) incidents,
                   count(e.alert_id) filter (where e.cleared_at is null) active_incidents,
                   percentile_cont(0.5) within group (order by extract(epoch from (e.cleared_at-e.opened_at))/60)
                       filter (where e.cleared_at is not null and e.cleared_at >= :since) median_minutes,
                   coalesce(sum(greatest(0, extract(epoch from (
                       least(coalesce(e.cleared_at, :until), :until)-greatest(e.opened_at, :since)
                   ))/60)) filter (where coalesce(e.cleared_at, :until) >= :since), 0) disruption_minutes
            from transit_lines l join episodes e on e.line_id = l.id
            group by l.id, l.number, l.name order by l.number
            """, stationId, since, until);
    }

    private List<AggregateRow> regionalStation(String stationId, OffsetDateTime since, OffsetDateTime until) {
        return query("""
            with filtered as (
                select s.* from regional_alert_snapshots s
                where s.station_ids ? :stationId
            ), lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from filtered s where s.snapshot_time < :until
            ), episodes as (
                select o.alert_id, o.line_id, o.snapshot_time opened_at,
                       (select min(c.snapshot_time) from lifecycle c
                        where c.alert_id=o.alert_id and c.snapshot_time>o.snapshot_time and c.active=false) cleared_at
                from lifecycle o where o.active=true and (o.previous_active is null or o.previous_active=false)
            )
            select line_id id, '' number, '' label,
                   count(*) filter (where coalesce(cleared_at,:until)>=:since) incidents,
                   count(*) filter (where cleared_at is null) active_incidents,
                   percentile_cont(0.5) within group (order by extract(epoch from (cleared_at-opened_at))/60)
                       filter (where cleared_at is not null and cleared_at>=:since) median_minutes,
                   coalesce(sum(greatest(0,extract(epoch from (
                       least(coalesce(cleared_at,:until),:until)-greatest(opened_at,:since)
                   ))/60)) filter (where coalesce(cleared_at,:until)>=:since),0) disruption_minutes
            from episodes group by line_id order by line_id
            """, stationId, since, until);
    }

    private List<AggregateRow> query(String sql, OffsetDateTime since, OffsetDateTime until) {
        return query(sql, null, since, until);
    }

    private List<AggregateRow> query(
        String sql, String stationId, OffsetDateTime since, OffsetDateTime until
    ) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("since", since).addValue("until", until);
        if (stationId != null) parameters.addValue("stationId", stationId);
        return jdbc.query(sql, parameters, (rs, row) -> new AggregateRow(
            rs.getString("id"), rs.getString("number"), rs.getString("label"),
            rs.getLong("incidents"), rs.getLong("active_incidents"),
            rs.getObject("median_minutes") == null ? null : Math.round(rs.getDouble("median_minutes")),
            Math.round(rs.getDouble("disruption_minutes"))
        ));
    }

    public record AggregateRow(
        String id, String number, String label, long incidents, long activeIncidents,
        Long medianDurationMinutes, long observedDisruptionMinutes
    ) {}
}
