package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReliabilityRepository {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final Duration OBSERVATION_FRESHNESS = Duration.ofMinutes(10);
    private static final Duration LIFECYCLE_STITCH_GAP = Duration.ofMinutes(5);

    private final NamedParameterJdbcTemplate jdbc;

    public ReliabilityRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ReliabilityAggregation aggregate(
        String networkId,
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        List<TimeRange> observationWindows = observationWindows(networkId, since, until);
        ServiceWindowResult serviceWindowResult = serviceWindows(networkId, stationId, since, until);
        List<Episode> episodes = "regional".equals(networkId)
            ? regionalEpisodes(stationId, since, until)
            : ttcEpisodes(stationId, since, until);
        List<EvaluatedEpisode> evaluated = evaluate(
            episodes,
            observationWindows,
            serviceWindowResult.byLine(),
            until
        );

        List<LineRecord> lines = "regional".equals(networkId)
            ? RegionalNetworkCatalog.routes().stream()
                .map(route -> new LineRecord(route.id(), route.number(), route.name()))
                .toList()
            : fetchTransitLines();
        Map<String, List<EvaluatedEpisode>> byLine = evaluated.stream()
            .collect(Collectors.groupingBy(EvaluatedEpisode::lineId));

        List<AggregateRow> rows = observationWindows.isEmpty() ? List.of() : lines.stream()
            .filter(line -> serviceWindowResult.scheduleBacked())
            .filter(line -> serviceWindowResult.byLine().containsKey(line.id()))
            .filter(line -> stationId == null || byLine.containsKey(line.id()))
            .map(line -> aggregateLine(
                line,
                byLine.getOrDefault(line.id(), List.of()),
                ReliabilityIntervalCalculator.intersect(
                    serviceWindowResult.byLine().getOrDefault(line.id(), List.of()),
                    observationWindows
                )
            ))
            .filter(row -> row.observedServiceMinutes() > 0)
            .toList();

        Map<String, List<EvaluatedEpisode>> byKind = evaluated.stream()
            .collect(Collectors.groupingBy(episode -> normalizeImpactKind(episode.impactKind())));
        List<BreakdownRow> breakdown = byKind.entrySet().stream()
            .map(entry -> new BreakdownRow(
                entry.getKey(),
                entry.getValue().size(),
                entry.getValue().stream().mapToLong(EvaluatedEpisode::incidentMinutes).sum()
            ))
            .sorted((left, right) -> {
                int minutes = Long.compare(right.incidentMinutes(), left.incidentMinutes());
                return minutes != 0 ? minutes : Long.compare(right.incidents(), left.incidents());
            })
            .toList();

        long rollingMinutes = Math.max(1, Math.round(Duration.between(since, until).toSeconds() / 60.0));
        long observedMinutes = ReliabilityIntervalCalculator.minutes(observationWindows);
        double coveragePercentage = Math.min(100.0, Math.round(observedMinutes * 1000.0 / rollingMinutes) / 10.0);
        return new ReliabilityAggregation(
            rows,
            breakdown,
            observedMinutes,
            coveragePercentage,
            serviceWindowResult.basis(),
            serviceWindowResult.scheduleBacked(),
            serviceWindowResult.coveragePercentage()
        );
    }

    private AggregateRow aggregateLine(
        LineRecord line,
        List<EvaluatedEpisode> episodes,
        List<TimeRange> observedServiceWindows
    ) {
        List<TimeRange> uniqueImpactWindows = episodes.stream()
            .flatMap(episode -> episode.countedRanges().stream())
            .toList();
        List<Long> completedDurations = episodes.stream()
            .filter(EvaluatedEpisode::completed)
            .map(EvaluatedEpisode::incidentMinutes)
            .filter(minutes -> minutes > 0)
            .toList();
        long observedServiceMinutes = ReliabilityIntervalCalculator.minutes(observedServiceWindows);
        long disruptedServiceMinutes = ReliabilityIntervalCalculator.minutes(uniqueImpactWindows);
        long incidentMinutes = Math.max(
            disruptedServiceMinutes,
            episodes.stream().mapToLong(EvaluatedEpisode::incidentMinutes).sum()
        );
        double impactedPercentage = observedServiceMinutes == 0 ? 0.0
            : Math.min(100.0, Math.round(disruptedServiceMinutes * 1000.0 / observedServiceMinutes) / 10.0);
        return new AggregateRow(
            line.id(), line.number(), line.label(), episodes.size(),
            episodes.stream().filter(EvaluatedEpisode::active).count(),
            computeMedian(completedDurations), disruptedServiceMinutes,
            observedServiceMinutes, incidentMinutes, impactedPercentage
        );
    }

    private List<EvaluatedEpisode> evaluate(
        List<Episode> episodes,
        List<TimeRange> observationWindows,
        Map<String, List<TimeRange>> serviceWindows,
        OffsetDateTime until
    ) {
        List<EvaluatedEpisode> evaluated = new ArrayList<>();
        OffsetDateTime activeProbe = until.minusSeconds(1);
        for (Episode episode : episodes) {
            List<TimeRange> counted = ReliabilityIntervalCalculator.intersectAll(
                episode.ranges(),
                observationWindows,
                serviceWindows.getOrDefault(episode.lineId(), List.of())
            );
            if (counted.isEmpty()) continue;
            evaluated.add(new EvaluatedEpisode(
                episode.lineId(), episode.impactKind(), counted,
                ReliabilityIntervalCalculator.minutes(counted),
                episode.completed(),
                episode.sourceActive() && ReliabilityIntervalCalculator.contains(counted, activeProbe)
            ));
        }
        return List.copyOf(evaluated);
    }

    private List<TimeRange> observationWindows(
        String networkId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        String runType = "regional".equals(networkId) ? "metrolinx-alerts" : "alerts";
        List<OffsetDateTime> successes = jdbc.query("""
            select completed_at
            from ingestion_runs
            where run_type = :runType and status = 'success' and completed_at is not null
              and completed_at >= :querySince and completed_at < :until
            order by completed_at, id
            """, new MapSqlParameterSource()
            .addValue("runType", runType)
            .addValue("querySince", since.minus(OBSERVATION_FRESHNESS))
            .addValue("until", until),
            (rs, row) -> rs.getObject("completed_at", OffsetDateTime.class));
        return ReliabilityIntervalCalculator.merge(successes.stream()
            .map(success -> new TimeRange(
                later(success, since),
                earlier(success.plus(OBSERVATION_FRESHNESS), until)
            ))
            .toList(), Duration.ZERO);
    }

    private ServiceWindowResult serviceWindows(
        String networkId,
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        double scheduleCoveragePercentage = scheduleCoveragePercentage(networkId, since, until);
        if (scheduleCoveragePercentage == 0.0) {
            return new ServiceWindowResult(
                Map.of(),
                "published schedule coverage unavailable",
                false,
                0.0
            );
        }
        List<ServiceWindowRecord> scheduled = "regional".equals(networkId)
            ? regionalServiceWindows(stationId, since, until)
            : ttcServiceWindows(stationId, since, until);
        return new ServiceWindowResult(
            scheduled.stream().collect(Collectors.groupingBy(
                ServiceWindowRecord::lineId,
                Collectors.mapping(ServiceWindowRecord::range, Collectors.toList())
            )),
            "regional".equals(networkId)
                ? "published GO/UP GTFS daily corridor service spans"
                : "published TTC GTFS daily line service spans",
            true,
            scheduleCoveragePercentage
        );
    }

    private double scheduleCoveragePercentage(
        String networkId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        LocalDate startDate = since.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        LocalDate endDate = until.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("startDate", startDate)
            .addValue("endDate", endDate);
        String sql = "regional".equals(networkId) ? """
            with source_coverage as (
                select source.source_system,
                       100.0 * count(*) filter (where exists (
                           select 1 from regional_gtfs_schedule_imports schedule_import
                           where schedule_import.source_system = source.source_system
                             and schedule_import.service_start <= service_date.service_date
                             and schedule_import.service_end >= service_date.service_date
                       )) / nullif(count(*), 0) coverage
                from generate_series(cast(:startDate as date), cast(:endDate as date), interval '1 day')
                    service_date(service_date)
                cross join (values ('go'), ('up')) source(source_system)
                group by source.source_system
            )
            select coalesce(min(coverage), 0) coverage from source_coverage
            """ : """
            select coalesce(100.0 * count(*) filter (where exists (
                select 1 from gtfs_schedule_imports schedule_import
                where schedule_import.service_start <= service_date.service_date
                  and schedule_import.service_end >= service_date.service_date
            )) / nullif(count(*), 0), 0) coverage
            from generate_series(cast(:startDate as date), cast(:endDate as date), interval '1 day')
                service_date(service_date)
            """;
        Double coverage = jdbc.queryForObject(sql, params, Double.class);
        return coverage == null ? 0.0 : Math.min(100.0, Math.round(coverage * 10.0) / 10.0);
    }

    private List<ServiceWindowRecord> ttcServiceWindows(
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        String stationJoin = stationId == null ? "" : """
            join gtfs_station_stops mapped_stop
              on mapped_stop.import_id = stop_time.import_id
             and mapped_stop.stop_id = stop_time.stop_id
             and mapped_stop.line_id = trip.line_id
             and mapped_stop.station_id = :stationId
            """;
        return queryServiceWindows("""
            with service_dates as (
                select generate_series(cast(:startDate as date), cast(:endDate as date), interval '1 day')::date service_date
            ), selected_imports as (
                select service_date,
                       (select schedule_import.id from gtfs_schedule_imports schedule_import
                        where schedule_import.service_start <= service_date
                          and schedule_import.service_end >= service_date
                        order by schedule_import.active desc, schedule_import.imported_at desc, schedule_import.id desc
                        limit 1) import_id
                from service_dates
            ), active_services as (
                select selected.service_date, service.import_id, service.service_id
                from selected_imports selected
                join gtfs_services service on service.import_id = selected.import_id
                where case extract(isodow from selected.service_date)
                    when 1 then service.monday when 2 then service.tuesday
                    when 3 then service.wednesday when 4 then service.thursday
                    when 5 then service.friday when 6 then service.saturday
                    when 7 then service.sunday end
                  and not exists (
                    select 1 from gtfs_service_exceptions exception
                    where exception.import_id = service.import_id
                      and exception.service_id = service.service_id
                      and exception.service_date = selected.service_date
                      and exception.exception_type = 2
                  )
                union
                select selected.service_date, exception.import_id, exception.service_id
                from selected_imports selected
                join gtfs_service_exceptions exception
                  on exception.import_id = selected.import_id
                 and exception.service_date = selected.service_date
                 and exception.exception_type = 1
            ), selected_trips as materialized (
                select trip.import_id, trip.trip_id, trip.service_id, route.line_id
                from (select distinct import_id from active_services) selected
                join gtfs_trips trip on trip.import_id = selected.import_id
                join gtfs_routes route
                  on route.import_id = trip.import_id and route.route_id = trip.route_id
            ), service_line_spans as materialized (
                select trip.import_id, trip.service_id, trip.line_id,
                       min(stop_time.departure_seconds) start_seconds,
                       max(stop_time.departure_seconds) end_seconds
                from selected_trips trip
                join gtfs_stop_times stop_time
                  on stop_time.import_id = trip.import_id and stop_time.trip_id = trip.trip_id
                """ + stationJoin + """
                group by trip.import_id, trip.service_id, trip.line_id
            )
            select active.service_date, span.line_id,
                   min(span.start_seconds) start_seconds,
                   max(span.end_seconds) end_seconds
            from active_services active
            join service_line_spans span
              on span.import_id = active.import_id and span.service_id = active.service_id
            group by active.service_date, span.line_id
            having max(span.end_seconds) > min(span.start_seconds)
            order by service_date, line_id, start_seconds
            """, stationId, since, until);
    }

    private List<ServiceWindowRecord> regionalServiceWindows(
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        String stationFilter = stationId == null ? "" : " and departure.station_id = :stationId ";
        return queryServiceWindows("""
            with service_dates as (
                select generate_series(cast(:startDate as date), cast(:endDate as date), interval '1 day')::date service_date
            ), selected_imports as (
                select service_date, source_system,
                       (select schedule_import.id from regional_gtfs_schedule_imports schedule_import
                        where schedule_import.source_system = sources.source_system
                          and schedule_import.service_start <= service_date
                          and schedule_import.service_end >= service_date
                        order by schedule_import.active desc, schedule_import.imported_at desc, schedule_import.id desc
                        limit 1) import_id
                from service_dates cross join (values ('go'), ('up')) sources(source_system)
            ), active_services as (
                select selected.service_date, service.import_id, service.service_id
                from selected_imports selected
                join regional_gtfs_services service on service.import_id = selected.import_id
                where case extract(isodow from selected.service_date)
                    when 1 then service.monday when 2 then service.tuesday
                    when 3 then service.wednesday when 4 then service.thursday
                    when 5 then service.friday when 6 then service.saturday
                    when 7 then service.sunday end
                  and not exists (
                    select 1 from regional_gtfs_service_exceptions exception
                    where exception.import_id = service.import_id
                      and exception.service_id = service.service_id
                      and exception.service_date = selected.service_date
                      and exception.exception_type = 2
                  )
                union
                select selected.service_date, exception.import_id, exception.service_id
                from selected_imports selected
                join regional_gtfs_service_exceptions exception
                  on exception.import_id = selected.import_id
                 and exception.service_date = selected.service_date
                 and exception.exception_type = 1
            ), service_line_spans as materialized (
                select departure.import_id, departure.service_id, departure.line_id,
                       min(departure.departure_seconds) start_seconds,
                       max(departure.departure_seconds) end_seconds
                from (select distinct import_id from active_services) selected
                join regional_gtfs_departures departure on departure.import_id = selected.import_id
                where true """ + stationFilter + """
                group by departure.import_id, departure.service_id, departure.line_id
            )
            select active.service_date, span.line_id,
                   min(span.start_seconds) start_seconds,
                   max(span.end_seconds) end_seconds
            from active_services active
            join service_line_spans span
              on span.import_id = active.import_id and span.service_id = active.service_id
            group by active.service_date, span.line_id
            having max(span.end_seconds) > min(span.start_seconds)
            order by service_date, line_id, start_seconds
            """, stationId, since, until);
    }

    private List<ServiceWindowRecord> queryServiceWindows(
        String sql,
        String stationId,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        LocalDate startDate = since.atZoneSameInstant(TORONTO_ZONE).toLocalDate().minusDays(1);
        LocalDate endDate = until.atZoneSameInstant(TORONTO_ZONE).toLocalDate();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("startDate", startDate)
            .addValue("endDate", endDate);
        if (stationId != null) params.addValue("stationId", stationId);
        return jdbc.query(sql, params, (rs, row) -> {
            LocalDate serviceDate = rs.getObject("service_date", LocalDate.class);
            OffsetDateTime start = serviceDate.atStartOfDay(TORONTO_ZONE)
                .plusSeconds(rs.getInt("start_seconds")).toOffsetDateTime();
            OffsetDateTime end = serviceDate.atStartOfDay(TORONTO_ZONE)
                .plusSeconds(rs.getInt("end_seconds")).toOffsetDateTime();
            return new ServiceWindowRecord(rs.getString("line_id"), new TimeRange(
                later(start, since), earlier(end, until)
            ));
        }).stream().filter(record -> record.range().valid()).toList();
    }

    private List<Episode> ttcEpisodes(String stationId, OffsetDateTime since, OffsetDateTime until) {
        List<RawEpisode> raw = rawTtcEpisodes(until);
        Set<String> stationAlertIds = stationId == null ? Set.of() : new HashSet<>(jdbc.query("""
            select alert_id from alert_stations where station_id = :stationId
            """, new MapSqlParameterSource("stationId", stationId), (rs, row) -> rs.getString("alert_id")));
        if (stationId != null) raw = raw.stream().filter(episode -> stationAlertIds.contains(episode.alertId())).toList();

        Map<String, List<ClosurePeriodRecord>> periodsByAlert = fetchClosurePeriods();
        Map<String, String> childPeriodParent = periodsByAlert.values().stream()
            .flatMap(List::stream)
            .filter(period -> !"parent".equalsIgnoreCase(period.sourcePeriodId()))
            .collect(Collectors.toMap(
                ClosurePeriodRecord::sourcePeriodId,
                ClosurePeriodRecord::alertId,
                (first, second) -> first
            ));
        Map<String, List<RawEpisode>> byAlert = raw.stream().collect(Collectors.groupingBy(RawEpisode::alertId));
        List<Episode> episodes = new ArrayList<>();
        for (Map.Entry<String, List<RawEpisode>> entry : byAlert.entrySet()) {
            List<RawEpisode> alertEpisodes = entry.getValue();
            RawEpisode representative = alertEpisodes.getFirst();
            if (isClosure(representative.impactKind())) {
                String parentAlertId = childPeriodParent.get(representative.sourceId());
                if (parentAlertId != null && !parentAlertId.equals(representative.alertId())) continue;
                OffsetDateTime firstObserved = alertEpisodes.stream().map(RawEpisode::openedAt)
                    .min(OffsetDateTime::compareTo).orElse(since);
                boolean sourceActive = alertEpisodes.stream().anyMatch(RawEpisode::sourceActive);
                for (TimeRange occurrence : ReliabilityIntervalCalculator.merge(
                    periodsByAlert.getOrDefault(entry.getKey(), List.of()).stream()
                        .map(period -> new TimeRange(later(period.startsAt(), firstObserved), period.endsAt()))
                        .toList(),
                    Duration.ZERO
                )) {
                    if (occurrence.end().isAfter(since) && occurrence.start().isBefore(until)) {
                        episodes.add(new Episode(
                            representative.lineId(), representative.impactKind(), List.of(occurrence),
                            !occurrence.end().isAfter(until), sourceActive
                        ));
                    }
                }
            } else {
                episodes.addAll(stitchLifecycleEpisodes(alertEpisodes, since, until));
            }
        }
        return List.copyOf(episodes);
    }

    private List<Episode> regionalEpisodes(String stationId, OffsetDateTime since, OffsetDateTime until) {
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("until", until);
        if (stationId != null) params.addValue("stationId", stationId);
        String stationFilter = stationId == null
            ? ""
            : " and jsonb_exists(s.station_ids, :stationId) ";
        List<RawEpisode> raw = jdbc.query("""
            with lifecycle as (
                select s.alert_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from regional_alert_snapshots s
                where s.snapshot_time < :until """ + stationFilter + """
            )
            select o.alert_id, o.alert_id source_id, o.line_id, o.impact_kind,
                   o.snapshot_time opened_at,
                   (select min(c.snapshot_time) from lifecycle c
                    where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at,
                   not exists (select 1 from lifecycle c where c.alert_id = o.alert_id
                    and c.snapshot_time > o.snapshot_time and c.active = false) source_active
            from lifecycle o
            where o.active = true and (o.previous_active is null or o.previous_active = false)
            """, params, this::rawEpisode);
        Map<String, ApplicablePeriod> applicablePeriods = jdbc.query("""
            select id, active_period_start, active_period_end
            from regional_alerts
            where impact_kind = 'planned-closure' and active_period_start is not null
              and active_period_end is not null and active_period_end > active_period_start
            """, (rs, row) -> new ApplicablePeriod(
                rs.getString("id"),
                rs.getObject("active_period_start", OffsetDateTime.class),
                rs.getObject("active_period_end", OffsetDateTime.class)
            )).stream().collect(Collectors.toMap(ApplicablePeriod::alertId, Function.identity()));

        List<Episode> episodes = new ArrayList<>();
        for (List<RawEpisode> alertEpisodes : raw.stream().collect(Collectors.groupingBy(RawEpisode::alertId)).values()) {
            RawEpisode representative = alertEpisodes.getFirst();
            if (isClosure(representative.impactKind())) {
                ApplicablePeriod period = applicablePeriods.get(representative.alertId());
                if (period == null) continue;
                OffsetDateTime firstObserved = alertEpisodes.stream().map(RawEpisode::openedAt)
                    .min(OffsetDateTime::compareTo).orElse(since);
                TimeRange occurrence = new TimeRange(later(period.start(), firstObserved), period.end());
                if (occurrence.valid() && occurrence.end().isAfter(since) && occurrence.start().isBefore(until)) {
                    episodes.add(new Episode(
                        representative.lineId(), representative.impactKind(), List.of(occurrence),
                        !occurrence.end().isAfter(until), alertEpisodes.stream().anyMatch(RawEpisode::sourceActive)
                    ));
                }
            } else {
                episodes.addAll(stitchLifecycleEpisodes(alertEpisodes, since, until));
            }
        }
        return List.copyOf(episodes);
    }

    private List<RawEpisode> rawTtcEpisodes(OffsetDateTime until) {
        return jdbc.query("""
            with lifecycle as (
                select s.alert_id, s.source_id, s.line_id, s.snapshot_time, s.active, s.impact_kind,
                       lag(s.active) over (partition by s.alert_id order by s.snapshot_time, s.id) previous_active
                from snapshots s where s.snapshot_time < :until
            )
            select o.alert_id, o.source_id, o.line_id, o.impact_kind, o.snapshot_time opened_at,
                   (select min(c.snapshot_time) from lifecycle c
                    where c.alert_id = o.alert_id and c.snapshot_time > o.snapshot_time and c.active = false) cleared_at,
                   not exists (select 1 from lifecycle c where c.alert_id = o.alert_id
                    and c.snapshot_time > o.snapshot_time and c.active = false) source_active
            from lifecycle o
            where o.active = true and (o.previous_active is null or o.previous_active = false)
            """, new MapSqlParameterSource("until", until), this::rawEpisode);
    }

    private RawEpisode rawEpisode(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new RawEpisode(
            rs.getString("alert_id"), rs.getString("source_id"), rs.getString("line_id"),
            rs.getString("impact_kind"), rs.getObject("opened_at", OffsetDateTime.class),
            rs.getObject("cleared_at", OffsetDateTime.class), rs.getBoolean("source_active")
        );
    }

    private List<Episode> stitchLifecycleEpisodes(
        List<RawEpisode> raw,
        OffsetDateTime since,
        OffsetDateTime until
    ) {
        if (raw.isEmpty()) return List.of();
        RawEpisode representative = raw.getFirst();
        List<TimeRange> stitched = ReliabilityIntervalCalculator.merge(raw.stream()
            .map(episode -> new TimeRange(
                later(episode.openedAt(), since),
                earlier(episode.clearedAt() == null ? until : episode.clearedAt(), until)
            ))
            .toList(), LIFECYCLE_STITCH_GAP);
        return stitched.stream().filter(TimeRange::valid).map(range -> new Episode(
            representative.lineId(), representative.impactKind(), List.of(range),
            raw.stream().anyMatch(episode -> episode.clearedAt() != null
                && !episode.clearedAt().isBefore(range.end())),
            raw.stream().anyMatch(RawEpisode::sourceActive)
        )).toList();
    }

    private Map<String, List<ClosurePeriodRecord>> fetchClosurePeriods() {
        return jdbc.query("""
            with closure_child_counts as (
                select alert_id, count(*) filter (where source_period_id != 'parent') child_count
                from alert_active_periods group by alert_id
            )
            select ap.alert_id, ap.source_period_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts counts on counts.alert_id = ap.alert_id and counts.child_count > 0
            where ap.source_period_id != 'parent' and ap.starts_at is not null
              and ap.ends_at is not null and ap.ends_at > ap.starts_at
            union all
            select ap.alert_id, ap.source_period_id, ap.starts_at, ap.ends_at
            from alert_active_periods ap
            join closure_child_counts counts on counts.alert_id = ap.alert_id and counts.child_count = 0
            where ap.starts_at is not null and ap.ends_at is not null and ap.ends_at > ap.starts_at
              and (ap.source_current_continuous = true or ap.ends_at - ap.starts_at <= interval '80 hours')
            union all
            select alert.id, 'fallback', alert.active_period_start, alert.active_period_end
            from alerts alert
            where alert.impact_kind in ('planned-closure', 'planned_closure')
              and alert.active_period_start is not null and alert.active_period_end is not null
              and alert.active_period_end > alert.active_period_start
              and alert.active_period_end - alert.active_period_start <= interval '80 hours'
              and not exists (select 1 from alert_active_periods period where period.alert_id = alert.id)
            """, (rs, row) -> new ClosurePeriodRecord(
                rs.getString("alert_id"), rs.getString("source_period_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class)
            )).stream().collect(Collectors.groupingBy(ClosurePeriodRecord::alertId));
    }

    private List<LineRecord> fetchTransitLines() {
        return jdbc.query("""
            select id, number, name from transit_lines
            where id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6')
            order by number
            """, (rs, row) -> new LineRecord(
                rs.getString("id"), rs.getString("number"), rs.getString("name")
            ));
    }

    private static boolean isClosure(String impactKind) {
        String normalized = normalizeImpactKind(impactKind);
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
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 0
            ? Math.round((sorted.get(middle - 1) + sorted.get(middle)) / 2.0)
            : sorted.get(middle);
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    public record ReliabilityAggregation(
        List<AggregateRow> rows,
        List<BreakdownRow> breakdown,
        long observationMinutes,
        double coveragePercentage,
        String serviceWindowBasis,
        boolean scheduleBacked,
        double scheduleCoveragePercentage
    ) {}

    public record AggregateRow(
        String id,
        String number,
        String label,
        long incidents,
        long activeIncidents,
        Long medianDurationMinutes,
        long serviceImpactMinutes,
        long observedServiceMinutes,
        long incidentDisruptionMinutes,
        double serviceImpactPercentage
    ) {}

    public record BreakdownRow(String impactKind, long incidents, long incidentMinutes) {}

    private record RawEpisode(
        String alertId,
        String sourceId,
        String lineId,
        String impactKind,
        OffsetDateTime openedAt,
        OffsetDateTime clearedAt,
        boolean sourceActive
    ) {}

    private record Episode(
        String lineId,
        String impactKind,
        List<TimeRange> ranges,
        boolean completed,
        boolean sourceActive
    ) {}

    private record EvaluatedEpisode(
        String lineId,
        String impactKind,
        List<TimeRange> countedRanges,
        long incidentMinutes,
        boolean completed,
        boolean active
    ) {}

    private record ClosurePeriodRecord(
        String alertId,
        String sourcePeriodId,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt
    ) {}

    private record ApplicablePeriod(String alertId, OffsetDateTime start, OffsetDateTime end) {}
    private record LineRecord(String id, String number, String label) {}
    private record ServiceWindowRecord(String lineId, TimeRange range) {}
    private record ServiceWindowResult(
        Map<String, List<TimeRange>> byLine,
        String basis,
        boolean scheduleBacked,
        double coveragePercentage
    ) {}
}
