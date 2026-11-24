package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.calebhabesh.linewatch.performance.TtcPerformanceHistoryRepository;
import com.calebhabesh.linewatch.performance.TtcPerformanceResponses;
import com.calebhabesh.linewatch.regional.GoTripUpdateFeed;
import com.calebhabesh.linewatch.regional.MetrolinxProperties;
import com.calebhabesh.linewatch.regional.MetrolinxTripUpdateSnapshots;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImport;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import com.calebhabesh.linewatch.regional.UpTripUpdateFeed;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.OnTimeResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogResponse;
import java.io.StringReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
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
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.ObjectMapper;

/** Plan 17 A10 (D5 GO/UP OTP, D6 TTC delay log, TTC performance history) integration tests. */
@SpringJUnitConfig(classes = ReliabilityA10SourcesIntegrationTest.TestConfig.class)
class ReliabilityA10SourcesIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";

    @Autowired private RegionalTripObservationService otpService;
    @Autowired private TtcOfficialDelayLogService delayLogService;
    @Autowired private TtcPerformanceHistoryRepository perfHistoryRepo;
    @Autowired private RegionalGtfsScheduleRepository regionalScheduleRepo;
    @Autowired private NamedParameterJdbcTemplate jdbc;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway.configure().dataSource(createDataSource()).load().migrate();
    }

    @BeforeEach
    void cleanTables() {
        jdbc.getJdbcTemplate().execute("""
            delete from regional_trip_observations;
            delete from regional_scheduled_trip_counts;
            delete from ttc_official_delay_incidents;
            delete from ttc_official_delay_imports;
            delete from ttc_performance_readings;
            delete from reliability_service_spans;
            delete from reliability_schedule_days;
            delete from regional_gtfs_schedule_imports;
            """);
    }

    @Test
    void goUpOnTimePerformanceComputesCoverageAndMetrolinxFiveMinuteRuleHonestly() {
        LocalDate date = LocalDate.parse("2026-11-24");
        // 4 scheduled GO trips on Lakeshore West: 1 on-time (180s), 1 late (420s), 1 cancelled, 1 unobserved.
        regionalScheduleRepo.replace(new RegionalGtfsScheduleImport(
            "go",
            "https://test.example/go.zip",
            date,
            date,
            List.of(new RegionalGtfsScheduleImport.Service("S1", true, true, true, true, true, true, true, date, date)),
            List.of(),
            List.of(
                new RegionalGtfsScheduleImport.Departure("union", "regional-lw", "S1", "20261124-LW-101", "101", "Westbound", 8 * 3600, "", 1),
                new RegionalGtfsScheduleImport.Departure("exhibition", "regional-lw", "S1", "20261124-LW-101", "101", "Westbound", 8 * 3600 + 900, "", 2),
                new RegionalGtfsScheduleImport.Departure("union", "regional-lw", "S1", "20261124-LW-102", "102", "Westbound", 9 * 3600, "", 1),
                new RegionalGtfsScheduleImport.Departure("exhibition", "regional-lw", "S1", "20261124-LW-102", "102", "Westbound", 9 * 3600 + 900, "", 2),
                new RegionalGtfsScheduleImport.Departure("union", "regional-lw", "S1", "20261124-LW-103", "103", "Westbound", 10 * 3600, "", 1),
                new RegionalGtfsScheduleImport.Departure("exhibition", "regional-lw", "S1", "20261124-LW-103", "103", "Westbound", 10 * 3600 + 900, "", 2),
                new RegionalGtfsScheduleImport.Departure("union", "regional-lw", "S1", "20261124-LW-104", "104", "Westbound", 11 * 3600, "", 1),
                new RegionalGtfsScheduleImport.Departure("exhibition", "regional-lw", "S1", "20261124-LW-104", "104", "Westbound", 11 * 3600 + 900, "", 2)
            )
        ), OffsetDateTime.parse("2026-11-24T12:00:00Z"));

        OffsetDateTime feedTs = OffsetDateTime.parse("2026-11-24T15:00:00Z");
        GoTripUpdateFeed goFeed = new GoTripUpdateFeed(
            feedTs,
            List.of(
                new GoTripUpdateFeed.Trip("20261124-LW-101", List.of(
                    new UpTripUpdateFeed.StopTime("EX", feedTs, feedTs.plusSeconds(180), feedTs.plusSeconds(180))
                )),
                new GoTripUpdateFeed.Trip("20261124-LW-102", List.of(
                    new UpTripUpdateFeed.StopTime("EX", feedTs, feedTs.plusSeconds(420), feedTs.plusSeconds(420))
                ))
            ),
            List.of("20261124-LW-103")
        );

        int upserted = otpService.recordGoFeed(goFeed);
        assertThat(upserted).isEqualTo(3);

        OnTimeResponse response = otpService.onTime(date, date, "regional-lw", "day");
        assertThat(response.totals().scheduledTrips()).isEqualTo(4);
        assertThat(response.totals().observedTrips()).isEqualTo(3);
        assertThat(response.totals().coveragePercentage()).isEqualTo(75.0);
        assertThat(response.totals().onTimeTrips()).isEqualTo(1);
        assertThat(response.totals().lateTrips()).isEqualTo(1);
        assertThat(response.totals().cancelledTrips()).isEqualTo(1);
        // 1 on-time out of 3 evaluated (1 on-time + 1 late + 1 cancelled); unobserved trip 104 is unknown, never on-time.
        assertThat(response.totals().onTimePercentage()).isEqualTo(33.3);
    }

    @Test
    void ttcOfficialDelayLogImportsCsvWithCodeDescriptionsAndQueriesSeparately() throws Exception {
        String codesCsv = """
            _id,CODE,DESCRIPTION
            1,MUSAN,UNSANITARY VEHICLE
            2,PUTR,TRACK CIRCUIT PROBLEM
            """;
        String delayCsv = """
            _id,Date,Time,Day,Station,Code,Min Delay,Min Gap,Bound,Line,Vehicle
            1,2025-01-01,02:10,Wednesday,BATHURST STATION,MUSAN,5,9,E,BD,5227
            2,2025-01-01,02:30,Wednesday,DUNDAS STATION,MUIRS,0,0,,YU,0
            3,2025-01-02,08:13,Thursday,BLOOR STATION,PUTR,15,20,S,YU,5836
            """;

        var meta = delayLogService.importFromStreams(
            new StringReader(delayCsv),
            new StringReader(codesCsv),
            "https://ckan.example/delay.csv",
            "2026-11-23T20:02:35"
        );
        assertThat(meta.rowCount()).isEqualTo(3);
        assertThat(meta.minDate()).isEqualTo(LocalDate.parse("2025-01-01"));
        assertThat(meta.maxDate()).isEqualTo(LocalDate.parse("2025-01-02"));

        TtcDelayLogResponse response = delayLogService.delayLog(
            LocalDate.parse("2025-01-01"), LocalDate.parse("2025-01-02"), null, "day"
        );
        assertThat(response.licence()).isEqualTo("Open Government Licence – Toronto");
        // Row 2 has Min Delay = 0 so only rows 1 and 3 count as delay incidents.
        assertThat(response.totals().incidents()).isEqualTo(2);
        assertThat(response.totals().delayMinutes()).isEqualTo(20);
        assertThat(response.totals().medianDelayMinutes()).isEqualTo(10);
        assertThat(response.topCodes()).extracting("code", "description")
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple("PUTR", "TRACK CIRCUIT PROBLEM"),
                org.assertj.core.groups.Tuple.tuple("MUSAN", "UNSANITARY VEHICLE")
            );
        assertThat(response.lines()).extracting("lineId").containsExactly("line-1", "line-2");
    }

    @Test
    void ttcPerformanceHistoryPersistsAndUpsertsDailyReadings() {
        TtcPerformanceResponses.SnapshotResponse snap = new TtcPerformanceResponses.SnapshotResponse(
            "ok", "TTC.ca", "https://www.ttc.ca/transparency-and-accountability/Operating-Statistics/Daily-Customer-Service-Report",
            "Daily Customer Service Report", "Nov 24, 2026", OffsetDateTime.parse("2026-11-24T17:00:00Z"), false, null,
            List.of(
                new TtcPerformanceResponses.MetricResponse("subway-line-1", "Line 1 Yonge-University", "Subway", 96, 95, "96%", null),
                new TtcPerformanceResponses.MetricResponse("subway-line-2", "Line 2 Bloor-Danforth", "Subway", 94, 95, "94%", null)
            )
        );
        int saved = perfHistoryRepo.record(snap, LocalDate.parse("2026-11-24"));
        assertThat(saved).isEqualTo(2);
        // Re-recording the same reading date + updated label upserts cleanly without duplicates.
        perfHistoryRepo.record(snap, LocalDate.parse("2026-11-24"));

        Map<String, List<TtcPerformanceHistoryRepository.ReadingRow>> grouped =
            perfHistoryRepo.readingsByMetric(LocalDate.parse("2026-11-20"), LocalDate.parse("2026-11-24"));
        assertThat(grouped).containsKeys("subway-line-1", "subway-line-2");
        assertThat(grouped.get("subway-line-1")).hasSize(1);
        assertThat(grouped.get("subway-line-1").getFirst().percentage()).isEqualTo(96);
    }

    private static boolean isDatabaseAvailable() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 1000);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static DataSource createDataSource() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setUrl(System.getProperty("spring.datasource.url", DEFAULT_URL));
        ds.setUsername(System.getProperty("spring.datasource.username", "linewatch"));
        ds.setPassword(System.getProperty("spring.datasource.password", "linewatch_dev_password"));
        return ds;
    }

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean DataSource dataSource() { return createDataSource(); }
        @Bean PlatformTransactionManager txManager(DataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean NamedParameterJdbcTemplate jdbc(DataSource ds) { return new NamedParameterJdbcTemplate(ds); }
        @Bean Clock clock() { return Clock.fixed(Instant.parse("2026-11-24T17:00:00Z"), ZoneOffset.UTC); }
        @Bean ReliabilityScheduleCapture capture(NamedParameterJdbcTemplate jdbc, Clock clock) {
            return new ReliabilityScheduleCapture(jdbc, clock);
        }
        @Bean RegionalGtfsScheduleRepository regionalScheduleRepo(
            NamedParameterJdbcTemplate jdbc, ReliabilityScheduleCapture capture
        ) {
            return new RegionalGtfsScheduleRepository(jdbc, capture);
        }
        @Bean ReliabilitySourcesProperties sourcesProperties() {
            ReliabilitySourcesProperties p = new ReliabilitySourcesProperties();
            p.getRegionalOtp().setEnabled(true);
            p.getTtcDelayLog().setEnabled(true);
            return p;
        }
        @Bean RegionalTripObservationRepository otpRepo(NamedParameterJdbcTemplate jdbc) {
            return new RegionalTripObservationRepository(jdbc);
        }
        @Bean RegionalTripObservationService otpService(
            RegionalTripObservationRepository repo,
            ReliabilitySourcesProperties props,
            Clock clock
        ) {
            return new RegionalTripObservationService(
                repo, mock(MetrolinxTripUpdateSnapshots.class), new MetrolinxProperties(), props, clock);
        }
        @Bean TtcOfficialDelayLogRepository delayRepo(NamedParameterJdbcTemplate jdbc) {
            return new TtcOfficialDelayLogRepository(jdbc);
        }
        @Bean TtcOfficialDelayLogService delayService(
            TtcOfficialDelayLogRepository repo,
            ReliabilitySourcesProperties props,
            Clock clock
        ) {
            return new TtcOfficialDelayLogService(repo, props, new ObjectMapper(), clock);
        }
        @Bean TtcPerformanceHistoryRepository perfHistoryRepo(NamedParameterJdbcTemplate jdbc) {
            return new TtcPerformanceHistoryRepository(jdbc);
        }
    }
}
