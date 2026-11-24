package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleImportRepository;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleImportService;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleImportWriter;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImportService;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImportWriter;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleRepository;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Plan 17 A2 archive schedule backfill integration tests against PostGIS on 5434. */
@SpringJUnitConfig(classes = ReliabilityScheduleBackfillIntegrationTest.TestConfig.class)
class ReliabilityScheduleBackfillIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";

    @Autowired private ReliabilityScheduleBackfillRunner runner;
    @Autowired private NamedParameterJdbcTemplate jdbc;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway.configure().dataSource(createDataSource()).load().migrate();
    }

    @BeforeEach
    void cleanTables() {
        jdbc.getJdbcTemplate().execute("""
            delete from regional_scheduled_trip_counts;
            delete from reliability_service_spans;
            delete from reliability_schedule_days;
            delete from gtfs_schedule_imports;
            delete from regional_gtfs_schedule_imports;
            """);
    }

    @Test
    void archiveBackfillWritesOnlyMissingDatesDeletesImportAndNeverActivates(@TempDir Path tempDir) throws Exception {
        // Seed one existing active regional import and one already-captured day (2026-09-02).
        jdbc.update("""
            insert into regional_gtfs_schedule_imports (source_system, source_url, imported_at, service_start, service_end, active)
            values ('go', 'https://live.example/go.zip', :now, '2026-11-01', '2026-12-01', true)
            """, Map.of("now", OffsetDateTime.parse("2026-11-20T12:00:00Z")));
        jdbc.update("""
            insert into reliability_schedule_days (network_id, source_system, service_date, import_id, feed_version, source_kind, captured_at)
            values ('regional', 'go', '2026-09-02', null, 'existing-import', 'import', :now)
            """, Map.of("now", OffsetDateTime.parse("2026-11-20T12:00:00Z")));

        Path goZip = tempDir.resolve("go-archive.zip");
        writeZip(goZip, Map.of(
            "routes.txt", "route_id,route_short_name,route_long_name,route_type\nLW,LW,Lakeshore West,2\n",
            "trips.txt", "route_id,service_id,trip_id,trip_short_name,direction_id\nLW,SVC1,20260901-LW-1001,1001,0\n",
            "stops.txt", "stop_id,stop_code,stop_name,parent_station,platform_code\nUN,UN,Union Station,,\nEX,EX,Exhibition GO,,\n",
            "calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nSVC1,1,1,1,1,1,1,1,20260901,20260903\n",
            "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n20260901-LW-1001,07:00:00,07:00:00,UN,1\n20260901-LW-1001,07:15:00,07:15:00,EX,2\n"
        ));

        ReliabilityScheduleBackfillRunner.BackfillResult result = runner.backfill(
            "go", goZip, "https://archive.example/go-202609.zip", "go-archive-2026-09"
        );

        assertThat(result.source()).isEqualTo("go");
        assertThat(result.sha256()).hasSize(64);
        // 2026-09-01 and 2026-09-03 are missing; 2026-09-02 already existed and must stay untouched.
        assertThat(result.scheduleDays()).isEqualTo(2);
        assertThat(result.serviceSpans()).isGreaterThan(0);

        List<Map<String, Object>> days = jdbc.queryForList("""
            select service_date, source_kind, feed_version
            from reliability_schedule_days
            where network_id = 'regional' and source_system = 'go'
            order by service_date
            """, Map.of());
        assertThat(days).hasSize(3);
        assertThat(days.get(0).get("source_kind")).isEqualTo("archive");
        assertThat(days.get(0).get("feed_version")).isEqualTo("go-archive-2026-09");
        assertThat(days.get(1).get("source_kind")).isEqualTo("import");
        assertThat(days.get(1).get("feed_version")).isEqualTo("existing-import");
        assertThat(days.get(2).get("source_kind")).isEqualTo("archive");

        // Temporary archive import was deleted and the existing active import stayed active.
        Integer importCount = jdbc.queryForObject(
            "select count(*) from regional_gtfs_schedule_imports where source_system = 'go'",
            Map.of(), Integer.class);
        assertThat(importCount).isEqualTo(1);
        String activeUrl = jdbc.queryForObject(
            "select source_url from regional_gtfs_schedule_imports where source_system = 'go' and active = true",
            Map.of(), String.class);
        assertThat(activeUrl).isEqualTo("https://live.example/go.zip");

        // Scheduled trip counts were also preserved for the backfilled dates.
        Integer tripCount = jdbc.queryForObject("""
            select scheduled_trips from regional_scheduled_trip_counts
            where source_system = 'go' and line_id = 'regional-lw' and service_date = '2026-09-01'
            """, Map.of(), Integer.class);
        assertThat(tripCount).isEqualTo(1);
    }

    @Test
    void ttcArchiveBackfillWritesMissingDaysAndDeletesTemporaryImport(@TempDir Path tempDir) throws Exception {
        Path ttcZip = tempDir.resolve("ttc-archive.zip");
        writeZip(ttcZip, Map.of(
            "routes.txt", "route_id,route_short_name,route_long_name,route_type\nR1,1,Line 1 (Yonge-University),1\n",
            "trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id\nR1,S1,T1,Finch,0\n",
            "stops.txt", "stop_id,stop_code,stop_name,parent_station,stop_lat,stop_lon\nST_UN,1,Union Station,,43.645,-79.380\nST_SG,2,St George Station,,43.668,-79.399\n",
            "calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,1,1,20260910,20260911\n",
            "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,06:00:00,06:00:00,ST_UN,1\nT1,06:20:00,06:20:00,ST_SG,2\n"
        ));

        ReliabilityScheduleBackfillRunner.BackfillResult result = runner.backfill(
            "ttc", ttcZip, "https://archive.example/ttc-202609.zip", "ttc-archive-2026-09"
        );

        assertThat(result.scheduleDays()).isEqualTo(2);
        assertThat(result.serviceSpans()).isGreaterThan(0);

        Integer importCount = jdbc.queryForObject("select count(*) from gtfs_schedule_imports", Map.of(), Integer.class);
        assertThat(importCount).isZero();

        List<LocalDate> dates = jdbc.queryForList("""
            select service_date from reliability_schedule_days
            where network_id = 'ttc' and source_system = 'ttc' and source_kind = 'archive'
            order by service_date
            """, Map.of(), LocalDate.class);
        assertThat(dates).containsExactly(LocalDate.parse("2026-09-10"), LocalDate.parse("2026-09-11"));
    }

    /** The October 2026 TTC archive has no parent stations and omits the dash on Lines 5 and 6. */
    @Test
    void ttcArchiveBackfillMapsArchivedPlatformNames(@TempDir Path tempDir) throws Exception {
        Path ttcZip = tempDir.resolve("ttc-archive.zip");
        writeZip(ttcZip, Map.of(
            "routes.txt", "route_id,route_short_name,route_long_name,route_type\n1,1,Line 1,1\n2,2,Line 2,1\n5,5,Line 5 Eglinton,0\n",
            "trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id\n1,S1,T1,Finch,0\n1,S1,T1B,Finch,0\n2,S1,T2,Kennedy,0\n2,S1,T2B,Kennedy,0\n5,S1,T5,Kennedy,0\n5,S1,T5B,Kennedy,0\n",
            "stops.txt", "stop_id,stop_code,stop_name,parent_station,stop_lat,stop_lon\n"
                + "13863,1,Bloor Station - Northbound Platform,,43.67,-79.38\n"
                + "13809,2,TMU Station - Northbound Platform,,43.65,-79.38\n"
                + "13756,3,Yonge Station - Eastbound Platform,,43.67,-79.38\n"
                + "13753,4,Sherbourne Station - Eastbound Platform,,43.67,-79.37\n"
                + "16071,5,Avenue Station Eastbound Platform,,43.70,-79.40\n"
                + "16081,6,Kennedy Station LRT Platform,,43.73,-79.26\n",
            "calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,1,1,20260910,20260910\n",
            "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                + "T1,06:00:00,06:00:00,13809,1\nT1,06:05:00,06:05:00,13863,2\n"
                + "T2,06:00:00,06:00:00,13756,1\nT2,06:05:00,06:05:00,13753,2\n"
                + "T5,06:00:00,06:00:00,16071,1\nT5,06:30:00,06:30:00,16081,2\n"
                + "T1B,07:00:00,07:00:00,13809,1\nT1B,07:05:00,07:05:00,13863,2\n"
                + "T2B,07:00:00,07:00:00,13756,1\nT2B,07:05:00,07:05:00,13753,2\n"
                + "T5B,07:00:00,07:00:00,16071,1\nT5B,07:30:00,07:30:00,16081,2\n"
        ));

        runner.backfill("ttc", ttcZip, "https://archive.example/ttc-202609.zip", "ttc-archive-2026-09");

        List<String> stations = jdbc.queryForList("""
            select line_id || ':' || station_id from reliability_service_spans
            where network_id = 'ttc' and station_id <> ''
            order by 1
            """, Map.of(), String.class);
        assertThat(stations).contains("line-1:bloor-yonge", "line-2:bloor-yonge", "line-5:avenue", "line-5:kennedy");
    }

    @Test
    void ttcArchiveBackfillRejectsUnmappedStopsAndKeepsNothing(@TempDir Path tempDir) throws Exception {
        Path ttcZip = tempDir.resolve("ttc-archive.zip");
        writeZip(ttcZip, Map.of(
            "routes.txt", "route_id,route_short_name,route_long_name,route_type\nR1,1,Line 1 (Yonge-University),1\n",
            "trips.txt", "route_id,service_id,trip_id,trip_headsign,direction_id\nR1,S1,T1,Finch,0\n",
            "stops.txt", "stop_id,stop_code,stop_name,parent_station,stop_lat,stop_lon\nST_UN,1,Union Station,,43.645,-79.380\nST_XX,2,Nowhere Station,,43.668,-79.399\n",
            "calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS1,1,1,1,1,1,1,1,20260910,20260911\n",
            "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,06:00:00,06:00:00,ST_UN,1\nT1,06:20:00,06:20:00,ST_XX,2\n"
        ));

        assertThatThrownBy(() -> runner.backfill(
            "ttc", ttcZip, "https://archive.example/ttc-202609.zip", "ttc-archive-2026-09"
        )).isInstanceOf(IllegalStateException.class).hasMessageContaining("line-1:ST_XX (Nowhere Station)");

        assertThat(jdbc.queryForObject("select count(*) from gtfs_schedule_imports", Map.of(), Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reliability_schedule_days", Map.of(), Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from reliability_service_spans", Map.of(), Integer.class)).isZero();
    }

    private static void writeZip(Path target, Map<String, String> entries) throws IOException {
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(target))) {
            for (Map.Entry<String, String> entry : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(entry.getKey()));
                zos.write(entry.getValue().getBytes(StandardCharsets.UTF_8));
                zos.closeEntry();
            }
        }
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
        @Bean GtfsScheduleImportRepository ttcRepo(NamedParameterJdbcTemplate jdbc) {
            return new GtfsScheduleImportRepository(jdbc);
        }
        @Bean GtfsScheduleImportWriter ttcWriter(
            GtfsScheduleImportRepository repo, ReliabilityScheduleCapture capture, Clock clock
        ) {
            return new GtfsScheduleImportWriter(repo, capture, clock);
        }
        @Bean GtfsScheduleImportService ttcService(GtfsScheduleImportWriter writer) {
            return new GtfsScheduleImportService(writer);
        }
        @Bean RegionalGtfsScheduleRepository regionalRepo(
            NamedParameterJdbcTemplate jdbc, ReliabilityScheduleCapture capture
        ) {
            return new RegionalGtfsScheduleRepository(jdbc, capture);
        }
        @Bean RegionalGtfsScheduleImportWriter regionalWriter(RegionalGtfsScheduleRepository repo, Clock clock) {
            return new RegionalGtfsScheduleImportWriter(repo, clock);
        }
        @Bean RegionalGtfsScheduleImportService regionalService(RegionalGtfsScheduleImportWriter writer) {
            return new RegionalGtfsScheduleImportService(writer);
        }
        @Bean ReliabilityScheduleBackfillRunner runner(
            GtfsScheduleImportService ttcService, RegionalGtfsScheduleImportService regionalService
        ) {
            return new ReliabilityScheduleBackfillRunner(
                new ReliabilityScheduleBackfillProperties(), ttcService, regionalService);
        }
    }
}
