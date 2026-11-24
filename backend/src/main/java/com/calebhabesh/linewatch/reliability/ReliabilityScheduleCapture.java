package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns reliability's schedule basis: which service dates had a published schedule (schedule
 * days) and each line's and station's first-to-last departure on them (service spans).
 *
 * <p>GTFS imports are pruned, so {@link #capture} copies the spans of every date the retained
 * imports cover into {@code reliability_schedule_days} and {@code reliability_service_spans}.
 * Dates from yesterday (Toronto) onwards are rewritten from the import the selection rule picks
 * (active first, then newest); earlier dates are written only where no day exists yet, so a
 * replacement feed's calendar never rewrites history. Days are never deleted. Reads
 * ({@link #serviceSpans}, {@link #capturedAllSpans}, {@link #scheduleCoveragePercentage},
 * {@link #scheduledDates}) read only the captured tables and never query live GTFS tables.
 */
@Repository
public class ReliabilityScheduleCapture {
    static final String WHOLE_LINE = "";
    private static final int BATCH_SIZE = 1000;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public ReliabilityScheduleCapture(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public enum ScheduleSource {
        TTC("ttc", "ttc"),
        GO("regional", "go"),
        UP("regional", "up");

        private final String networkId;
        private final String sourceSystem;

        ScheduleSource(String networkId, String sourceSystem) {
            this.networkId = networkId;
            this.sourceSystem = sourceSystem;
        }

        public String networkId() {
            return networkId;
        }

        public String sourceSystem() {
            return sourceSystem;
        }

        public static ScheduleSource regional(String sourceSystem) {
            return switch (sourceSystem == null ? "" : sourceSystem.trim().toLowerCase(Locale.ROOT)) {
                case "go" -> GO;
                case "up" -> UP;
                default -> throw new IllegalArgumentException("Unknown regional schedule source: " + sourceSystem);
            };
        }

        boolean regional() {
            return "regional".equals(networkId);
        }
    }

    public record CaptureResult(ScheduleSource source, int scheduleDays, int serviceSpans) {}

    public record ServiceSpan(
        LocalDate serviceDate,
        String lineId,
        String stationId,
        OffsetDateTime start,
        OffsetDateTime end
    ) {}

    /**
     * Captures {@code source}'s schedule days and spans from the retained imports. Joins the
     * caller's transaction, so an import or prune sees and keeps what it captured.
     */
    @Transactional
    public CaptureResult capture(ScheduleSource source) {
        jdbc.query(
            "select pg_advisory_xact_lock(hashtext('reliability_schedule_capture_' || :sourceSystem))",
            new MapSqlParameterSource("sourceSystem", source.sourceSystem()),
            (rs, row) -> null
        );
        LocalDate yesterday = LocalDate.now(clock.withZone(GtfsServiceTime.TORONTO)).minusDays(1);
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("networkId", source.networkId())
            .addValue("sourceSystem", source.sourceSystem())
            .addValue("yesterday", yesterday);
        List<TargetDay> targets = jdbc.query(
            "with target_dates as (" + captureTargetDates(source) + "), "
                + selectedImports(source) + """
                select selected.service_date, selected.import_id, schedule_import.feed_version
                from selected_imports selected
                join ({importVersions}) schedule_import on schedule_import.id = selected.import_id
                order by selected.service_date
                """.replace("{importVersions}", importVersions(source)),
            params,
            (rs, row) -> new TargetDay(
                rs.getObject("service_date", LocalDate.class),
                rs.getLong("import_id"),
                rs.getString("feed_version")
            )
        );
        if (targets.isEmpty()) return new CaptureResult(source, 0, 0);

        List<LocalDate> dates = targets.stream().map(TargetDay::serviceDate).toList();
        params.addValue("dates", dates)
            .addValue("firstDate", dates.getFirst())
            .addValue("lastDate", dates.getLast());
        String targetDates = """
            select service_date, cast(:sourceSystem as varchar(16)) source_system
            from (select generate_series(cast(:firstDate as date), cast(:lastDate as date), interval '1 day')::date service_date) day
            where service_date in (:dates)
            """;
        List<ServiceSpan> spans = new ArrayList<>(querySpans(spanSql(source, targetDates, StationScope.WHOLE_LINE), params));
        spans.addAll(querySpans(spanSql(source, targetDates, StationScope.EACH_STATION), params));

        jdbc.update("""
            delete from reliability_service_spans
            where network_id = :networkId and source_system = :sourceSystem and service_date in (:dates)
            """, params);
        OffsetDateTime capturedAt = OffsetDateTime.now(clock);
        batch("""
            insert into reliability_service_spans (
                network_id, line_id, station_id, service_date, source_system, starts_at, ends_at
            ) values (
                :networkId, :lineId, :stationId, :serviceDate, :sourceSystem, :startsAt, :endsAt
            )
            """, spans.stream().map(span -> (SqlParameterSource) new MapSqlParameterSource()
                .addValue("networkId", source.networkId())
                .addValue("sourceSystem", source.sourceSystem())
                .addValue("lineId", span.lineId())
                .addValue("stationId", span.stationId())
                .addValue("serviceDate", span.serviceDate())
                .addValue("startsAt", span.start())
                .addValue("endsAt", span.end())).toList());
        batch("""
            insert into reliability_schedule_days (
                network_id, source_system, service_date, import_id, feed_version, source_kind, captured_at
            ) values (
                :networkId, :sourceSystem, :serviceDate, :importId, :feedVersion, 'import', :capturedAt
            )
            on conflict (network_id, source_system, service_date) do update
            set import_id = excluded.import_id,
                feed_version = excluded.feed_version,
                source_kind = excluded.source_kind,
                captured_at = excluded.captured_at
            """, targets.stream().map(target -> (SqlParameterSource) new MapSqlParameterSource()
                .addValue("networkId", source.networkId())
                .addValue("sourceSystem", source.sourceSystem())
                .addValue("serviceDate", target.serviceDate())
                .addValue("importId", target.importId())
                .addValue("feedVersion", target.feedVersion())
                .addValue("capturedAt", capturedAt)).toList());
        return new CaptureResult(source, targets.size(), spans.size());
    }

    /**
     * Each line's captured span per service date from {@code startDate} to {@code endDate}, for
     * the whole line ({@code stationId} null) or one station. Spans are not clipped.
     */
    public List<ServiceSpan> serviceSpans(String networkId, String stationId, LocalDate startDate, LocalDate endDate) {
        List<ScheduleSource> sources = sources(networkId);
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("networkId", sources.getFirst().networkId())
            .addValue("startDate", startDate)
            .addValue("endDate", endDate)
            .addValue("stationId", stationId == null ? WHOLE_LINE : stationId);
        List<ServiceSpan> spans = jdbc.query("""
            select span.service_date, span.line_id, span.station_id, span.starts_at, span.ends_at
            from reliability_service_spans span
            where span.network_id = :networkId and span.station_id = :stationId
              and span.service_date between :startDate and :endDate
              and exists (
                  select 1 from reliability_schedule_days captured
                  where captured.network_id = span.network_id
                    and captured.source_system = span.source_system
                    and captured.service_date = span.service_date
              )
            order by span.service_date, span.line_id, span.starts_at
            """, params, (rs, row) -> new ServiceSpan(
                rs.getObject("service_date", LocalDate.class),
                rs.getString("line_id"),
                rs.getString("station_id"),
                toronto(rs.getObject("starts_at", OffsetDateTime.class)),
                toronto(rs.getObject("ends_at", OffsetDateTime.class))
            ));
        return List.copyOf(spans);
    }

    /**
     * All captured spans (whole-line and per-station) for {@code networkId} across
     * {@code startDate}..{@code endDate}. Only dates with a complete schedule day for the
     * network (TTC: ttc; regional: both go and up) are included.
     */
    List<ServiceSpan> capturedAllSpans(String networkId, LocalDate startDate, LocalDate endDate) {
        List<ScheduleSource> sources = sources(networkId);
        int expectedSources = sources.size();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("networkId", sources.getFirst().networkId())
            .addValue("startDate", startDate)
            .addValue("endDate", endDate)
            .addValue("expectedSources", expectedSources);
        return jdbc.query("""
            with complete_days as (
                select service_date
                from reliability_schedule_days
                where network_id = :networkId
                  and service_date between :startDate and :endDate
                group by service_date
                having count(distinct source_system) = :expectedSources
            )
            select span.service_date, span.line_id, span.station_id, span.starts_at, span.ends_at
            from reliability_service_spans span
            join complete_days day on day.service_date = span.service_date
            where span.network_id = :networkId
              and span.service_date between :startDate and :endDate
            order by span.service_date, span.line_id, span.station_id, span.starts_at
            """, params, (rs, row) -> new ServiceSpan(
                rs.getObject("service_date", LocalDate.class),
                rs.getString("line_id"),
                rs.getString("station_id"),
                toronto(rs.getObject("starts_at", OffsetDateTime.class)),
                toronto(rs.getObject("ends_at", OffsetDateTime.class))
            ));
    }

    /**
     * Dates in {@code startDate}..{@code endDate} that have a complete schedule day for
     * {@code networkId} (TTC: ttc; regional: both go and up).
     */
    java.util.Set<LocalDate> completeScheduleDays(String networkId, LocalDate startDate, LocalDate endDate) {
        List<ScheduleSource> sources = sources(networkId);
        List<LocalDate> dates = jdbc.query("""
            select service_date
            from reliability_schedule_days
            where network_id = :networkId
              and service_date between :startDate and :endDate
            group by service_date
            having count(distinct source_system) = :expectedSources
            order by service_date
            """, new MapSqlParameterSource()
                .addValue("networkId", sources.getFirst().networkId())
                .addValue("startDate", startDate)
                .addValue("endDate", endDate)
                .addValue("expectedSources", sources.size()),
            (rs, row) -> rs.getObject("service_date", LocalDate.class));
        return new java.util.LinkedHashSet<>(dates);
    }

    /**
     * Earliest service date with a complete schedule day for {@code networkId}, or null if none.
     */
    LocalDate firstCompleteScheduleDate(String networkId) {
        List<ScheduleSource> sources = sources(networkId);
        return jdbc.queryForObject("""
            select min(service_date) from (
                select service_date
                from reliability_schedule_days
                where network_id = :networkId
                group by service_date
                having count(distinct source_system) = :expectedSources
            ) complete
            """, new MapSqlParameterSource()
                .addValue("networkId", sources.getFirst().networkId())
                .addValue("expectedSources", sources.size()),
            LocalDate.class);
    }

    /**
     * The share of service dates from {@code startDate} to {@code endDate} with a captured
     * schedule day; for regional, the lower of GO and UP.
     */
    public double scheduleCoveragePercentage(String networkId, LocalDate startDate, LocalDate endDate) {
        List<ScheduleSource> sources = sources(networkId);
        Double coverage = jdbc.queryForObject("""
            with source_coverage as (
                select source.source_system,
                       100.0 * count(*) filter (where exists (
                           select 1 from reliability_schedule_days captured
                           where captured.network_id = :networkId
                             and captured.source_system = source.source_system
                             and captured.service_date = day.service_date
                       )) / nullif(count(*), 0) coverage
                from (select generate_series(cast(:startDate as date), cast(:endDate as date), interval '1 day')::date service_date) day
                cross join (values {sources}) source(source_system)
                group by source.source_system
            )
            select coalesce(min(coverage), 0) coverage from source_coverage
            """.replace("{sources}", sourceValues(sources)), new MapSqlParameterSource()
                .addValue("networkId", sources.getFirst().networkId())
                .addValue("startDate", startDate)
                .addValue("endDate", endDate), Double.class);
        return coverage == null ? 0.0 : Math.min(100.0, Math.round(coverage * 10.0) / 10.0);
    }

    /**
     * Dates from {@code startDate} to {@code endDate} with a captured schedule day for every
     * source of {@code networkId} (GO and UP both for regional): the per-date form of
     * {@link #scheduleCoveragePercentage}.
     */
    java.util.Set<LocalDate> scheduledDates(String networkId, LocalDate startDate, LocalDate endDate) {
        return completeScheduleDays(networkId, startDate, endDate);
    }

    private List<ServiceSpan> querySpans(String sql, MapSqlParameterSource params) {
        return jdbc.query(sql, params, (rs, row) -> {
            LocalDate serviceDate = rs.getObject("service_date", LocalDate.class);
            return new ServiceSpan(
                serviceDate,
                rs.getString("line_id"),
                rs.getString("station_id"),
                GtfsServiceTime.at(serviceDate, rs.getInt("start_seconds")),
                GtfsServiceTime.at(serviceDate, rs.getInt("end_seconds"))
            );
        });
    }

    /** Captured spans read back in Toronto's offset, as computed spans are. */
    private static OffsetDateTime toronto(OffsetDateTime instant) {
        return instant.atZoneSameInstant(GtfsServiceTime.TORONTO).toOffsetDateTime();
    }

    private void batch(String sql, List<SqlParameterSource> rows) {
        for (int start = 0; start < rows.size(); start += BATCH_SIZE) {
            jdbc.batchUpdate(sql, rows.subList(start, Math.min(start + BATCH_SIZE, rows.size()))
                .toArray(SqlParameterSource[]::new));
        }
    }

    private static List<ScheduleSource> sources(String networkId) {
        return "regional".equals(networkId)
            ? List.of(ScheduleSource.GO, ScheduleSource.UP)
            : List.of(ScheduleSource.TTC);
    }

    private static String sourceValues(List<ScheduleSource> sources) {
        return String.join(", ", sources.stream()
            .map(source -> "(cast('" + source.sourceSystem() + "' as varchar(16)))")
            .toList());
    }

    /** Every date a retained import of {@code source} covers that capture may write. */
    private static String captureTargetDates(ScheduleSource source) {
        String imports = source.regional()
            ? "regional_gtfs_schedule_imports where source_system = :sourceSystem"
            : "gtfs_schedule_imports";
        return """
            select day.service_date, cast(:sourceSystem as varchar(16)) source_system
            from (select generate_series(
                (select min(service_start) from {imports}),
                (select max(service_end) from {imports}),
                interval '1 day')::date service_date) day
            where day.service_date >= :yesterday
               or not exists (
                   select 1 from reliability_schedule_days captured
                   where captured.network_id = :networkId
                     and captured.source_system = :sourceSystem
                     and captured.service_date = day.service_date
               )
            """.replace("{imports}", imports);
    }

    private static String importVersions(ScheduleSource source) {
        return source.regional()
            ? "select id, cast(null as text) feed_version from regional_gtfs_schedule_imports"
            : "select id, source_version feed_version from gtfs_schedule_imports";
    }

    /** The per-date import selection: active first, then newest. Reads {@code target_dates}. */
    private static String selectedImports(ScheduleSource source) {
        return """
            selected_imports as (
                select target.service_date,
                       (select schedule_import.id from {table} schedule_import
                        where {sourceFilter} schedule_import.service_start <= target.service_date
                          and schedule_import.service_end >= target.service_date
                        order by schedule_import.active desc, schedule_import.imported_at desc, schedule_import.id desc
                        limit 1) import_id
                from target_dates target
            )
            """
            .replace("{table}", source.regional() ? "regional_gtfs_schedule_imports" : "gtfs_schedule_imports")
            .replace("{sourceFilter}", source.regional() ? "schedule_import.source_system = target.source_system and" : "");
    }

    private enum StationScope { WHOLE_LINE, EACH_STATION }

    /**
     * Each line's (or line and station's) first and last departure per service date in
     * {@code targetDates}, a query of (service_date, source_system) rows. The span rules are
     * those reliability has always used: a service runs on its calendar day unless removed by an
     * exception, or on an added exception date; a span is its trips' first to last departure.
     */
    private static String spanSql(ScheduleSource source, String targetDates, StationScope scope) {
        return "with target_dates as (" + targetDates + "), " + selectedImports(source)
            + (source.regional() ? regionalSpans(scope) : ttcSpans(scope))
            + SPAN_SELECT;
    }

    private static String ttcSpans(StationScope scope) {
        String stationJoin = scope == StationScope.WHOLE_LINE ? "" : """
            join gtfs_station_stops mapped_stop
              on mapped_stop.import_id = stop_time.import_id
             and mapped_stop.stop_id = stop_time.stop_id
             and mapped_stop.line_id = trip.line_id
            """;
        return """
            , active_services as (
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
                select trip.import_id, trip.service_id, trip.line_id, {stationColumn} station_id,
                       min(stop_time.departure_seconds) start_seconds,
                       max(stop_time.departure_seconds) end_seconds
                from selected_trips trip
                join gtfs_stop_times stop_time
                  on stop_time.import_id = trip.import_id and stop_time.trip_id = trip.trip_id
                {stationJoin}
                group by trip.import_id, trip.service_id, trip.line_id {stationGroup}
            )
            """
            .replace("{stationColumn}", scope == StationScope.WHOLE_LINE ? "cast('' as varchar(80))" : "mapped_stop.station_id")
            .replace("{stationJoin}", stationJoin)
            .replace("{stationGroup}", scope == StationScope.WHOLE_LINE ? "" : ", mapped_stop.station_id");
    }

    private static String regionalSpans(StationScope scope) {
        return """
            , active_services as (
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
                select departure.import_id, departure.service_id, departure.line_id, {stationColumn} station_id,
                       min(departure.departure_seconds) start_seconds,
                       max(departure.departure_seconds) end_seconds
                from (select distinct import_id from active_services) selected
                join regional_gtfs_departures departure on departure.import_id = selected.import_id
                group by departure.import_id, departure.service_id, departure.line_id {stationGroup}
            )
            """
            .replace("{stationColumn}", scope == StationScope.WHOLE_LINE ? "cast('' as varchar(80))" : "departure.station_id")
            .replace("{stationGroup}", scope == StationScope.WHOLE_LINE ? "" : ", departure.station_id");
    }

    private static final String SPAN_SELECT = """
        select active.service_date, span.line_id, span.station_id,
               min(span.start_seconds) start_seconds,
               max(span.end_seconds) end_seconds
        from active_services active
        join service_line_spans span
          on span.import_id = active.import_id and span.service_id = active.service_id
        group by active.service_date, span.line_id, span.station_id
        having max(span.end_seconds) > min(span.start_seconds)
        order by service_date, line_id, station_id, start_seconds
        """;

    private record TargetDay(LocalDate serviceDate, long importId, String feedVersion) {}
}
