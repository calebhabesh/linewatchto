package com.calebhabesh.linewatch.reliability;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
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

    public List<BreakdownRow> aggregateBreakdown(String networkId, OffsetDateTime since, OffsetDateTime until) {
        return "regional".equals(networkId)
            ? regionalBreakdown(since, until)
            : ttcBreakdown(since, until);
    }

    private List<AggregateRow> ttcLines(OffsetDateTime since, OffsetDateTime until) {
        List<TransitLineRecord> lines = fetchTransitLines();
        List<EvaluatedEpisode> episodes = fetchEvaluatedTtcEpisodes(since, until);

        Map<String, List<EvaluatedEpisode>> byLine = episodes.stream()
            .filter(e -> e.lineId() != null)
            .collect(Collectors.groupingBy(EvaluatedEpisode::lineId));

        return lines.stream()
            .map(line -> {
                List<EvaluatedEpisode> lineEpisodes = byLine.getOrDefault(line.id(), List.of());
                long incidents = lineEpisodes.size();
                long activeIncidents = lineEpisodes.stream().filter(EvaluatedEpisode::isActive).count();
                long disruptionMinutes = lineEpisodes.stream().mapToLong(EvaluatedEpisode::operatingDisruptionMinutes).sum();
                List<Long> durations = lineEpisodes.stream()
                    .map(EvaluatedEpisode::durationMinutes)
                    .filter(Objects::nonNull)
                    .toList();
                Long medianMinutes = computeMedian(durations);
                return new AggregateRow(line.id(), line.number(), line.name(), incidents, activeIncidents, medianMinutes, disruptionMinutes);
            })
            .toList();
    }

    private List<AggregateRow> ttcStation(String stationId, OffsetDateTime since, OffsetDateTime until) {
        List<TransitLineRecord> lines = fetchTransitLines();
        List<EvaluatedEpisode> episodes = fetchEvaluatedTtcEpisodes(since, until).stream()
            .filter(e -> stationId.equals(e.startStationId()) || stationId.equals(e.endStationId()))
            .toList();

        Map<String, List<EvaluatedEpisode>> byLine = episodes.stream()
            .filter(e -> e.lineId() != null)
            .collect(Collectors.groupingBy(EvaluatedEpisode::lineId));

        return lines.stream()
            .filter(line -> byLine.containsKey(line.id()))
            .map(line -> {
                List<EvaluatedEpisode> lineEpisodes = byLine.getOrDefault(line.id(), List.of());
                long incidents = lineEpisodes.size();
                long activeIncidents = lineEpisodes.stream().filter(EvaluatedEpisode::isActive).count();
                long disruptionMinutes = lineEpisodes.stream().mapToLong(EvaluatedEpisode::operatingDisruptionMinutes).sum();
                List<Long> durations = lineEpisodes.stream()
                    .map(EvaluatedEpisode::durationMinutes)
                    .filter(Objects::nonNull)
                    .toList();
                Long medianMinutes = computeMedian(durations);
                return new AggregateRow(line.id(), line.number(), line.name(), incidents, activeIncidents, medianMinutes, disruptionMinutes);
            })
            .toList();
    }

    private List<BreakdownRow> ttcBreakdown(OffsetDateTime since, OffsetDateTime until) {
        List<EvaluatedEpisode> episodes = fetchEvaluatedTtcEpisodes(since, until);

        Map<String, List<EvaluatedEpisode>> byKind = episodes.stream()
            .collect(Collectors.groupingBy(e -> normalizeImpactKind(e.impactKind())));

        return byKind.entrySet().stream()
            .map(entry -> {
                String kind = entry.getKey();
                List<EvaluatedEpisode> list = entry.getValue();
                long incidents = list.size();
                long disruptionMinutes = list.stream().mapToLong(EvaluatedEpisode::operatingDisruptionMinutes).sum();
                return new BreakdownRow(kind, incidents, disruptionMinutes);
            })
            .sorted((a, b) -> {
                int cmp = Long.compare(b.disruptionMinutes(), a.disruptionMinutes());
                return cmp != 0 ? cmp : Long.compare(b.incidents(), a.incidents());
            })
            .toList();
    }

    private List<EvaluatedEpisode> fetchEvaluatedTtcEpisodes(OffsetDateTime since, OffsetDateTime until) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("until", until);

        List<TtcEpisodeRecord> rawEpisodes = jdbc.query("""
            with lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       s.start_station_id, s.end_station_id,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from snapshots s
                where s.snapshot_time < :until
            )
            select o.alert_id, o.line_id, o.impact_kind, o.start_station_id, o.end_station_id,
                   o.snapshot_time as opened_at,
                   (select min(c.snapshot_time) from lifecycle c
                    where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) as cleared_at
            from lifecycle o
            where o.active = true and (o.previous_active is null or o.previous_active = false)
            """, params, (rs, rowNum) -> new TtcEpisodeRecord(
                rs.getString("alert_id"),
                rs.getString("line_id"),
                rs.getString("impact_kind"),
                rs.getString("start_station_id"),
                rs.getString("end_station_id"),
                rs.getObject("opened_at", OffsetDateTime.class),
                rs.getObject("cleared_at", OffsetDateTime.class)
            ));

        Map<String, List<ClosurePeriodRecord>> periodsByAlert = fetchClosurePeriods();

        List<EvaluatedEpisode> evaluated = new ArrayList<>();
        for (TtcEpisodeRecord e : rawEpisodes) {
            OffsetDateTime clearedAt = e.clearedAt();
            OffsetDateTime openedAt = e.openedAt();

            if (clearedAt != null && clearedAt.isBefore(since)) {
                continue;
            }
            if (!openedAt.isBefore(until)) {
                continue;
            }

            boolean isClosure = isClosure(e.impactKind());
            if (isClosure) {
                List<ClosurePeriodRecord> periods = periodsByAlert.getOrDefault(e.alertId(), List.of());
                List<ClosurePeriodRecord> activePeriods = periods.stream()
                    .filter(p -> p.startsAt().isBefore(until) && p.endsAt().isAfter(since) && p.endsAt().isAfter(p.startsAt()))
                    .toList();

                long operatingMinutes = activePeriods.stream()
                    .mapToLong(p -> SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(
                        max(p.startsAt(), since),
                        min(p.endsAt(), until)
                    ))
                    .sum();

                boolean isActive = periods.stream()
                    .anyMatch(p -> !p.startsAt().isAfter(until) && (p.endsAt() == null || p.endsAt().isAfter(until)));

                List<Long> periodDurations = activePeriods.stream()
                    .map(p -> SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(p.startsAt(), p.endsAt()))
                    .filter(m -> m > 0)
                    .toList();
                Long durationMinutes = computeMedian(periodDurations);

                evaluated.add(new EvaluatedEpisode(
                    e.alertId(), e.lineId(), e.impactKind(),
                    e.startStationId(), e.endStationId(),
                    operatingMinutes, isActive, durationMinutes
                ));
            } else {
                OffsetDateTime effStart = max(openedAt, since);
                OffsetDateTime effEnd = min(clearedAt != null ? clearedAt : until, until);
                long operatingMinutes = SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(effStart, effEnd);
                boolean isActive = clearedAt == null && openedAt.isBefore(until);
                Long durationMinutes = (clearedAt != null && !clearedAt.isBefore(since))
                    ? SubwayOperatingHoursCalculator.calculateSubwayOperatingMinutes(openedAt, clearedAt)
                    : null;

                evaluated.add(new EvaluatedEpisode(
                    e.alertId(), e.lineId(), e.impactKind(),
                    e.startStationId(), e.endStationId(),
                    operatingMinutes, isActive, durationMinutes
                ));
            }
        }
        return evaluated;
    }

    private Map<String, List<ClosurePeriodRecord>> fetchClosurePeriods() {
        return jdbc.query("""
            with closure_child_counts as (
                select alert_id, count(*) filter (where source_period_id != 'parent') as child_count
                from alert_active_periods
                group by alert_id
            )
            select ap.alert_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts cc on cc.alert_id = ap.alert_id and cc.child_count > 0
            where ap.source_period_id != 'parent' and ap.starts_at is not null and ap.ends_at is not null and ap.ends_at > ap.starts_at
            union all
            select ap.alert_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts cc on cc.alert_id = ap.alert_id and cc.child_count = 0
            where ap.starts_at is not null and ap.ends_at is not null and ap.ends_at > ap.starts_at
              and (ap.source_current_continuous = true or (ap.ends_at - ap.starts_at) <= interval '80 hours')
            union all
            select a.id as alert_id, a.active_period_start as starts_at, a.active_period_end as ends_at
            from alerts a
            where a.impact_kind in ('planned-closure', 'planned_closure')
              and a.active_period_start is not null and a.active_period_end is not null
              and a.active_period_end > a.active_period_start
              and (a.active_period_end - a.active_period_start <= interval '80 hours')
              and not exists (select 1 from alert_active_periods ap where ap.alert_id = a.id)
            """, new MapSqlParameterSource(), (rs, rowNum) -> new ClosurePeriodRecord(
                rs.getString("alert_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class)
            )).stream().collect(Collectors.groupingBy(ClosurePeriodRecord::alertId));
    }

    private List<TransitLineRecord> fetchTransitLines() {
        return jdbc.query("""
            select id, number, name from transit_lines
            where id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6')
            order by number
            """, new MapSqlParameterSource(), (rs, rowNum) -> new TransitLineRecord(
                rs.getString("id"), rs.getString("number"), rs.getString("name")
            ));
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

    private List<BreakdownRow> regionalBreakdown(OffsetDateTime since, OffsetDateTime until) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("since", since).addValue("until", until);
        return jdbc.query("""
            with lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from regional_alert_snapshots s where s.snapshot_time < :until
            ), episodes as (
                select o.alert_id, o.line_id, o.impact_kind, o.snapshot_time opened_at,
                       (select min(c.snapshot_time) from lifecycle c
                        where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at
                from lifecycle o where o.active = true and (o.previous_active is null or o.previous_active = false)
            ), episode_metrics as (
                select e.alert_id, e.line_id, e.impact_kind,
                       greatest(0, extract(epoch from (
                           least(coalesce(e.cleared_at, :until), :until) - greatest(e.opened_at, :since)
                       )) / 60) as disruption_minutes
                from episodes e
                where coalesce(e.cleared_at, :until) >= :since and e.opened_at < :until
            )
            select coalesce(nullif(trim(impact_kind), ''), 'service-alert') as impact_kind,
                   count(alert_id) as incidents,
                   coalesce(sum(disruption_minutes), 0) as disruption_minutes
            from episode_metrics
            group by coalesce(nullif(trim(impact_kind), ''), 'service-alert')
            order by disruption_minutes desc, incidents desc
            """, parameters, (rs, rowNum) -> new BreakdownRow(
                rs.getString("impact_kind"),
                rs.getLong("incidents"),
                Math.round(rs.getDouble("disruption_minutes"))
            ));
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

    private static boolean isClosure(String impactKind) {
        if (impactKind == null) return false;
        String normalized = impactKind.toLowerCase().replace('_', '-');
        return "planned-closure".equals(normalized) || "closure".equals(normalized);
    }

    private static String normalizeImpactKind(String impactKind) {
        if (impactKind == null || impactKind.isBlank()) return "service-alert";
        return impactKind.trim().toLowerCase().replace('_', '-');
    }

    private static Long computeMedian(List<Long> values) {
        if (values == null || values.isEmpty()) return null;
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        return sorted.get(sorted.size() / 2);
    }

    private static OffsetDateTime max(OffsetDateTime a, OffsetDateTime b) {
        return a.isAfter(b) ? a : b;
    }

    private static OffsetDateTime min(OffsetDateTime a, OffsetDateTime b) {
        return a.isBefore(b) ? a : b;
    }

    public record AggregateRow(
        String id, String number, String label, long incidents, long activeIncidents,
        Long medianDurationMinutes, long observedDisruptionMinutes
    ) {}

    public record BreakdownRow(
        String impactKind, long incidents, long disruptionMinutes
    ) {}

    private record TtcEpisodeRecord(
        String alertId, String lineId, String impactKind,
        String startStationId, String endStationId,
        OffsetDateTime openedAt, OffsetDateTime clearedAt
    ) {}

    private record ClosurePeriodRecord(
        String alertId, OffsetDateTime startsAt, OffsetDateTime endsAt
    ) {}

    private record TransitLineRecord(
        String id, String number, String name
    ) {}

    private record EvaluatedEpisode(
        String alertId, String lineId, String impactKind,
        String startStationId, String endStationId,
        long operatingDisruptionMinutes,
        boolean isActive,
        Long durationMinutes
    ) {}
}
