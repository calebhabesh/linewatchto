package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImport;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.reliability.ReliabilityObservationRollup.RollupResult;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Plan 17 A3 against the local PostGIS test database (skips when it is unreachable). */
@SpringJUnitConfig(classes = ReliabilityObservationRollupIntegrationTest.TestConfig.class)
class ReliabilityObservationRollupIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";
    private static final Instant TODAY_NOON = Instant.parse("2026-11-24T17:00:00Z");
    private static final LocalDate FIRST_DATE = LocalDate.parse("2026-10-24");
    private static final LocalDate TODAY = LocalDate.parse("2026-11-24");
    private static final LocalDate LAST_POLL_DATE = LocalDate.parse("2026-11-11");
    private static final LocalDate OUTAGE_DATE = LocalDate.parse("2026-11-12");
    private static final LocalDate FALL_BACK = LocalDate.parse("2026-11-01");
    private static final List<String> NETWORKS = List.of("ttc", "regional");

    @Autowired private ReliabilityObservationRollup rollup;
    @Autowired private ReliabilityScheduleCapture scheduleCapture;
    @Autowired private ReliabilityDerivationService derivation;
    @Autowired private ReliabilityRepository reliability;
    @Autowired private RegionalGtfsScheduleRepository regional;
    @Autowired private NamedParameterJdbcTemplate jdbc;
    @Autowired private MutableClock clock;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway.configure().dataSource(createDataSource()).load().migrate();
    }

    @BeforeEach
    void cleanTables() {
        clock.set(TODAY_NOON);
        jdbc.getJdbcTemplate().execute("""
            delete from reliability_episodes;
            delete from reliability_line_days;
            delete from reliability_station_days;
            delete from reliability_derivations;
            update reliability_methodology set current_version = 1, switched_at = now() where id = 1;
            delete from reliability_observation_windows;
            delete from reliability_service_spans;
            delete from reliability_schedule_days;
            delete from gtfs_schedule_imports;
            delete from regional_gtfs_schedule_imports;
            delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts');
            delete from snapshots where alert_id like 'a3-%' or alert_id like 'a5-%' or alert_id like 'a7-%';
            delete from alert_stations where alert_id like 'a3-%' or alert_id like 'a5-%' or alert_id like 'a7-%';
            delete from alerts where id like 'a3-%' or id like 'a5-%' or id like 'a7-%';
            delete from regional_alert_snapshots where alert_id like 'a3-%' or alert_id like 'a5-%' or alert_id like 'a7-%';
            """);
    }

    @Test
    void theRollUpEqualsTheRawWindowsForEveryDateAndWindow() {
        polls("2026-10-24 00:00:00-04", "2026-11-24 17:00:00+00");

        for (String networkId : NETWORKS) {
            assertThat(rollup.rollUp(networkId)).isEqualTo(new RollupResult(networkId, 32));
            Map<LocalDate, RolledDay> rows = rows(networkId);
            assertThat(rows.keySet()).first().isEqualTo(FIRST_DATE);
            assertThat(rows).hasSize(32);
            for (RolledDay row : rows.values()) {
                OffsetDateTime start = ReliabilityObservationRollup.dayStart(row.date());
                OffsetDateTime end = ReliabilityObservationRollup.dayStart(row.date().plusDays(1));
                List<TimeRange> raw = rollup.rawWindows(networkId, start, end);
                assertThat(instants(row.pieces())).as("%s %s", networkId, row.date()).isEqualTo(instants(raw));
                assertThat(row.minutes()).as("%s %s", networkId, row.date())
                    .isEqualTo(ReliabilityIntervalCalculator.minutes(raw));
            }

            // The 23:55 poll is the last before the outage and covers the first 5 minutes of the next date.
            RolledDay lastPoll = rows.get(LAST_POLL_DATE);
            assertThat(lastPoll.pieces().getLast().end().toInstant())
                .isEqualTo(ReliabilityObservationRollup.dayStart(OUTAGE_DATE).toInstant());
            assertThat(instants(rows.get(OUTAGE_DATE).pieces())).containsExactly(
                "2026-11-12T05:00:00Z/2026-11-12T05:05:00Z");
            assertThat(rows.get(OUTAGE_DATE.plusDays(1)).pieces().getFirst().start().toInstant())
                .isEqualTo(Instant.parse("2026-11-13T11:00:00Z"));

            for (OffsetDateTime[] window : List.of(
                new OffsetDateTime[]{odt("2026-10-25T17:00:00Z"), odt("2026-11-24T17:00:00Z")},
                new OffsetDateTime[]{odt("2026-11-11T17:00:00Z"), odt("2026-11-13T17:00:00Z")},
                new OffsetDateTime[]{odt("2026-11-12T05:00:00Z"), odt("2026-11-12T05:03:00Z")},
                new OffsetDateTime[]{odt("2026-10-31T16:12:34.5Z"), odt("2026-11-02T03:00:00Z")},
                new OffsetDateTime[]{odt("2026-11-23T05:00:00Z"), odt("2026-11-24T05:00:00Z")},
                new OffsetDateTime[]{odt("2026-11-23T22:00:00Z"), odt("2026-11-24T17:00:00Z")}
            )) {
                assertThat(instants(rollup.observationWindows(networkId, window[0], window[1])))
                    .as("%s %s..%s", networkId, window[0], window[1])
                    .isEqualTo(instants(rollup.rawWindows(networkId, window[0], window[1])));
            }
        }
        // TTC polls every 2 minutes, so the 25-hour fall-back date is fully covered.
        assertThat(rows("ttc").get(FALL_BACK).minutes()).isEqualTo(1500);
        assertThat(rows("ttc").get(FALL_BACK).pieces()).hasSize(1);
        // The 25-minute gap on 2026-11-10 leaves 15 minutes uncovered on TTC.
        assertThat(rows("ttc").get(LocalDate.parse("2026-11-10")).pieces()).hasSize(2);
        // GO/UP polls every 11 minutes, so its windows are many and its per-day minutes are rounded.
        assertThat(rows("regional").get(LocalDate.parse("2026-11-10")).pieces().size()).isGreaterThan(100);
    }

    @Test
    void dstDatesRollUpTo23And25Hours() {
        clock.set(Instant.parse("2026-03-10T17:00:00Z"));
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select 'alerts', 'success', at, at
            from generate_series(timestamptz '2026-03-06 23:55:00-05', timestamptz '2026-03-09 23:59:00-04',
                interval '2 minutes') at
            """, Map.of());
        rollup.rollUp("ttc");
        assertThat(rows("ttc").get(LocalDate.parse("2026-03-08")).minutes()).isEqualTo(1380);
        assertThat(rows("ttc").get(LocalDate.parse("2026-03-07")).minutes()).isEqualTo(1440);

        clock.set(Instant.parse("2026-11-03T17:00:00Z"));
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select 'alerts', 'success', at, at
            from generate_series(timestamptz '2026-10-30 23:55:00-04', timestamptz '2026-11-02 23:59:00-05',
                interval '2 minutes') at
            """, Map.of());
        rollup.rollUp("ttc");
        assertThat(rows("ttc").get(LocalDate.parse("2026-11-01")).minutes()).isEqualTo(1500);
        assertThat(rows("ttc").get(LocalDate.parse("2026-10-31")).minutes()).isEqualTo(1440);
        // Dates between the two sets of polls are rolled up with nothing covered.
        assertThat(rows("ttc").get(LocalDate.parse("2026-06-01")).minutes()).isZero();
        assertThat(rows("ttc").get(LocalDate.parse("2026-06-01")).pieces()).isEmpty();
    }

    @Test
    void theRollUpIsIdempotentAndFinalRowsAreNeverRewritten() {
        polls("2026-10-24 00:00:00-04", "2026-11-24 17:00:00+00");
        rollup.rollUp("ttc");
        Map<LocalDate, RolledDay> first = rows("ttc");

        // Only today is not final; yesterday was rolled up after 00:10.
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 1));
        assertThat(rows("ttc")).isEqualTo(first);

        jdbc.update("delete from ingestion_runs where run_type = 'alerts' and completed_at < :before",
            Map.of("before", odt("2026-11-21T05:00:00Z")));
        clock.set(Instant.parse("2026-11-24T17:15:00Z"));
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 1));
        Map<LocalDate, RolledDay> after = rows("ttc");
        first.keySet().stream().filter(date -> date.isBefore(TODAY))
            .forEach(date -> assertThat(after.get(date)).as("%s", date).isEqualTo(first.get(date)));
        assertThat(after.get(TODAY).rolledUpAt().toInstant()).isEqualTo(Instant.parse("2026-11-24T17:15:00Z"));
    }

    @Test
    void aDateRolledUpBeforeItsEndIsRewrittenAndReadRawUntilFinal() {
        polls("2026-11-20 00:00:00-05", "2026-11-24 05:05:00+00");
        jdbc.update("""
            delete from ingestion_runs where run_type = 'alerts'
              and completed_at >= timestamptz '2026-11-23 12:00:00-05' and completed_at < timestamptz '2026-11-23 13:00:00-05'
            """, Map.of());
        clock.set(Instant.parse("2026-11-24T05:05:00Z"));
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 5));
        // A poll the roll-up did not see, in the gap: 2026-11-23 is read raw while its row is not final.
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            values ('alerts', 'success', timestamptz '2026-11-23 12:20:00-05', timestamptz '2026-11-23 12:20:00-05')
            """, Map.of());
        OffsetDateTime start = ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-23"));
        OffsetDateTime end = ReliabilityObservationRollup.dayStart(TODAY);
        assertThat(instants(rows("ttc").get(LocalDate.parse("2026-11-23")).pieces()))
            .isNotEqualTo(instants(rollup.rawWindows("ttc", start, end)));
        assertThat(instants(rollup.observationWindows("ttc", start, end)))
            .isEqualTo(instants(rollup.rawWindows("ttc", start, end)));

        clock.set(Instant.parse("2026-11-24T05:09:59Z"));
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 2));
        clock.set(Instant.parse("2026-11-24T05:10:00Z"));
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 2));
        assertThat(rollup.rollUp("ttc")).isEqualTo(new RollupResult("ttc", 1));
        assertThat(instants(rows("ttc").get(LocalDate.parse("2026-11-23")).pieces()))
            .isEqualTo(instants(rollup.rawWindows("ttc", start, end)));
    }

    @Test
    void completedDatesNeverFallBackToRawRunsAndDerivedServingSurvivesRawDeletion() {
        ttcImport();
        scheduleCapture.capture(ReliabilityScheduleCapture.ScheduleSource.TTC);
        scheduleImport("go", "regional-lw", "exhibition", 20_000, 87_000);
        scheduleImport("up", "regional-up", "pearson-airport", 18_000, 84_000);
        disruptions();
        polls("2026-10-24 00:00:00-04", "2026-11-24 17:00:00+00");
        OffsetDateTime until = odt("2026-11-24T17:00:00Z");

        // Before roll-up: completed dates before yesterday never fall back to raw ingestion_runs,
        // while today still reads bounded raw runs.
        for (String networkId : NETWORKS) {
            assertThat(rollup.observationWindows(
                networkId,
                ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-10")),
                ReliabilityObservationRollup.dayStart(LocalDate.parse("2026-11-22"))
            )).isEmpty();
            assertThat(rollup.observationWindows(
                networkId,
                ReliabilityObservationRollup.dayStart(TODAY),
                until
            )).isNotEmpty();
        }

        // Roll up at 12:05 UTC, before the afternoon's polls: today's row is partial and not final.
        jdbc.update("delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts') and completed_at >= :at",
            Map.of("at", odt("2026-11-24T12:00:00Z")));
        clock.set(Instant.parse("2026-11-24T12:05:00Z"));
        NETWORKS.forEach(rollup::rollUp);
        polls("2026-10-24 00:00:00-04", "2026-11-24 17:00:00+00", "2026-11-24 12:00:00+00");
        clock.set(TODAY_NOON);
        NETWORKS.forEach(derivation::deriveIncremental);

        for (String networkId : NETWORKS) {
            OffsetDateTime todayStart = ReliabilityObservationRollup.dayStart(TODAY);
            assertThat(rows(networkId).get(TODAY).minutes())
                .isLessThan(ReliabilityIntervalCalculator.minutes(rollup.rawWindows(networkId, todayStart, until)));
        }

        LocalDate fromDate = TODAY.minusDays(29);
        Map<String, ReliabilityRepository.ReliabilityAggregation> beforeDeletion = aggregates(fromDate, TODAY, until);
        assertThat(beforeDeletion.get("ttc").rows()).extracting(ReliabilityRepository.AggregateRow::incidents).contains(3L);
        assertThat(beforeDeletion.get("regional").rows()).extracting(ReliabilityRepository.AggregateRow::incidents).contains(2L);
        assertThat(beforeDeletion.get("ttc").rows()).anyMatch(row -> row.activeIncidents() == 1);
        assertThat(beforeDeletion.get("regional:exhibition").rows()).isNotEmpty();

        // Without the raw runs of rolled-up dates (today reads from 10 minutes before its start).
        jdbc.update("delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts') and completed_at < :before",
            Map.of("before", ReliabilityObservationRollup.dayStart(TODAY).minusMinutes(10)));
        assertThat(aggregates(fromDate, TODAY, until)).isEqualTo(beforeDeletion);
    }

    private Map<String, ReliabilityRepository.ReliabilityAggregation> aggregates(
        LocalDate fromDate,
        LocalDate toDate,
        OffsetDateTime until
    ) {
        Map<String, ReliabilityRepository.ReliabilityAggregation> results = new LinkedHashMap<>();
        results.put("ttc", reliability.aggregateServiceDates("ttc", null, fromDate, toDate, until));
        results.put("ttc:st-george", reliability.aggregateServiceDates("ttc", "st-george", fromDate, toDate, until));
        results.put("regional", reliability.aggregateServiceDates("regional", null, fromDate, toDate, until));
        results.put("regional:exhibition", reliability.aggregateServiceDates("regional", "exhibition", fromDate, toDate, until));
        return results;
    }

    /**
     * TTC polls every 2 min 7.123457 s, GO/UP every 11 min 0.4 s (so GO/UP windows have gaps)
     * with a retry 0.9 s after each (so its windows are 600.9 s), from a shared origin. Both skip 14:00–14:25 on 2026-11-10 and stop after a poll at 23:55
     * on 2026-11-11 until 06:00 on 2026-11-13. Failed and unfinished runs are noise.
     */
    private void polls(String origin, String end) {
        polls(origin, end, origin);
    }

    private void polls(String origin, String end, String from) {
        polls(origin, end, from, "alerts", "127.123457 seconds", "0 seconds");
        polls(origin, end, from, "metrolinx-alerts", "11 minutes 0.4 seconds", "0 seconds");
        polls(origin, end, from, "metrolinx-alerts", "11 minutes 0.4 seconds", "0.9 seconds");
    }

    private void polls(String origin, String end, String from, String runType, String step, String retry) {
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("origin", origin).addValue("end", end).addValue("from", from)
            .addValue("runType", runType).addValue("step", step).addValue("retry", retry);
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select :runType, 'success', at - interval '3 seconds', at
            from generate_series(cast(:origin as timestamptz) + cast(:retry as interval), cast(:end as timestamptz),
                cast(:step as interval)) at
            where at >= cast(:from as timestamptz) and at < cast(:end as timestamptz)
              and not (at >= timestamptz '2026-11-10 14:00:00-05' and at < timestamptz '2026-11-10 14:25:00-05')
              and not (at >= timestamptz '2026-11-11 23:55:00-05' and at < timestamptz '2026-11-13 06:00:00-05')
            union all
            select :runType, 'success', at - interval '3 seconds', at
            from (values (timestamptz '2026-11-11 23:55:00-05'), (timestamptz '2026-11-13 06:00:00-05')) poll(at)
            where at >= cast(:from as timestamptz) and at < cast(:end as timestamptz)
            union all
            select :runType, 'failed', at, at
            from (values (timestamptz '2026-11-12 12:00:00-05')) poll(at)
            where at >= cast(:from as timestamptz) and at < cast(:end as timestamptz)
            union all
            select :runType, 'running', at, null
            from (values (timestamptz '2026-11-12 13:00:00-05')) poll(at)
            where at >= cast(:from as timestamptz) and at < cast(:end as timestamptz)
            """, params);
    }

    /** Delays crossing midnight into the outage, on the fall-back date, and one still active. */
    private void disruptions() {
        jdbc.getJdbcTemplate().execute("""
            insert into alerts (id, source_id, type, severity, title, description, active, impact_kind, line_id)
            values ('a3-ttc-1', 'a3-ttc-1', 'active-alert', 'delay', 'Delay', 'Delay', false, 'delay', 'line-1'),
                   ('a3-ttc-2', 'a3-ttc-2', 'active-alert', 'delay', 'Delay', 'Delay', false, 'delay', 'line-1'),
                   ('a3-ttc-3', 'a3-ttc-3', 'active-alert', 'suspension', 'Suspension', 'Suspension', true, 'suspension', 'line-1');
            insert into snapshots (alert_id, source_id, severity, description, snapshot_time, active, impact_kind, line_id) values
                ('a3-ttc-1', 'a3-ttc-1', 'delay', 'Delay', '2026-11-11 23:40:00-05', true, 'delay', 'line-1'),
                ('a3-ttc-1', 'a3-ttc-1', 'delay', 'Delay', '2026-11-13 06:30:00-05', false, 'delay', 'line-1'),
                ('a3-ttc-2', 'a3-ttc-2', 'delay', 'Delay', '2026-11-01 01:00:00-04', true, 'delay', 'line-1'),
                ('a3-ttc-2', 'a3-ttc-2', 'delay', 'Delay', '2026-11-01 03:30:00-05', false, 'delay', 'line-1'),
                ('a3-ttc-3', 'a3-ttc-3', 'suspension', 'Suspension', '2026-11-24 09:00:00-05', true, 'suspension', 'line-1');
            insert into alert_stations (alert_id, station_id, sort_order)
            select id, 'st-george', 0 from alerts where id like 'a3-%';
            insert into regional_alert_snapshots (alert_id, line_id, impact_kind, title, station_ids, active, snapshot_time) values
                ('a3-go-1', 'regional-lw', 'delay', 'Delay', '["exhibition"]', true, '2026-11-11 23:30:00-05'),
                ('a3-go-1', 'regional-lw', 'delay', 'Delay', '["exhibition"]', false, '2026-11-12 00:30:00-05'),
                ('a3-go-2', 'regional-lw', 'suspension', 'Suspended', '["exhibition"]', true, '2026-11-20 22:00:00-05'),
                ('a3-go-2', 'regional-lw', 'suspension', 'Suspended', '["exhibition"]', false, '2026-11-21 02:00:00-05');
            """);
    }

    /** Line 1 every day from 06:00 to 25:30, with St George. */
    private void ttcImport() {
        Long importId = jdbc.queryForObject("""
            insert into gtfs_schedule_imports (source_name, source_url, imported_at, service_start, service_end, active, source_version)
            values ('TTC test', 'https://example.test/ttc.zip', :importedAt, date '2026-10-20', date '2026-12-10', true, 'a3')
            returning id
            """, new MapSqlParameterSource("importedAt", OffsetDateTime.now(clock)), Long.class);
        jdbc.update("""
            insert into gtfs_routes (import_id, route_id, line_id, route_short_name, route_long_name)
            values (:id, 'R1', 'line-1', '1', 'Yonge-University');
            insert into gtfs_stops (import_id, stop_id, stop_name) values (:id, 'UNION_1', 'Union'), (:id, 'STG_1', 'St George');
            insert into gtfs_services values (:id, 'ALL', true, true, true, true, true, true, true, date '2026-10-20', date '2026-12-10');
            insert into gtfs_trips (import_id, trip_id, route_id, service_id) values (:id, 'L1A', 'R1', 'ALL'), (:id, 'L1B', 'R1', 'ALL');
            insert into gtfs_stop_times (import_id, trip_id, stop_id, arrival_seconds, departure_seconds, stop_sequence) values
                (:id, 'L1A', 'UNION_1', 21600, 21600, 1), (:id, 'L1A', 'STG_1', 22200, 22200, 2),
                (:id, 'L1B', 'UNION_1', 88200, 88200, 1), (:id, 'L1B', 'STG_1', 91800, 91800, 2);
            insert into gtfs_station_stops (import_id, station_id, line_id, stop_id) values
                (:id, 'union', 'line-1', 'UNION_1'), (:id, 'st-george', 'line-1', 'STG_1');
            """, new MapSqlParameterSource("id", importId));
    }

    private void scheduleImport(String source, String line, String station, int first, int last) {
        LocalDate start = LocalDate.parse("2026-10-20");
        LocalDate end = LocalDate.parse("2026-12-10");
        regional.replace(new RegionalGtfsScheduleImport(
            source, "https://example.test/" + source + ".zip", start, end,
            List.of(new RegionalGtfsScheduleImport.Service("ALL", true, true, true, true, true, true, true, start, end)),
            List.of(),
            List.of(
                departure("union", line, "T1", first),
                departure(station, line, "T1", first + 600),
                departure("union", line, "T2", last - 1000),
                departure(station, line, "T2", last)
            )
        ), OffsetDateTime.parse("2026-10-20T12:00:00Z"));
    }

    private static RegionalGtfsScheduleImport.Departure departure(String station, String line, String trip, int seconds) {
        return new RegionalGtfsScheduleImport.Departure(station, line, "ALL", trip, "", "Union", seconds, "", null);
    }

    private Map<LocalDate, RolledDay> rows(String networkId) {
        Map<LocalDate, RolledDay> rows = new LinkedHashMap<>();
        jdbc.query("""
            select rolled.observation_date, rolled.observed_minutes, rolled.rolled_up_at,
                   lower(piece) starts_at, upper(piece) ends_at
            from reliability_observation_windows rolled
            left join lateral unnest(rolled.covered) piece on true
            where rolled.network_id = :networkId
            order by rolled.observation_date, starts_at
            """, new MapSqlParameterSource("networkId", networkId), rs -> {
                LocalDate date = rs.getObject("observation_date", LocalDate.class);
                RolledDay day = rows.computeIfAbsent(date, ignored -> {
                    try {
                        return new RolledDay(date, new java.util.ArrayList<>(), rs.getLong("observed_minutes"),
                            rs.getObject("rolled_up_at", OffsetDateTime.class));
                    } catch (java.sql.SQLException exception) {
                        throw new IllegalStateException(exception);
                    }
                });
                OffsetDateTime start = rs.getObject("starts_at", OffsetDateTime.class);
                if (start != null) day.pieces().add(new TimeRange(start, rs.getObject("ends_at", OffsetDateTime.class)));
            });
        return rows;
    }

    private static List<String> instants(List<TimeRange> ranges) {
        return ranges.stream().map(range -> range.start().toInstant() + "/" + range.end().toInstant()).toList();
    }

    private static OffsetDateTime odt(String value) {
        return OffsetDateTime.parse(value);
    }

    private record RolledDay(LocalDate date, List<TimeRange> pieces, long minutes, OffsetDateTime rolledUpAt) {}

    private static boolean isDatabaseAvailable() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 1000);
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    private static DataSource createDataSource() {
        return new DriverManagerDataSource(
            System.getProperty("spring.datasource.url", System.getenv().getOrDefault("SPRING_DATASOURCE_URL", DEFAULT_URL)),
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
    }

    static final class MutableClock extends Clock {
        private volatile Instant instant = TODAY_NOON;

        void set(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean
        DataSource dataSource() {
            return createDataSource();
        }

        @Bean
        PlatformTransactionManager transactionManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }

        @Bean
        NamedParameterJdbcTemplate namedParameterJdbcTemplate(DataSource dataSource) {
            return new NamedParameterJdbcTemplate(dataSource);
        }

        @Bean
        MutableClock clock() {
            return new MutableClock();
        }

        @Bean
        ReliabilityObservationRollup observationRollup(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityObservationRollup(jdbc, clock);
        }

        @Bean
        ReliabilityScheduleCapture scheduleCapture(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityScheduleCapture(jdbc, clock);
        }

        @Bean
        ReliabilityEpisodeSource episodeSource(NamedParameterJdbcTemplate jdbc) {
            return new ReliabilityEpisodeSource(jdbc);
        }

        @Bean
        ReliabilityDerivationService derivationService(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture capture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource,
            PlatformTransactionManager txManager,
            MutableClock clock
        ) {
            return new ReliabilityDerivationService(jdbc, capture, observationRollup, episodeSource, txManager, clock);
        }

        @Bean
        ReliabilityRepository reliabilityRepository(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture capture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource,
            MutableClock clock
        ) {
            return new ReliabilityRepository(jdbc, capture, observationRollup, episodeSource, clock);
        }

        @Bean
        RegionalGtfsScheduleRepository regionalRepository(NamedParameterJdbcTemplate jdbc, ReliabilityScheduleCapture capture) {
            return new RegionalGtfsScheduleRepository(jdbc, capture);
        }
    }
}
