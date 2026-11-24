package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.arrival.schedule.GtfsServiceTime;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImport;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ScheduleSource;
import com.calebhabesh.linewatch.reliability.ReliabilityScheduleCapture.ServiceSpan;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
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

/** Plan 17 A1 against the local PostGIS test database (skips when it is unreachable). */
@SpringJUnitConfig(classes = ReliabilityScheduleCaptureIntegrationTest.TestConfig.class)
class ReliabilityScheduleCaptureIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";
    private static final Instant TODAY_NOON = Instant.parse("2026-11-24T17:00:00Z");
    private static final LocalDate START = LocalDate.parse("2026-11-16");
    private static final LocalDate END = LocalDate.parse("2026-11-30");
    private static final LocalDate TUESDAY = LocalDate.parse("2026-11-24");
    private static final LocalDate SUNDAY = LocalDate.parse("2026-11-22");
    private static final List<String> TTC_STATIONS = List.of("union", "st-george", "kipling");
    private static final List<String> REGIONAL_STATIONS = List.of("union", "exhibition", "pearson-airport");

    @Autowired private ReliabilityScheduleCapture capture;
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
            delete from reliability_observation_windows;
            delete from reliability_service_spans;
            delete from reliability_schedule_days;
            delete from gtfs_schedule_imports;
            delete from regional_gtfs_schedule_imports;
            delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts');
            """);
    }

    @Test
    void capturedLineAndStationSpansEqualTheSpansComputedFromTheImports() {
        ttcImport(START, END, true, 0);
        goImport(START, END, 0, OffsetDateTime.parse("2026-11-16T12:00:00Z"));
        upImport(START, END);
        forgetCapture();
        Map<String, List<ServiceSpan>> computed = allSpans();
        assertThat(computed.get("ttc:line")).isNotEmpty();
        assertThat(computed.get("regional:line")).isNotEmpty();
        assertThat(computed.get("ttc:st-george")).isNotEmpty();
        assertThat(computed.get("regional:exhibition")).isNotEmpty();

        captureAll();

        assertThat(allSpans()).isEqualTo(computed);
        assertThat(count("reliability_schedule_days where network_id = 'ttc'")).isEqualTo(15);
        assertThat(count("reliability_schedule_days where network_id = 'regional' and source_system = 'go'")).isEqualTo(15);
        // Reads come from the captured rows once the imports are gone.
        deleteImports();
        assertThat(allSpans()).isEqualTo(computed);

        // Line 1's weekday span runs from its first departure to the 25:30 last train.
        assertThat(computed.get("ttc:line")).contains(new ServiceSpan(
            TUESDAY, "line-1", "", GtfsServiceTime.at(TUESDAY, 21_600), GtfsServiceTime.at(TUESDAY, 91_800)
        ));
        assertThat(computed.get("ttc:st-george")).contains(new ServiceSpan(
            TUESDAY, "line-1", "st-george", GtfsServiceTime.at(TUESDAY, 22_200), GtfsServiceTime.at(TUESDAY, 91_800)
        ));
    }

    @Test
    void aLaterImportCoveringAPastDateLeavesThatDateUnchanged() {
        long first = goImport(START, END, 0, OffsetDateTime.parse("2026-11-16T12:00:00Z"));
        long firstTtc = ttcImport(START, END, true, 0);
        capture.capture(ScheduleSource.TTC);

        clock.set(Instant.parse("2026-11-27T17:00:00Z"));
        long second = goImport(START, END, 600, OffsetDateTime.parse("2026-11-27T12:00:00Z"));
        jdbc.update("update gtfs_schedule_imports set active = false", Map.of());
        long secondTtc = ttcImport(START, END, true, 600);
        capture.capture(ScheduleSource.TTC);

        LocalDate frozen = LocalDate.parse("2026-11-25");
        LocalDate yesterday = LocalDate.parse("2026-11-26");
        assertThat(importIds("regional", "go")).containsEntry(frozen, first).containsEntry(yesterday, second)
            .containsEntry(START, first).containsEntry(END, second);
        assertThat(importIds("ttc", "ttc")).containsEntry(frozen, firstTtc).containsEntry(yesterday, secondTtc);
        assertThat(spans("regional", null, frozen)).contains(new ServiceSpan(
            frozen, "regional-lw", "", GtfsServiceTime.at(frozen, 20_000), GtfsServiceTime.at(frozen, 87_000)
        ));
        assertThat(spans("regional", null, yesterday)).contains(new ServiceSpan(
            yesterday, "regional-lw", "", GtfsServiceTime.at(yesterday, 20_600), GtfsServiceTime.at(yesterday, 87_600)
        ));
        assertThat(spans("ttc", "st-george", frozen)).contains(new ServiceSpan(
            frozen, "line-1", "st-george", GtfsServiceTime.at(frozen, 22_200), GtfsServiceTime.at(frozen, 91_800)
        ));
        assertThat(spans("ttc", "st-george", yesterday)).contains(new ServiceSpan(
            yesterday, "line-1", "st-george", GtfsServiceTime.at(yesterday, 22_800), GtfsServiceTime.at(yesterday, 92_400)
        ));
    }

    @Test
    void aCoveredDateWithoutTripsWritesAScheduleDayAndNoSpan() {
        goImport(START, END, 0, OffsetDateTime.parse("2026-11-16T12:00:00Z"));
        ttcImport(START, END, true, 0);
        capture.capture(ScheduleSource.TTC);

        assertThat(importIds("regional", "go")).containsKey(SUNDAY);
        assertThat(count("reliability_service_spans where network_id = 'regional' and service_date = '2026-11-22'"))
            .isZero();
        assertThat(spans("regional", null, SUNDAY)).isEmpty();
        // Line 1 has no Sunday trips in the fixture; Line 2 does.
        assertThat(importIds("ttc", "ttc")).containsKey(SUNDAY);
        assertThat(spans("ttc", null, SUNDAY)).extracting(ServiceSpan::lineId).containsExactly("line-2");
        assertThat(capture.scheduleCoveragePercentage("ttc", SUNDAY, SUNDAY)).isEqualTo(100.0);
    }

    @Test
    void coverageFromScheduleDaysEqualsCoverageFromTheImports() {
        ttcImport(START, END, true, 0);
        goImport(START, END, 0, OffsetDateTime.parse("2026-11-16T12:00:00Z"));
        upImport(LocalDate.parse("2026-11-10"), LocalDate.parse("2026-12-10"));
        forgetCapture();
        successfulPolls("alerts");
        successfulPolls("metrolinx-alerts");
        List<LocalDate[]> ranges = List.of(
            new LocalDate[]{LocalDate.parse("2026-11-01"), END},
            new LocalDate[]{START, TUESDAY},
            new LocalDate[]{LocalDate.parse("2026-11-20"), LocalDate.parse("2026-12-05")}
        );
        List<Double> computed = coverage(ranges);
        assertThat(computed).contains(50.0, 100.0);
        OffsetDateTime until = OffsetDateTime.parse("2026-11-24T17:00:00Z");
        OffsetDateTime since = until.minusDays(30);
        var ttcBefore = reliability.aggregate("ttc", null, since, until);
        var regionalBefore = reliability.aggregate("regional", null, since, until);
        var stationBefore = reliability.aggregate("ttc", "st-george", since, until);
        assertThat(ttcBefore.rows()).extracting(ReliabilityRepository.AggregateRow::id).contains("line-1", "line-2");
        assertThat(regionalBefore.rows()).isNotEmpty();

        captureAll();
        assertThat(coverage(ranges)).isEqualTo(computed);
        deleteImports();

        assertThat(coverage(ranges)).isEqualTo(computed);
        assertThat(reliability.aggregate("ttc", null, since, until)).isEqualTo(ttcBefore);
        assertThat(reliability.aggregate("regional", null, since, until)).isEqualTo(regionalBefore);
        assertThat(reliability.aggregate("ttc", "st-george", since, until)).isEqualTo(stationBefore);
    }

    @Test
    void captureBeforeAPruneKeepsTheOutgoingImportsYesterday() {
        LocalDate yesterday = LocalDate.parse("2026-11-23");
        long outgoing = goImport(START, yesterday, 0, OffsetDateTime.parse("2026-11-16T12:00:00Z"));
        goImport(TUESDAY, END, 300, OffsetDateTime.parse("2026-11-23T12:00:00Z"));
        // As if these imports predate A1: nothing is captured yet.
        forgetCapture();

        goImport(TUESDAY, LocalDate.parse("2026-12-07"), 900, OffsetDateTime.parse("2026-11-24T12:00:00Z"));

        assertThat(count("regional_gtfs_schedule_imports where id = " + outgoing)).isZero();
        assertThat(importIds("regional", "go")).containsEntry(yesterday, outgoing).containsEntry(START, outgoing);
        assertThat(spans("regional", null, yesterday)).contains(new ServiceSpan(
            yesterday, "regional-lw", "", GtfsServiceTime.at(yesterday, 20_000), GtfsServiceTime.at(yesterday, 87_000)
        ));
        assertThat(spans("regional", "exhibition", yesterday)).contains(new ServiceSpan(
            yesterday, "regional-lw", "exhibition", GtfsServiceTime.at(yesterday, 20_600), GtfsServiceTime.at(yesterday, 87_000)
        ));
    }

    private Map<String, List<ServiceSpan>> allSpans() {
        Map<String, List<ServiceSpan>> spans = new LinkedHashMap<>();
        spans.put("ttc:line", capture.serviceSpans("ttc", null, START.minusDays(3), END.plusDays(3)));
        spans.put("regional:line", capture.serviceSpans("regional", null, START.minusDays(3), END.plusDays(3)));
        TTC_STATIONS.forEach(station -> spans.put("ttc:" + station,
            capture.serviceSpans("ttc", station, START.minusDays(3), END.plusDays(3))));
        REGIONAL_STATIONS.forEach(station -> spans.put("regional:" + station,
            capture.serviceSpans("regional", station, START.minusDays(3), END.plusDays(3))));
        return spans;
    }

    private List<ServiceSpan> spans(String networkId, String stationId, LocalDate date) {
        return capture.serviceSpans(networkId, stationId, date, date);
    }

    private List<Double> coverage(List<LocalDate[]> ranges) {
        List<Double> values = new ArrayList<>();
        for (LocalDate[] range : ranges) {
            values.add(capture.scheduleCoveragePercentage("ttc", range[0], range[1]));
            values.add(capture.scheduleCoveragePercentage("regional", range[0], range[1]));
        }
        return values;
    }

    private void captureAll() {
        for (ScheduleSource source : ScheduleSource.values()) capture.capture(source);
    }

    private void forgetCapture() {
        jdbc.getJdbcTemplate().execute("delete from reliability_service_spans; delete from reliability_schedule_days;");
    }

    private void deleteImports() {
        jdbc.getJdbcTemplate().execute("delete from gtfs_schedule_imports; delete from regional_gtfs_schedule_imports;");
    }

    private Map<LocalDate, Long> importIds(String networkId, String sourceSystem) {
        Map<LocalDate, Long> ids = new LinkedHashMap<>();
        jdbc.query("""
            select service_date, import_id from reliability_schedule_days
            where network_id = :networkId and source_system = :sourceSystem order by service_date
            """, new MapSqlParameterSource().addValue("networkId", networkId).addValue("sourceSystem", sourceSystem),
            rs -> {
                ids.put(rs.getObject("service_date", LocalDate.class), rs.getLong("import_id"));
            });
        return ids;
    }

    private long count(String from) {
        return jdbc.queryForObject("select count(*) from " + from, Map.of(), Long.class);
    }

    private void successfulPolls(String runType) {
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            select :runType, 'success', at, at
            from generate_series(timestamptz '2026-11-20 11:00:00+00', timestamptz '2026-11-24 16:50:00+00',
                interval '10 minutes') at
            """, Map.of("runType", runType));
    }

    /** Lines 1 and 2: weekday trips (one past midnight) and a Line 2 Sunday trip. */
    private long ttcImport(LocalDate start, LocalDate end, boolean active, int shift) {
        Long importId = jdbc.queryForObject("""
            insert into gtfs_schedule_imports (source_name, source_url, imported_at, service_start, service_end, active, source_version)
            values ('TTC test', 'https://example.test/ttc.zip', :importedAt, :start, :end, :active, :version)
            returning id
            """, new MapSqlParameterSource()
                .addValue("importedAt", OffsetDateTime.now(clock))
                .addValue("start", start).addValue("end", end).addValue("active", active)
                .addValue("version", "https://example.test/ttc.zip@" + shift), Long.class);
        MapSqlParameterSource id = new MapSqlParameterSource("id", importId)
            .addValue("start", start).addValue("end", end).addValue("shift", shift);
        jdbc.update("""
            insert into gtfs_routes (import_id, route_id, line_id, route_short_name, route_long_name)
            values (:id, 'R1', 'line-1', '1', 'Yonge-University'), (:id, 'R2', 'line-2', '2', 'Bloor-Danforth');
            insert into gtfs_stops (import_id, stop_id, stop_name) values
                (:id, 'UNION_1', 'Union'), (:id, 'STG_1', 'St George'), (:id, 'STG_2', 'St George'), (:id, 'KIP_2', 'Kipling');
            insert into gtfs_services values
                (:id, 'WKDY', true, true, true, true, true, false, false, :start, :end),
                (:id, 'SUN', false, false, false, false, false, false, true, :start, :end);
            insert into gtfs_trips (import_id, trip_id, route_id, service_id) values
                (:id, 'L1A', 'R1', 'WKDY'), (:id, 'L1B', 'R1', 'WKDY'), (:id, 'L2A', 'R2', 'WKDY'), (:id, 'L2S', 'R2', 'SUN');
            insert into gtfs_stop_times (import_id, trip_id, stop_id, arrival_seconds, departure_seconds, stop_sequence) values
                (:id, 'L1A', 'UNION_1', 21600 + :shift, 21600 + :shift, 1),
                (:id, 'L1A', 'STG_1', 22200 + :shift, 22200 + :shift, 2),
                (:id, 'L1B', 'UNION_1', 88200 + :shift, 88200 + :shift, 1),
                (:id, 'L1B', 'STG_1', 91800 + :shift, 91800 + :shift, 2),
                (:id, 'L2A', 'STG_2', 23000 + :shift, 23000 + :shift, 1),
                (:id, 'L2A', 'KIP_2', 25000 + :shift, 25000 + :shift, 2),
                (:id, 'L2S', 'KIP_2', 30000 + :shift, 30000 + :shift, 1),
                (:id, 'L2S', 'STG_2', 32000 + :shift, 32000 + :shift, 2);
            insert into gtfs_station_stops (import_id, station_id, line_id, stop_id) values
                (:id, 'union', 'line-1', 'UNION_1'), (:id, 'st-george', 'line-1', 'STG_1'),
                (:id, 'st-george', 'line-2', 'STG_2'), (:id, 'kipling', 'line-2', 'KIP_2');
            """, id);
        return importId;
    }

    /** Lakeshore West weekdays only, with a late trip; replaces through the pruning path. */
    private long goImport(LocalDate start, LocalDate end, int shift, OffsetDateTime importedAt) {
        return regional.replace(new RegionalGtfsScheduleImport(
            "go", "https://example.test/go.zip", start, end,
            List.of(new RegionalGtfsScheduleImport.Service(
                "WKD", true, true, true, true, true, false, false, start, end)),
            List.of(),
            List.of(
                departure("union", "regional-lw", "WKD", "LW1", 20_000 + shift),
                departure("exhibition", "regional-lw", "WKD", "LW1", 20_600 + shift),
                departure("union", "regional-lw", "WKD", "LW2", 86_000 + shift),
                departure("exhibition", "regional-lw", "WKD", "LW2", 87_000 + shift)
            )
        ), importedAt);
    }

    private long upImport(LocalDate start, LocalDate end) {
        return regional.replace(new RegionalGtfsScheduleImport(
            "up", "https://example.test/up.zip", start, end,
            List.of(new RegionalGtfsScheduleImport.Service(
                "DAILY", true, true, true, true, true, true, true, start, end)),
            List.of(new RegionalGtfsScheduleImport.ServiceException("DAILY", TUESDAY, 2)),
            List.of(
                departure("union", "regional-up", "DAILY", "UP1", 18_000),
                departure("pearson-airport", "regional-up", "DAILY", "UP1", 19_500)
            )
        ), OffsetDateTime.parse("2026-11-16T12:00:00Z"));
    }

    private static RegionalGtfsScheduleImport.Departure departure(
        String station, String line, String service, String trip, int seconds
    ) {
        return new RegionalGtfsScheduleImport.Departure(station, line, service, trip, "", "Union", seconds, "", null);
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
        ReliabilityScheduleCapture scheduleCapture(NamedParameterJdbcTemplate jdbc, MutableClock clock) {
            return new ReliabilityScheduleCapture(jdbc, clock);
        }

        @Bean
        ReliabilityRepository reliabilityRepository(NamedParameterJdbcTemplate jdbc, ReliabilityScheduleCapture capture, MutableClock clock) {
            return new ReliabilityRepository(jdbc, capture, new ReliabilityObservationRollup(jdbc, clock));
        }

        @Bean
        RegionalGtfsScheduleRepository regionalRepository(NamedParameterJdbcTemplate jdbc, ReliabilityScheduleCapture capture) {
            return new RegionalGtfsScheduleRepository(jdbc, capture);
        }
    }
}
