package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Owns reliability's polling coverage: the times a network's alerts were observed. Each
 * successful alert poll ({@code alerts} for TTC, {@code metrolinx-alerts} for regional) covers
 * the 10 minutes after it completed, and the windows are merged.
 *
 * <p>Raw ingestion runs are pruned, so {@link #rollUp} keeps each Toronto calendar date's
 * merged windows in {@code reliability_observation_windows}. A row is final once it was rolled
 * up {@link #FINAL_AFTER} after its date ended; until then the next roll-up rewrites it, and
 * final rows are never rewritten. Reads ({@link #observationWindows}) use final rows and fall
 * back to the raw runs, bounded to the date, for every other date: today, and any date not yet
 * rolled up.
 */
@Repository
public class ReliabilityObservationRollup {
    static final Duration OBSERVATION_FRESHNESS = Duration.ofMinutes(10);
    /** Run completions are written from the clock as polls finish; this margin covers their commit. */
    static final Duration FINAL_AFTER = Duration.ofMinutes(10);
    static final List<String> NETWORKS = List.of("ttc", "regional");

    private static final String DAY_START = "(cast(%s as date)::timestamp at time zone 'America/Toronto')";
    private static final String DAY_END = "((cast(%s as date) + 1)::timestamp at time zone 'America/Toronto')";
    private static final String FINAL_ROW = ("rolled.rolled_up_at >= " + DAY_END + " + interval '"
        + FINAL_AFTER.toMinutes() + " minutes'").formatted("rolled.observation_date");

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public ReliabilityObservationRollup(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public record RollupResult(String networkId, int datesRolledUp) {}

    /**
     * Rolls up every date from the first retained successful poll through today (Toronto) that
     * has no final row: today and yesterday on a normal run, every missing date on the first
     * run (the backfill) or after downtime. One statement per date, so each is bounded by one
     * day of runs and idempotent.
     */
    public RollupResult rollUp(String networkId) {
        String runType = runType(networkId);
        OffsetDateTime now = OffsetDateTime.now(clock);
        LocalDate today = torontoDate(now);
        OffsetDateTime firstRun = jdbc.queryForObject("""
            select min(completed_at) from ingestion_runs
            where run_type = :runType and status = 'success' and completed_at is not null
            """, new MapSqlParameterSource("runType", runType), OffsetDateTime.class);
        if (firstRun == null || torontoDate(firstRun).isAfter(today)) return new RollupResult(networkId, 0);

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("networkId", networkId)
            .addValue("runType", runType)
            .addValue("firstDate", torontoDate(firstRun))
            .addValue("today", today)
            .addValue("rolledUpAt", now);
        List<LocalDate> pending = jdbc.query("""
            select day::date observation_date
            from generate_series(cast(:firstDate as date), cast(:today as date), interval '1 day') day
            where not exists (
                select 1 from reliability_observation_windows rolled
                where rolled.network_id = :networkId and rolled.observation_date = day::date
                  and {finalRow}
            )
            order by 1
            """.replace("{finalRow}", FINAL_ROW), params,
            (rs, row) -> rs.getObject("observation_date", LocalDate.class));
        for (LocalDate date : pending) {
            jdbc.update(ROLL_UP_DATE, new MapSqlParameterSource(params.getValues()).addValue("date", date));
        }
        return new RollupResult(networkId, pending.size());
    }

    /**
     * Earliest Toronto calendar date with non-empty rolled-up polling coverage for
     * {@code networkId}, or null if none exists yet.
     */
    LocalDate firstObservedDate(String networkId) {
        return jdbc.queryForObject("""
            select min(observation_date)
            from reliability_observation_windows
            where network_id = :networkId
              and not isempty(covered)
            """, new MapSqlParameterSource("networkId", networkId), LocalDate.class);
    }

    /**
     * The network's merged observation windows clipped to {@code since}..{@code until}: final
     * rows for their dates, raw runs bounded to each other date.
     */
    List<TimeRange> observationWindows(String networkId, OffsetDateTime since, OffsetDateTime until) {
        if (!since.isBefore(until)) return List.of();
        List<ObservationDay> days = observationDays(since, until);
        Set<LocalDate> rolledUp = new HashSet<>();
        List<TimeRange> windows = new ArrayList<>();
        jdbc.query("""
            select rolled.observation_date, lower(piece) starts_at, upper(piece) ends_at
            from reliability_observation_windows rolled
            left join lateral unnest(rolled.covered
                * tstzmultirange(tstzrange(cast(:since as timestamptz), cast(:until as timestamptz)))) piece on true
            where rolled.network_id = :networkId
              and rolled.observation_date between :startDate and :endDate
              and {finalRow}
            """.replace("{finalRow}", FINAL_ROW), new MapSqlParameterSource()
                .addValue("networkId", networkId)
                .addValue("since", since)
                .addValue("until", until)
                .addValue("startDate", days.getFirst().date())
                .addValue("endDate", days.getLast().date()),
            rs -> {
                rolledUp.add(rs.getObject("observation_date", LocalDate.class));
                OffsetDateTime start = rs.getObject("starts_at", OffsetDateTime.class);
                if (start != null) windows.add(new TimeRange(start, rs.getObject("ends_at", OffsetDateTime.class)));
            });
        List<TimeRange> rawSpans = ReliabilityIntervalCalculator.merge(days.stream()
            .filter(day -> !rolledUp.contains(day.date()))
            .map(ObservationDay::range)
            .toList(), Duration.ZERO);
        for (TimeRange span : rawSpans) windows.addAll(rawWindows(networkId, span.start(), span.end()));
        return ReliabilityIntervalCalculator.merge(windows, Duration.ZERO);
    }

    /** The windows computed from raw runs, clipped to {@code start}..{@code end}. */
    List<TimeRange> rawWindows(String networkId, OffsetDateTime start, OffsetDateTime end) {
        List<OffsetDateTime> completions = jdbc.query("""
            select completed_at
            from ingestion_runs
            where run_type = :runType and status = 'success' and completed_at is not null
              and completed_at >= :querySince and completed_at < :until
            order by completed_at, id
            """, new MapSqlParameterSource()
            .addValue("runType", runType(networkId))
            .addValue("querySince", start.minus(OBSERVATION_FRESHNESS))
            .addValue("until", end),
            (rs, row) -> rs.getObject("completed_at", OffsetDateTime.class));
        return windowsFromCompletions(completions, start, end);
    }

    /** Each completion covers the next {@link #OBSERVATION_FRESHNESS}; clipped and merged. */
    static List<TimeRange> windowsFromCompletions(List<OffsetDateTime> completions, OffsetDateTime start, OffsetDateTime end) {
        return ReliabilityIntervalCalculator.merge(completions.stream()
            .map(completion -> new TimeRange(
                later(completion, start),
                earlier(completion.plus(OBSERVATION_FRESHNESS), end)
            ))
            .toList(), Duration.ZERO);
    }

    /** Each Toronto calendar date that {@code since}..{@code until} touches, with its part of the window. */
    static List<ObservationDay> observationDays(OffsetDateTime since, OffsetDateTime until) {
        List<ObservationDay> days = new ArrayList<>();
        for (LocalDate date = torontoDate(since); !date.isAfter(torontoDate(until)); date = date.plusDays(1)) {
            TimeRange range = new TimeRange(later(dayStart(date), since), earlier(dayStart(date.plusDays(1)), until));
            if (range.valid()) days.add(new ObservationDay(date, range));
        }
        return List.copyOf(days);
    }

    static OffsetDateTime dayStart(LocalDate date) {
        return date.atStartOfDay(GtfsServiceTime.TORONTO).toOffsetDateTime();
    }

    private static LocalDate torontoDate(OffsetDateTime instant) {
        return instant.atZoneSameInstant(GtfsServiceTime.TORONTO).toLocalDate();
    }

    private static String runType(String networkId) {
        return switch (networkId) {
            case "ttc" -> "alerts";
            case "regional" -> "metrolinx-alerts";
            default -> throw new IllegalArgumentException("Unknown reliability network: " + networkId);
        };
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static OffsetDateTime later(OffsetDateTime first, OffsetDateTime second) {
        return first.isAfter(second) ? first : second;
    }

    record ObservationDay(LocalDate date, TimeRange range) {}

    /**
     * One date's roll-up, the SQL form of {@link #windowsFromCompletions} over the date: runs
     * from 10 minutes before the date's start (their windows reach into it), merged by
     * range_agg (which joins touching windows as merge does) and clipped to the date. Minutes
     * floor each window to whole seconds, as {@link ReliabilityIntervalCalculator#minutes} does.
     */
    private static final String ROLL_UP_DATE = """
        with bounds as (
            select {dayStart} day_start, {dayEnd} day_end
        ), clipped as (
            select coalesce((
                       select range_agg(tstzrange(run.completed_at, run.completed_at + interval '{freshness} minutes'))
                       from ingestion_runs run
                       where run.run_type = :runType and run.status = 'success' and run.completed_at is not null
                         and run.completed_at >= bounds.day_start - interval '{freshness} minutes'
                         and run.completed_at < bounds.day_end
                   ), '{}'::tstzmultirange)
                   * tstzmultirange(tstzrange(bounds.day_start, bounds.day_end)) covered
            from bounds
        )
        insert into reliability_observation_windows (network_id, observation_date, covered, observed_minutes, rolled_up_at)
        select :networkId, cast(:date as date), clipped.covered,
               coalesce((select round(sum(floor(extract(epoch from upper(piece) - lower(piece)))) / 60.0)
                         from unnest(clipped.covered) piece), 0)::integer,
               :rolledUpAt
        from clipped
        on conflict (network_id, observation_date) do update
        set covered = excluded.covered,
            observed_minutes = excluded.observed_minutes,
            rolled_up_at = excluded.rolled_up_at
        where not ({existingFinal})
        """
        .replace("{existingFinal}", FINAL_ROW.replace("rolled.", "reliability_observation_windows."))
        .replace("{dayStart}", DAY_START.formatted(":date"))
        .replace("{dayEnd}", DAY_END.formatted(":date"))
        .replace("{freshness}", Long.toString(OBSERVATION_FRESHNESS.toMinutes()));
}
