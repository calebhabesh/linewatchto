package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DerivationStatus;
import com.calebhabesh.linewatch.reliability.ReliabilityDerivationService.DeriveResult;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.AggregateRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.BreakdownRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRepository.ReliabilityAggregation;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
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

/** Plan 17 A5 integration tests against the local PostGIS test database (skips when unreachable). */
@SpringJUnitConfig(classes = ReliabilityDerivationIntegrationTest.TestConfig.class)
class ReliabilityDerivationIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";
    private static final Instant TODAY_NOON = Instant.parse("2026-11-24T17:00:00Z"); // 12:00 EST
    private static final LocalDate TODAY = LocalDate.parse("2026-11-24");
    private static final LocalDate YESTERDAY = LocalDate.parse("2026-11-23");

    @Autowired private ReliabilityDerivationService derivation;
    @Autowired private ReliabilityObservationRollup rollup;
    @Autowired private ReliabilityRepository repository;
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
            delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts');
            delete from alert_active_periods where alert_id like 'a5-%';
            delete from snapshots where alert_id like 'a5-%';
            delete from alert_stations where alert_id like 'a5-%';
            delete from alerts where id like 'a5-%';
            delete from regional_alert_snapshots where alert_id like 'a5-%';
            delete from regional_alerts where id like 'a5-%';
            """);
    }

    @Test
    void episodeAcrossMidnightIsCountedOnceWithMinutesSplitAndDisjointSpansNeverDoubleCount() {
        LocalDate d1 = LocalDate.parse("2026-11-20");
        LocalDate d2 = LocalDate.parse("2026-11-21");
        seedPolls("alerts", "2026-11-19 23:55:00-05", "2026-11-22 05:00:00-05");
        rollup.rollUp("ttc");

        // Overlapping spans past midnight: d1 runs 06:00..02:30; d2 starts at 02:00 (30m overlap clipped to 02:30)
        seedScheduleDay("ttc", "ttc", d1);
        seedScheduleDay("ttc", "ttc", d2);
        seedSpan("ttc", "ttc", "line-1", "", d1, "2026-11-20 06:00:00-05", "2026-11-21 02:30:00-05");
        seedSpan("ttc", "ttc", "line-1", "", d2, "2026-11-21 02:00:00-05", "2026-11-22 01:30:00-05");
        seedSpan("ttc", "ttc", "line-1", "bloor-yonge", d1, "2026-11-20 06:00:00-05", "2026-11-21 02:30:00-05");
        seedSpan("ttc", "ttc", "line-1", "bloor-yonge", d2, "2026-11-21 02:00:00-05", "2026-11-22 01:30:00-05");

        // Single delay from 01:30 on Nov 21 (inside d1's span) to 03:30 on Nov 21 (inside d2's disjoint span):
        // 60m on d1 (01:30..02:30) + 60m on d2 (02:30..03:30) = 120m total, counted ONCE.
        seedTtcAlert("a5-overnight", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-overnight", "line-1", "delay", true, "2026-11-21 01:30:00-05");
        seedTtcSnapshot("a5-overnight", "line-1", "delay", false, "2026-11-21 03:30:00-05");

        DeriveResult result = derivation.deriveRange(1, "ttc", d1, d2, true);
        assertThat(result.episodesUpserted()).isEqualTo(1);

        // One episode row with 120 counted minutes.
        Map<String, Object> ep = jdbc.queryForMap(
            "select counted_minutes, completed, cause from reliability_episodes where alert_id = 'a5-overnight'", Map.of());
        assertThat(((Number) ep.get("counted_minutes")).intValue()).isEqualTo(120);
        assertThat(ep.get("completed")).isEqualTo(true);
        assertThat(ep.get("cause")).isEqualTo("TECHNICAL_PROBLEM");

        // Daily rows split 60m on d1 and 60m on d2 (total 120m, NOT 150m from the 30m overlap!).
        List<Map<String, Object>> days = jdbc.queryForList("""
            select service_date, scheduled_minutes, observed_minutes, impacted_minutes, incident_minutes
            from reliability_line_days
            where methodology_version = 1 and network_id = 'ttc' and line_id = 'line-1' and impact_group = 'all'
            order by service_date
            """, Map.of());
        assertThat(days).hasSize(2);
        assertThat(((Number) days.get(0).get("impacted_minutes")).intValue()).isEqualTo(60);
        assertThat(((Number) days.get(1).get("impacted_minutes")).intValue()).isEqualTo(60);
        assertThat(((Number) days.get(0).get("observed_minutes")).intValue()).isEqualTo(1230); // 20h30m
        assertThat(((Number) days.get(1).get("observed_minutes")).intValue()).isEqualTo(1380); // 23h (clipped from 23h30m)

        // Read model over d1..d2 counts 1 incident, 120m impacted, 120m median.
        ReliabilityAggregation served = repository.aggregateServiceDates(
            "ttc", null, d1, d2, odt("2026-11-22T01:30:00-05:00"));
        assertThat(served.rows()).singleElement().satisfies(row -> {
            assertThat(row.incidents()).isEqualTo(1);
            assertThat(row.serviceImpactMinutes()).isEqualTo(120);
            assertThat(row.observedServiceMinutes()).isEqualTo(2610);
            assertThat(row.medianDurationMinutes()).isEqualTo(120L);
        });
    }

    @Test
    void lateClearWithinRederiveWindowUpdatesEpisodeAndPreservesEarlierCountedRanges() {
        // 20 days of history: Nov 04..Nov 23
        LocalDate first = LocalDate.parse("2026-11-04");
        seedPolls("alerts", "2026-11-03 23:55:00-05", "2026-11-24 04:00:00-05");
        rollup.rollUp("ttc");
        for (LocalDate d = first; !d.isAfter(YESTERDAY); d = d.plusDays(1)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d + " 22:00:00-05");
        }

        // Long-running RSZ opened Nov 04 10:00 (20 days ago, outside the 14-day re-derive window!)
        seedTtcAlert("a5-long-rsz", "line-1", "reduced-speed-zone", "MAINTENANCE", List.of("union"), true);
        seedTtcSnapshot("a5-long-rsz", "line-1", "reduced-speed-zone", true, "2026-11-04 10:00:00-05");

        // Initial derive through Nov 22 while RSZ is still open.
        clock.set(Instant.parse("2026-11-23T17:00:00Z"));
        derivation.deriveIncremental("ttc");

        Map<String, Object> beforeClear = jdbc.queryForMap(
            "select counted_minutes, completed, closed_at from reliability_episodes where alert_id = 'a5-long-rsz'", Map.of());
        assertThat(beforeClear.get("completed")).isEqualTo(false);
        assertThat(beforeClear.get("closed_at")).isNull();
        // Nov 04: 12h (720m) + 18 full days (Nov 05..Nov 22 * 16h = 17,280m) = 18,000m
        assertThat(((Number) beforeClear.get("counted_minutes")).intValue()).isEqualTo(18_000);

        // Now RSZ clears on Nov 23 at 14:00 (8h = 480m on Nov 23), and nightly derive runs on Nov 24
        // re-deriving ONLY the last 14 days (Nov 10..Nov 23).
        seedTtcSnapshot("a5-long-rsz", "line-1", "reduced-speed-zone", false, "2026-11-23 14:00:00-05");
        clock.set(TODAY_NOON);
        DeriveResult incremental = derivation.deriveIncremental("ttc");
        assertThat(incremental.fromDate()).isEqualTo(LocalDate.parse("2026-11-10"));
        assertThat(incremental.toDate()).isEqualTo(YESTERDAY);

        // Episode must now be completed with closed_at set AND preserve Nov 04..Nov 09 counted ranges!
        Map<String, Object> afterClear = jdbc.queryForMap(
            "select counted_minutes, completed, closed_at from reliability_episodes where alert_id = 'a5-long-rsz'", Map.of());
        assertThat(afterClear.get("completed")).isEqualTo(true);
        assertThat(afterClear.get("closed_at")).isNotNull();
        assertThat(((Number) afterClear.get("counted_minutes")).intValue()).isEqualTo(18_480);
    }

    @Test
    void revisedClosurePeriodWithin14DaysRemovesObsoleteEpisodeAndUpdatesDailyMinutes() {
        LocalDate d1 = LocalDate.parse("2026-11-20");
        LocalDate d2 = LocalDate.parse("2026-11-21");
        seedPolls("alerts", "2026-11-19 23:55:00-05", "2026-11-22 04:00:00-05");
        rollup.rollUp("ttc");
        for (LocalDate d : List.of(d1, d2)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d.plusDays(1) + " 02:00:00-05");
        }

        seedTtcAlert("a5-closure", "line-1", "planned-closure", "MAINTENANCE", List.of("union"), true);
        seedTtcSnapshot("a5-closure", "line-1", "planned-closure", true, "2026-11-19 12:00:00-05");
        seedClosurePeriod("a5-closure", "p1", "2026-11-20 23:00:00-05", "2026-11-21 02:00:00-05", 0); // 180m
        seedClosurePeriod("a5-closure", "p2", "2026-11-21 23:00:00-05", "2026-11-22 02:00:00-05", 1); // 180m

        derivation.deriveRange(1, "ttc", d1, d2, true);
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_episodes where alert_id = 'a5-closure'", Map.of(), Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject(
            "select sum(impacted_minutes) from reliability_line_days where line_id = 'line-1' and impact_group = 'all'",
            Map.of(), Integer.class)).isEqualTo(360);

        // Revise closure periods: cancel p2 entirely and shorten p1 to 1 hour (23:00..00:00).
        jdbc.update("delete from alert_active_periods where alert_id = 'a5-closure'", Map.of());
        seedClosurePeriod("a5-closure", "p1", "2026-11-20 23:00:00-05", "2026-11-21 00:00:00-05", 0); // 60m

        derivation.deriveRange(1, "ttc", d1, d2, true);
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_episodes where alert_id = 'a5-closure'", Map.of(), Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "select sum(impacted_minutes) from reliability_line_days where line_id = 'line-1' and impact_group = 'all'",
            Map.of(), Integer.class)).isEqualTo(60);
    }

    @Test
    void combinesDerivedDaysWithLiveTodaySliceAndDeduplicatesSpanningEpisodes() {
        LocalDate d1 = LocalDate.parse("2026-11-22");
        LocalDate d2 = YESTERDAY;
        seedPolls("alerts", "2026-11-21 23:55:00-05", "2026-11-24 12:00:00-05");
        rollup.rollUp("ttc");
        for (LocalDate d : List.of(d1, d2, TODAY)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d + " 22:00:00-05");
        }

        // Episode 1: completed on Nov 22 (30m)
        seedTtcAlert("a5-past", "line-1", "delay", "MEDICAL_EMERGENCY", List.of("union"), false);
        seedTtcSnapshot("a5-past", "line-1", "delay", true, "2026-11-22 09:00:00-05");
        seedTtcSnapshot("a5-past", "line-1", "delay", false, "2026-11-22 09:30:00-05");

        // Episode 2: spans from yesterday (Nov 23 20:00) into today and is STILL active at 12:00 EST!
        seedTtcAlert("a5-spanning", "line-1", "reduced-speed-zone", "MAINTENANCE", List.of("union"), true);
        seedTtcSnapshot("a5-spanning", "line-1", "reduced-speed-zone", true, "2026-11-23 20:00:00-05");

        // Episode 3: opened today at 11:00 EST and STILL active at 12:00 EST (60m so far)
        seedTtcAlert("a5-today-active", "line-1", "suspension", "POLICE_ACTIVITY", List.of("union"), true);
        seedTtcSnapshot("a5-today-active", "line-1", "suspension", true, "2026-11-24 11:00:00-05");

        // Derive through yesterday (Nov 23).
        derivation.deriveIncremental("ttc");

        OffsetDateTime until = OffsetDateTime.ofInstant(TODAY_NOON, ZoneOffset.UTC);
        ReliabilityAggregation served = repository.aggregateServiceDates("ttc", null, d1, TODAY, until);
        ReliabilityAggregation reference = repository.aggregate("ttc", null, ReliabilityObservationRollup.dayStart(d1), until);

        // Spanning episode must be counted ONCE (3 total incidents, 2 active), matching aggregate exactly!
        assertThat(served.rows()).singleElement().satisfies(row -> {
            assertThat(row.incidents()).isEqualTo(3);
            assertThat(row.activeIncidents()).isEqualTo(2);
            assertThat(row.medianDurationMinutes()).isEqualTo(30L);
        });
        assertThat(served).isEqualTo(reference);
    }

    @Test
    void rebuildAndSwitchBuildsNewVersionAtomicallyAndDeletesOldVersion() {
        LocalDate d1 = LocalDate.parse("2026-11-22");
        seedPolls("alerts", "2026-11-21 23:55:00-05", "2026-11-24 04:00:00-05");
        seedPolls("metrolinx-alerts", "2026-11-21 23:55:00-05", "2026-11-24 04:00:00-05");
        rollup.rollUp("ttc");
        rollup.rollUp("regional");
        for (LocalDate d : List.of(d1, YESTERDAY)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d + " 22:00:00-05");
            seedScheduleDay("regional", "go", d);
            seedScheduleDay("regional", "up", d);
            seedSpan("regional", "go", "regional-lw", "", d, d + " 06:00:00-05", d + " 22:00:00-05");
        }
        seedTtcAlert("a5-switch", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("union"), false);
        seedTtcSnapshot("a5-switch", "line-1", "delay", true, "2026-11-23 10:00:00-05");
        seedTtcSnapshot("a5-switch", "line-1", "delay", false, "2026-11-23 10:45:00-05");

        derivation.deriveIncremental("ttc");
        derivation.deriveIncremental("regional");
        assertThat(derivation.currentMethodologyVersion()).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_line_days where methodology_version = 1", Map.of(), Integer.class)).isPositive();

        // Rebuild into v2 and switch atomically.
        derivation.rebuildAndSwitch(2);

        assertThat(derivation.currentMethodologyVersion()).isEqualTo(2);
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_line_days where methodology_version = 1", Map.of(), Integer.class)).isZero();
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_episodes where methodology_version = 1", Map.of(), Integer.class)).isZero();
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_derivations where methodology_version = 1", Map.of(), Integer.class)).isZero();
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_line_days where methodology_version = 2", Map.of(), Integer.class)).isPositive();
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_episodes where methodology_version = 2", Map.of(), Integer.class)).isEqualTo(1);

        // Serving now reads v2 seamlessly.
        ReliabilityAggregation served = repository.aggregateServiceDates(
            "ttc", null, d1, YESTERDAY, odt("2026-11-23T22:00:00-05:00"));
        assertThat(served.rows()).singleElement().satisfies(row -> {
            assertThat(row.incidents()).isEqualTo(1);
            assertThat(row.serviceImpactMinutes()).isEqualTo(45);
        });
    }

    @Test
    void stationDaysAndFullParityMatchAggregateForTtcAndRegionalIncludingBranchAndInterchangeStations() {
        LocalDate d1 = LocalDate.parse("2026-11-18");
        LocalDate d2 = LocalDate.parse("2026-11-19");
        LocalDate d3 = LocalDate.parse("2026-11-20"); // polling outage day -> excluded gap!
        LocalDate d4 = LocalDate.parse("2026-11-21");
        seedPolls("alerts", "2026-11-17 23:55:00-05", "2026-11-19 23:50:00-05");
        seedPolls("alerts", "2026-11-21 05:00:00-05", "2026-11-22 04:00:00-05");
        seedPolls("metrolinx-alerts", "2026-11-17 23:55:00-05", "2026-11-19 23:50:00-05");
        seedPolls("metrolinx-alerts", "2026-11-21 05:00:00-05", "2026-11-22 04:00:00-05");
        rollup.rollUp("ttc");
        rollup.rollUp("regional");

        for (LocalDate d : List.of(d1, d2, d3, d4)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d + " 23:00:00-05");
            seedSpan("ttc", "ttc", "line-2", "", d, d + " 06:00:00-05", d + " 23:00:00-05");
            // Interchange station on both lines
            seedSpan("ttc", "ttc", "line-1", "bloor-yonge", d, d + " 06:00:00-05", d + " 23:00:00-05");
            seedSpan("ttc", "ttc", "line-2", "bloor-yonge", d, d + " 06:00:00-05", d + " 23:00:00-05");
            // Shorter branch station span (08:00..20:00)
            seedSpan("ttc", "ttc", "line-1", "vaughan-metropolitan-centre", d, d + " 08:00:00-05", d + " 20:00:00-05");

            seedScheduleDay("regional", "go", d);
            seedScheduleDay("regional", "up", d);
            seedSpan("regional", "go", "regional-lw", "", d, d + " 06:00:00-05", d + " 23:00:00-05");
            seedSpan("regional", "go", "regional-lw", "union", d, d + " 06:00:00-05", d + " 23:00:00-05");
            seedSpan("regional", "up", "regional-up", "", d, d + " 06:00:00-05", d + " 23:00:00-05");
        }

        // TTC overlapping delay + suspension + limited-service + early-morning alert outside branch span
        seedTtcAlert("a5-ttc-d1", "line-1", "delay", "MEDICAL_EMERGENCY", List.of("bloor-yonge", "vaughan-metropolitan-centre"), false);
        seedTtcSnapshot("a5-ttc-d1", "line-1", "delay", true, "2026-11-18 09:00:00-05");
        seedTtcSnapshot("a5-ttc-d1", "line-1", "delay", false, "2026-11-18 09:40:00-05");

        seedTtcAlert("a5-ttc-s1", "line-1", "suspension", "POLICE_ACTIVITY", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-ttc-s1", "line-1", "suspension", true, "2026-11-18 09:20:00-05");
        seedTtcSnapshot("a5-ttc-s1", "line-1", "suspension", false, "2026-11-18 10:00:00-05");

        seedTtcAlert("a5-ttc-early", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("vaughan-metropolitan-centre"), false);
        seedTtcSnapshot("a5-ttc-early", "line-1", "delay", true, "2026-11-19 06:30:00-05");
        seedTtcSnapshot("a5-ttc-early", "line-1", "delay", false, "2026-11-19 07:00:00-05");

        seedTtcAlert("a5-ttc-l2", "line-2", "limited-service", "MAINTENANCE", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-ttc-l2", "line-2", "limited-service", true, "2026-11-21 14:00:00-05");
        seedTtcSnapshot("a5-ttc-l2", "line-2", "limited-service", false, "2026-11-21 15:00:00-05");

        // Alert during polling outage day (d3) must not count
        seedTtcAlert("a5-ttc-outage", "line-1", "suspension", "OTHER_CAUSE", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-ttc-outage", "line-1", "suspension", true, "2026-11-20 12:00:00-05");
        seedTtcSnapshot("a5-ttc-outage", "line-1", "suspension", false, "2026-11-20 13:00:00-05");

        // Regional delay + planned closure
        seedRegionalAlert("a5-reg-d1", "regional-lw", "delay", null, null, false);
        seedRegionalSnapshot("a5-reg-d1", "regional-lw", "delay", "[\"union\"]", true, "2026-11-19 10:00:00-05");
        seedRegionalSnapshot("a5-reg-d1", "regional-lw", "delay", "[\"union\"]", false, "2026-11-19 10:35:00-05");

        seedRegionalAlert("a5-reg-pc1", "regional-lw", "planned-closure",
            "2026-11-21 12:00:00-05", "2026-11-21 14:00:00-05", false);
        seedRegionalSnapshot("a5-reg-pc1", "regional-lw", "planned-closure", "[\"union\"]", true, "2026-11-20 10:00:00-05");

        derivation.deriveRange(1, "ttc", d1, d4, true);
        derivation.deriveRange(1, "regional", d1, d4, true);

        // Outage day (d3) must have NO derived day rows (gap, never zero disruption).
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_line_days where service_date = :d",
            Map.of("d", d3), Integer.class)).isZero();

        OffsetDateTime since = ReliabilityObservationRollup.dayStart(d1);
        OffsetDateTime until = odt("2026-11-21T23:00:00-05:00");

        // Exact parity for TTC whole network, interchange station, branch station, and regional network + station!
        assertThat(repository.aggregateServiceDates("ttc", null, d1, d4, until))
            .isEqualTo(repository.aggregate("ttc", null, since, until));
        assertThat(repository.aggregateServiceDates("ttc", "bloor-yonge", d1, d4, until))
            .isEqualTo(repository.aggregate("ttc", "bloor-yonge", since, until));
        ReliabilityAggregation branchServed = repository.aggregateServiceDates("ttc", "vaughan-metropolitan-centre", d1, d4, until);
        ReliabilityAggregation branchRef = repository.aggregate("ttc", "vaughan-metropolitan-centre", since, until);
        assertThat(branchServed).isEqualTo(branchRef);
        // Early-morning alert 06:30..07:00 is outside vaughan's 08:00..20:00 span -> only 1 incident counted!
        assertThat(branchServed.rows()).singleElement().extracting(AggregateRow::incidents).isEqualTo(1L);

        assertThat(repository.aggregateServiceDates("regional", null, d1, d4, until))
            .isEqualTo(repository.aggregate("regional", null, since, until));
        assertThat(repository.aggregateServiceDates("regional", "union", d1, d4, until))
            .isEqualTo(repository.aggregate("regional", "union", since, until));

        // Breakdown folds limited-service into delay in v1.
        ReliabilityAggregation ttcAll = repository.aggregateServiceDates("ttc", null, d1, d4, until);
        assertThat(ttcAll.breakdown()).extracting(BreakdownRow::impactKind).containsExactlyInAnyOrder("delay", "suspension");

        // Derivation status recorded cleanly without error text in public record.
        DerivationStatus status = derivation.derivationStatus(1, "ttc").orElseThrow();
        assertThat(status.status()).isEqualTo("success");
        assertThat(status.derivedThrough()).isEqualTo(d4);
        assertThat(status.consecutiveFailures()).isZero();
    }

    @Test
    void lateNightBeforeDeriveJobIncludesOngoingYesterdayServiceInLiveTail() {
        // 01:00 EST on Nov 24 (06:00 UTC), before the 04:30 nightly derive job runs.
        Instant oneAmToronto = Instant.parse("2026-11-24T06:00:00Z");
        LocalDate d1 = LocalDate.parse("2026-11-21");
        LocalDate d2 = LocalDate.parse("2026-11-22"); // derived_through
        LocalDate d3 = YESTERDAY;                     // Nov 23: service runs until 02:00 Nov 24 (still ongoing!)

        seedPolls("alerts", "2026-11-20 23:55:00-05", "2026-11-24 01:00:00-05");
        rollup.rollUp("ttc");
        for (LocalDate d : List.of(d1, d2, d3, TODAY)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 06:00:00-05", d.plusDays(1) + " 02:00:00-05");
        }
        // Delay on Nov 22 (derived) and an active late-night delay on Nov 23's span at 00:30..01:00 Nov 24 (live tail)
        seedTtcAlert("a5-night-derived", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("union"), false);
        seedTtcSnapshot("a5-night-derived", "line-1", "delay", true, "2026-11-22 10:00:00-05");
        seedTtcSnapshot("a5-night-derived", "line-1", "delay", false, "2026-11-22 10:20:00-05");

        seedTtcAlert("a5-night-live", "line-1", "suspension", "POLICE_ACTIVITY", List.of("union"), true);
        seedTtcSnapshot("a5-night-live", "line-1", "suspension", true, "2026-11-24 00:30:00-05");

        // Derived only through Nov 22 (d2).
        derivation.deriveRange(1, "ttc", d1, d2, true);
        clock.set(oneAmToronto);

        OffsetDateTime until = OffsetDateTime.ofInstant(oneAmToronto, ZoneOffset.UTC);
        ReliabilityAggregation served = repository.aggregateServiceDates("ttc", null, d1, TODAY, until);
        ReliabilityAggregation reference = repository.aggregate("ttc", null, ReliabilityObservationRollup.dayStart(d1), until);

        assertThat(served.rows()).singleElement().satisfies(row -> {
            assertThat(row.incidents()).isEqualTo(2);
            assertThat(row.activeIncidents()).isEqualTo(1);
            assertThat(row.serviceImpactMinutes()).isEqualTo(50);
        });
        assertThat(served).isEqualTo(reference);
    }

    @Test
    void regionalAlertWhoseStationIdsChangeBeforeClearingStillClosesCleanlyForOldStation() {
        LocalDate d1 = LocalDate.parse("2026-11-22");
        LocalDate d2 = YESTERDAY;
        seedPolls("metrolinx-alerts", "2026-11-21 23:55:00-05", "2026-11-24 04:00:00-05");
        rollup.rollUp("regional");
        for (LocalDate d : List.of(d1, d2)) {
            seedScheduleDay("regional", "go", d);
            seedScheduleDay("regional", "up", d);
            seedSpan("regional", "go", "regional-st", "", d, d + " 06:00:00-05", d + " 22:00:00-05");
            seedSpan("regional", "go", "regional-st", "union", d, d + " 06:00:00-05", d + " 22:00:00-05");
        }
        // Alert opened on Nov 20 with ["stouffville", "union"], updated to ["stouffville", "unionville"],
        // then cleared on Nov 20 — must NOT stay open into Nov 22..23 when querying station=union!
        seedRegionalAlert("a5-reg-station-change", "regional-st", "delay", null, null, false);
        seedRegionalSnapshot("a5-reg-station-change", "regional-st", "delay", "[\"stouffville\", \"union\"]", true, "2026-11-20 12:00:00-05");
        seedRegionalSnapshot("a5-reg-station-change", "regional-st", "delay", "[\"stouffville\", \"unionville\"]", true, "2026-11-20 13:00:00-05");
        seedRegionalSnapshot("a5-reg-station-change", "regional-st", "delay", "[\"stouffville\", \"unionville\"]", false, "2026-11-20 14:00:00-05");

        derivation.deriveRange(1, "regional", d1, d2, true);
        OffsetDateTime until = odt("2026-11-23T22:00:00-05:00");
        assertThat(repository.aggregateServiceDates("regional", "union", d1, d2, until).rows()).isEmpty();
        assertThat(repository.aggregate("regional", "union", ReliabilityObservationRollup.dayStart(d1), until).rows()).isEmpty();
    }

    private void seedPolls(String runType, String fromTs, String toTs) {
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select :runType, 'success', at, at
            from generate_series(cast(:fromTs as timestamptz), cast(:toTs as timestamptz), interval '5 minutes') at
            """, new MapSqlParameterSource()
                .addValue("runType", runType)
                .addValue("fromTs", fromTs)
                .addValue("toTs", toTs));
    }

    private void seedScheduleDay(String networkId, String sourceSystem, LocalDate date) {
        jdbc.update("""
            insert into reliability_schedule_days (network_id, source_system, service_date, import_id, feed_version, source_kind, captured_at)
            values (:networkId, :sourceSystem, :date, 1, 'test', 'import', now())
            on conflict do nothing
            """, new MapSqlParameterSource()
                .addValue("networkId", networkId)
                .addValue("sourceSystem", sourceSystem)
                .addValue("date", date));
    }

    private void seedSpan(String networkId, String sourceSystem, String lineId, String stationId, LocalDate date, String startTs, String endTs) {
        jdbc.update("""
            insert into reliability_service_spans (network_id, line_id, station_id, service_date, source_system, starts_at, ends_at)
            values (:networkId, :lineId, :stationId, :date, :sourceSystem, cast(:startTs as timestamptz), cast(:endTs as timestamptz))
            """, new MapSqlParameterSource()
                .addValue("networkId", networkId)
                .addValue("lineId", lineId)
                .addValue("stationId", stationId)
                .addValue("date", date)
                .addValue("sourceSystem", sourceSystem)
                .addValue("startTs", startTs)
                .addValue("endTs", endTs));
    }

    private void seedTtcAlert(String id, String lineId, String impactKind, String cause, List<String> stations, boolean active) {
        String type = "planned-closure".equals(impactKind) ? "planned-closure" : "active-alert";
        String severity = switch (impactKind) {
            case "suspension" -> "suspension";
            case "planned-closure" -> "planned";
            default -> "delay";
        };
        jdbc.update("""
            insert into alerts (id, source_id, type, severity, title, description, active, line_id, cause, impact_kind)
            values (:id, :id, :type, :severity, 'Test alert', 'Test description', :active, :lineId, :cause, :impactKind)
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("type", type)
                .addValue("severity", severity)
                .addValue("active", active)
                .addValue("lineId", lineId)
                .addValue("cause", cause)
                .addValue("impactKind", impactKind));
        for (int i = 0; i < stations.size(); i++) {
            jdbc.update("""
                insert into alert_stations (alert_id, station_id, sort_order)
                values (:alertId, :stationId, :sortOrder)
                """, new MapSqlParameterSource()
                    .addValue("alertId", id)
                    .addValue("stationId", stations.get(i))
                    .addValue("sortOrder", i));
        }
    }

    private void seedTtcSnapshot(String alertId, String lineId, String impactKind, boolean active, String snapshotTs) {
        jdbc.update("""
            insert into snapshots (alert_id, source_id, line_id, severity, description, snapshot_time, active, impact_kind)
            values (:alertId, :alertId, :lineId, 'delay', 'Test snapshot', cast(:ts as timestamptz), :active, :impactKind)
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("lineId", lineId)
                .addValue("ts", snapshotTs)
                .addValue("active", active)
                .addValue("impactKind", impactKind));
    }

    private void seedClosurePeriod(String alertId, String periodId, String startsAt, String endsAt, int sortOrder) {
        jdbc.update("""
            insert into alert_active_periods (alert_id, source_period_id, starts_at, ends_at, sort_order, source_current_continuous)
            values (:alertId, :periodId, cast(:startsAt as timestamptz), cast(:endsAt as timestamptz), :sortOrder, false)
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("periodId", periodId)
                .addValue("startsAt", startsAt)
                .addValue("endsAt", endsAt)
                .addValue("sortOrder", sortOrder));
    }

    private void seedRegionalAlert(String id, String lineId, String impactKind, String periodStart, String periodEnd, boolean active) {
        jdbc.update("""
            insert into regional_alerts (
                id, source_system, source_id, line_id, impact_kind, title, description,
                active, active_period_start, active_period_end, source_updated_at, created_at, updated_at
            ) values (
                :id, 'go', :id, :lineId, :impactKind, 'Test GO alert', 'Test body',
                :active, cast(:periodStart as timestamptz), cast(:periodEnd as timestamptz), now(), now(), now()
            )
            """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("lineId", lineId)
                .addValue("impactKind", impactKind)
                .addValue("active", active)
                .addValue("periodStart", periodStart)
                .addValue("periodEnd", periodEnd));
    }

    private void seedRegionalSnapshot(String alertId, String lineId, String impactKind, String stationIdsJson, boolean active, String snapshotTs) {
        jdbc.update("""
            insert into regional_alert_snapshots (alert_id, line_id, impact_kind, title, station_ids, active, snapshot_time)
            values (:alertId, :lineId, :impactKind, 'Test GO alert', cast(:stationIds as jsonb), :active, cast(:ts as timestamptz))
            """, new MapSqlParameterSource()
                .addValue("alertId", alertId)
                .addValue("lineId", lineId)
                .addValue("impactKind", impactKind)
                .addValue("stationIds", stationIdsJson)
                .addValue("active", active)
                .addValue("ts", snapshotTs));
    }

    @Test
    void v2UnionsOverlappingStationsExcludesSlowZonesFromServiceStoppedAndFlagsPlanned() {
        LocalDate d1 = LocalDate.parse("2026-11-22");
        seedPolls("alerts", "2026-11-21 23:55:00-05", "2026-11-23 04:00:00-05");
        rollup.rollUp("ttc");
        seedScheduleDay("ttc", "ttc", d1);
        // Line 1 has 10 scheduled stations for clean 10%-per-station math, 10h = 600m service day (08:00..18:00).
        seedSpan("ttc", "ttc", "line-1", "", d1, "2026-11-22 08:00:00-05", "2026-11-22 18:00:00-05");
        List<String> line1Stations = List.of("finch", "york-mills", "eglinton", "bloor-yonge", "union",
            "st-george", "spadina", "lawrence", "davisville", "vaughan-metropolitan-centre");
        for (String st : line1Stations) {
            seedSpan("ttc", "ttc", "line-1", st, d1, "2026-11-22 08:00:00-05", "2026-11-22 18:00:00-05");
        }

        // All-day 2-station slow zone (08:00..18:00 = 600m unique, 600 * 2/10 = 120.0 weighted min = 20.0% share).
        seedTtcAlert("a5-v2-rsz", "line-1", "reduced-speed-zone", "MAINTENANCE", List.of("finch", "york-mills"), true);
        seedTtcSnapshot("a5-v2-rsz", "line-1", "reduced-speed-zone", true, "2026-11-22 07:00:00-05");

        // Two overlapping delays:
        // Delay 1: {eglinton, bloor-yonge, union} 10:00..11:00 (30m alone -> 9.0, 30m overlap)
        // Delay 2 (limited-service -> Delays class): {bloor-yonge, union, st-george} 10:30..11:30 (30m overlap union=4 -> 12.0, 30m alone -> 9.0)
        // Delays total weighted = 30.0 min (5.0% of 600m), unique = 90m.
        seedTtcAlert("a5-v2-delay1", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("eglinton", "bloor-yonge", "union"), false);
        seedTtcSnapshot("a5-v2-delay1", "line-1", "delay", true, "2026-11-22 10:00:00-05");
        seedTtcSnapshot("a5-v2-delay1", "line-1", "delay", false, "2026-11-22 11:00:00-05");
        seedTtcAlert("a5-v2-delay2", "line-1", "limited-service", "MAINTENANCE", List.of("bloor-yonge", "union", "st-george"), false);
        seedTtcSnapshot("a5-v2-delay2", "line-1", "limited-service", true, "2026-11-22 10:30:00-05");
        seedTtcSnapshot("a5-v2-delay2", "line-1", "limited-service", false, "2026-11-22 11:30:00-05");

        // Unplanned suspension (14:00..15:00 = 60m) on 5 stations -> 30.0 weighted min, planned = false.
        seedTtcAlert("a5-v2-susp", "line-1", "suspension", "MEDICAL_EMERGENCY",
            List.of("union", "st-george", "spadina", "lawrence", "davisville"), false);
        seedTtcSnapshot("a5-v2-susp", "line-1", "suspension", true, "2026-11-22 14:00:00-05");
        seedTtcSnapshot("a5-v2-susp", "line-1", "suspension", false, "2026-11-22 15:00:00-05");

        // Planned closure (16:00..17:00 = 60m) on 2 stations -> 12.0 weighted min, planned = true.
        seedTtcAlert("a5-v2-planned", "line-1", "planned-closure", "MAINTENANCE", List.of("spadina", "vaughan-metropolitan-centre"), true);
        seedTtcSnapshot("a5-v2-planned", "line-1", "planned-closure", true, "2026-11-21 12:00:00-05");
        seedClosurePeriod("a5-v2-planned", "p1", "2026-11-22 16:00:00-05", "2026-11-22 17:00:00-05", 0);

        derivation.deriveRange(2, "ttc", d1, d1, true);
        jdbc.update("update reliability_methodology set current_version = 2 where id = 1", Map.of());

        // Check episode metadata: disruption_class, planned flag, station_share.
        List<Map<String, Object>> eps = jdbc.queryForList("""
            select alert_id, disruption_class, planned, station_share
            from reliability_episodes
            where methodology_version = 2 and network_id = 'ttc'
            order by alert_id
            """, Map.of());
        assertThat(eps).hasSize(5);
        Map<String, Map<String, Object>> byAlert = new java.util.HashMap<>();
        for (Map<String, Object> row : eps) byAlert.put((String) row.get("alert_id"), row);

        assertThat(byAlert.get("a5-v2-rsz").get("disruption_class")).isEqualTo("slow-zone");
        assertThat(byAlert.get("a5-v2-rsz").get("planned")).isEqualTo(false);
        assertThat(((Number) byAlert.get("a5-v2-rsz").get("station_share")).doubleValue()).isCloseTo(0.2, org.assertj.core.data.Offset.offset(0.001));

        assertThat(byAlert.get("a5-v2-delay1").get("disruption_class")).isEqualTo("delay");
        assertThat(byAlert.get("a5-v2-delay2").get("disruption_class")).isEqualTo("delay");
        assertThat(byAlert.get("a5-v2-susp").get("disruption_class")).isEqualTo("service-stopped");
        assertThat(byAlert.get("a5-v2-susp").get("planned")).isEqualTo(false);
        assertThat(byAlert.get("a5-v2-planned").get("disruption_class")).isEqualTo("service-stopped");
        assertThat(byAlert.get("a5-v2-planned").get("planned")).isEqualTo(true);

        // Verify served aggregate: Time With Any Alert is 100%, but Service Stopped is only 7.0% (42/600) and 120m unique!
        ReliabilityAggregation served = repository.aggregateServiceDates("ttc", null, d1, d1, odt("2026-11-22T20:00:00-05:00"));
        assertThat(served.methodologyVersion()).isEqualTo(2);
        assertThat(served.rows()).singleElement().satisfies(row -> {
            assertThat(row.serviceImpactPercentage()).isEqualTo(100.0); // Time With Any Alert
            assertThat(row.classes()).hasSize(3);
            var stopped = row.classes().get(0);
            var delays = row.classes().get(1);
            var slowZones = row.classes().get(2);

            assertThat(stopped.disruptionClass()).isEqualTo("service-stopped");
            assertThat(stopped.incidents()).isEqualTo(2); // suspension + planned-closure; NEVER slow zone!
            assertThat(stopped.uniqueMinutes()).isEqualTo(120L);
            assertThat(stopped.weightedMinutes()).isCloseTo(42.0, org.assertj.core.data.Offset.offset(0.1));
            assertThat(stopped.weightedSharePercentage()).isEqualTo(7.0);

            assertThat(delays.disruptionClass()).isEqualTo("delay");
            assertThat(delays.incidents()).isEqualTo(2);
            assertThat(delays.uniqueMinutes()).isEqualTo(90L);
            assertThat(delays.weightedMinutes()).isCloseTo(30.0, org.assertj.core.data.Offset.offset(0.1));
            assertThat(delays.weightedSharePercentage()).isEqualTo(5.0);

            assertThat(slowZones.disruptionClass()).isEqualTo("slow-zone");
            assertThat(slowZones.incidents()).isEqualTo(1);
            assertThat(slowZones.uniqueMinutes()).isEqualTo(600L);
            assertThat(slowZones.weightedMinutes()).isCloseTo(120.0, org.assertj.core.data.Offset.offset(0.1));
            assertThat(slowZones.weightedSharePercentage()).isEqualTo(20.0);
        });
    }

    @Test
    void v2HandlesWholeLineAlertInterchangePerLineDenominatorChangeAndAtomicRebuildSwitch() {
        LocalDate d1 = LocalDate.parse("2026-11-22");
        LocalDate d2 = LocalDate.parse("2026-11-23");
        seedPolls("alerts", "2026-11-21 23:55:00-05", "2026-11-24 04:00:00-05");
        seedPolls("metrolinx-alerts", "2026-11-21 23:55:00-05", "2026-11-24 04:00:00-05");
        rollup.rollUp("ttc");
        rollup.rollUp("regional");

        // TTC Line 1: 4 scheduled stations on d1, 5 scheduled stations on d2 (new station opens on d2!).
        // TTC Line 2: 2 scheduled stations on d1 and d2 (bloor-yonge interchange is on BOTH line-1 and line-2).
        for (LocalDate d : List.of(d1, d2)) {
            seedScheduleDay("ttc", "ttc", d);
            seedSpan("ttc", "ttc", "line-1", "", d, d + " 08:00:00-05", d + " 18:00:00-05");
            for (String st : List.of("finch", "bloor-yonge", "union", "vaughan-metropolitan-centre")) {
                seedSpan("ttc", "ttc", "line-1", st, d, d + " 08:00:00-05", d + " 18:00:00-05");
            }
            seedSpan("ttc", "ttc", "line-2", "", d, d + " 08:00:00-05", d + " 18:00:00-05");
            for (String st : List.of("bloor-yonge", "kipling")) {
                seedSpan("ttc", "ttc", "line-2", st, d, d + " 08:00:00-05", d + " 18:00:00-05");
            }
            seedScheduleDay("regional", "go", d);
            seedScheduleDay("regional", "up", d);
            seedSpan("regional", "go", "regional-le", "", d, d + " 08:00:00-05", d + " 18:00:00-05");
            for (String st : List.of("union", "danforth", "scarborough", "oshawa")) {
                seedSpan("regional", "go", "regional-le", st, d, d + " 08:00:00-05", d + " 18:00:00-05");
            }
        }
        // New station opens on Line 1 on d2 -> denominator changes from 4 to 5!
        seedSpan("ttc", "ttc", "line-1", "eglinton", d2, d2 + " 08:00:00-05", d2 + " 18:00:00-05");

        // Same 1-station (bloor-yonge) 60m delay on Line 1 on d1 (1/4 = 15.0 weighted min) and d2 (1/5 = 12.0 weighted min).
        seedTtcAlert("a5-open-d1", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-open-d1", "line-1", "delay", true, "2026-11-22 10:00:00-05");
        seedTtcSnapshot("a5-open-d1", "line-1", "delay", false, "2026-11-22 11:00:00-05");
        seedTtcAlert("a5-open-d2", "line-1", "delay", "TECHNICAL_PROBLEM", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-open-d2", "line-1", "delay", true, "2026-11-23 10:00:00-05");
        seedTtcSnapshot("a5-open-d2", "line-1", "delay", false, "2026-11-23 11:00:00-05");

        // Interchange bloor-yonge 60m suspension on Line 2 on d1 (1/2 = 30.0 weighted min).
        seedTtcAlert("a5-interchange-l2", "line-2", "suspension", "MEDICAL_EMERGENCY", List.of("bloor-yonge"), false);
        seedTtcSnapshot("a5-interchange-l2", "line-2", "suspension", true, "2026-11-22 12:00:00-05");
        seedTtcSnapshot("a5-interchange-l2", "line-2", "suspension", false, "2026-11-22 13:00:00-05");

        // Whole-line regional alert (empty station_ids = []) on Lakeshore East for 60m on d1 -> share 1.0 = 60.0 weighted min!
        seedRegionalAlert("a5-go-whole", "regional-le", "suspension", null, null, false);
        seedRegionalSnapshot("a5-go-whole", "regional-le", "suspension", "[]", true, "2026-11-22 14:00:00-05");
        seedRegionalSnapshot("a5-go-whole", "regional-le", "suspension", "[]", false, "2026-11-22 15:00:00-05");

        // Step 1: Build v1 first and verify v1 is active.
        derivation.rebuildAndSwitch(1);
        assertThat(derivation.currentMethodologyVersion()).isEqualTo(1);
        ReliabilityAggregation v1Ttc = repository.aggregateServiceDates("ttc", null, d1, d2, odt("2026-11-23T20:00:00-05:00"));
        assertThat(v1Ttc.methodologyVersion()).isEqualTo(1);
        assertThat(v1Ttc.rows().get(0).classes()).isEmpty();

        // Step 2: Build v2 beside v1 and switch atomically.
        derivation.rebuildAndSwitch(2);
        assertThat(derivation.currentMethodologyVersion()).isEqualTo(2);
        assertThat(jdbc.queryForObject(
            "select count(*) from reliability_line_days where methodology_version = 1", Map.of(), Integer.class
        )).isZero();

        // Verify denominator change on opening date for Line 1: 15.0m (d1) + 12.0m (d2) = 27.0m weighted out of 1200m observed!
        List<Double> line1WeightedByDate = jdbc.queryForList("""
            select weighted_impacted_minutes
            from reliability_line_days
            where methodology_version = 2 and network_id = 'ttc' and line_id = 'line-1' and impact_group = 'class:delay'
            order by service_date
            """, Map.of(), Double.class);
        assertThat(line1WeightedByDate).hasSize(2);
        assertThat(line1WeightedByDate.get(0)).isCloseTo(15.0, org.assertj.core.data.Offset.offset(0.01));
        assertThat(line1WeightedByDate.get(1)).isCloseTo(12.0, org.assertj.core.data.Offset.offset(0.01));

        // Verify interchange station counts on each line with each line's own denominator.
        ReliabilityAggregation v2Ttc = repository.aggregateServiceDates("ttc", null, d1, d2, odt("2026-11-23T20:00:00-05:00"));
        assertThat(v2Ttc.methodologyVersion()).isEqualTo(2);
        AggregateRow line1 = v2Ttc.rows().stream().filter(r -> r.id().equals("line-1")).findFirst().orElseThrow();
        AggregateRow line2 = v2Ttc.rows().stream().filter(r -> r.id().equals("line-2")).findFirst().orElseThrow();
        assertThat(line1.weightedImpactMinutes()).isCloseTo(27.0, org.assertj.core.data.Offset.offset(0.1));
        assertThat(line2.weightedImpactMinutes()).isCloseTo(30.0, org.assertj.core.data.Offset.offset(0.1));

        // Verify interchange station endpoint reports both lines with their own classes.
        ReliabilityAggregation v2BloorYonge = repository.aggregateServiceDates(
            "ttc", "bloor-yonge", d1, d2, odt("2026-11-23T20:00:00-05:00"));
        assertThat(v2BloorYonge.rows()).hasSize(2);

        // Verify whole-line regional alert has station_share = 1.0 and weightedMinutes = 60.0 (5.0% of 1200m).
        ReliabilityAggregation v2Regional = repository.aggregateServiceDates(
            "regional", null, d1, d2, odt("2026-11-23T20:00:00-05:00"));
        assertThat(v2Regional.rows()).singleElement().satisfies(le -> {
            assertThat(le.id()).isEqualTo("regional-le");
            assertThat(le.classes().get(0).disruptionClass()).isEqualTo("service-stopped");
            assertThat(le.classes().get(0).uniqueMinutes()).isEqualTo(60L);
            assertThat(le.classes().get(0).weightedMinutes()).isCloseTo(60.0, org.assertj.core.data.Offset.offset(0.1));
            assertThat(le.classes().get(0).weightedSharePercentage()).isEqualTo(5.0);
        });
        Double goShare = jdbc.queryForObject(
            "select station_share from reliability_episodes where methodology_version = 2 and alert_id = 'a5-go-whole'",
            Map.of(), Double.class);
        assertThat(goShare).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.001));
    }

    private static OffsetDateTime odt(String value) {
        return OffsetDateTime.parse(value);
    }

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

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean DataSource dataSource() { return createDataSource(); }
        @Bean PlatformTransactionManager transactionManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean NamedParameterJdbcTemplate jdbc(DataSource ds) { return new NamedParameterJdbcTemplate(ds); }
        @Bean MutableClock clock() { return new MutableClock(TODAY_NOON); }
        @Bean ReliabilityScheduleCapture scheduleCapture(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityScheduleCapture(jdbc, clock);
        }
        @Bean ReliabilityObservationRollup observationRollup(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityObservationRollup(jdbc, clock);
        }
        @Bean ReliabilityEpisodeSource episodeSource(NamedParameterJdbcTemplate jdbc) {
            return new ReliabilityEpisodeSource(jdbc);
        }
        @Bean ReliabilityDerivationService derivationService(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture scheduleCapture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource,
            PlatformTransactionManager txManager,
            MutableClock clock
        ) {
            return new ReliabilityDerivationService(jdbc, scheduleCapture, observationRollup, episodeSource, txManager, clock);
        }
        @Bean ReliabilityRepository reliabilityRepository(
            NamedParameterJdbcTemplate jdbc,
            ReliabilityScheduleCapture scheduleCapture,
            ReliabilityObservationRollup observationRollup,
            ReliabilityEpisodeSource episodeSource
        ) {
            return new ReliabilityRepository(jdbc, scheduleCapture, observationRollup, episodeSource);
        }
    }

    static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zone;

        MutableClock(Instant instant) { this(instant, ZoneOffset.UTC); }
        private MutableClock(Instant instant, ZoneId zone) { this.instant = instant; this.zone = zone; }
        void set(Instant instant) { this.instant = instant; }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId zone) { return new MutableClock(instant, zone); }
        @Override public Instant instant() { return instant; }
    }
}
