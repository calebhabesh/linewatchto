package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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

@SpringJUnitConfig(classes = RegionalGtfsScheduleImportIntegrationTest.TestConfig.class)
class RegionalGtfsScheduleImportIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";
    private static final String DEFAULT_USER = "linewatch";
    private static final String DEFAULT_PASSWORD = "linewatch_dev_password";

    @Autowired
    private RegionalGtfsScheduleImportService service;

    @Autowired
    private RegionalGtfsScheduleRepository repository;

    @Autowired
    private NamedParameterJdbcTemplate jdbc;

    @TempDir
    Path tempDir;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway flyway = Flyway.configure()
            .dataSource(createDataSource())
            .load();
        flyway.migrate();
    }

    @BeforeEach
    void cleanTables() {
        jdbc.getJdbcTemplate().execute("DELETE FROM regional_gtfs_schedule_imports;");
    }

    @Test
    void findActiveTripsMatchesTripIdShortNameAndTripNumberInOneQuery() {
        LocalDate serviceDate = LocalDate.parse("2026-10-06");
        RegionalGtfsScheduleImport.Departure first = new RegionalGtfsScheduleImport.Departure(
            "union", "regional-milton", "S1", "20261006-MI-2723", "", "Milton", 60_000, "4", 1
        );
        RegionalGtfsScheduleImport.Departure second = new RegionalGtfsScheduleImport.Departure(
            "union", "regional-lakeshore-east", "S1", "20261006-LE-9120", "E1006", "Oshawa", 61_000, "5", 1
        );
        RegionalGtfsScheduleImport.Departure otherDay = new RegionalGtfsScheduleImport.Departure(
            "union", "regional-milton", "S2", "20261007-MI-2723", "", "Milton", 60_000, "4", 1
        );
        RegionalGtfsScheduleImport.Departure lookalike = new RegionalGtfsScheduleImport.Departure(
            "union", "regional-milton", "S1", "20261006-MI-X2723", "", "Milton", 62_000, "4", 1
        );
        repository.replace(new RegionalGtfsScheduleImport(
            "go", "https://example.test/go.zip", serviceDate, serviceDate.plusDays(1),
            List.of(),
            List.of(
                new RegionalGtfsScheduleImport.ServiceException("S1", serviceDate, 1),
                new RegionalGtfsScheduleImport.ServiceException("S2", serviceDate.plusDays(1), 1)
            ),
            List.of(first, second, otherDay, lookalike)
        ), java.time.OffsetDateTime.parse("2026-10-06T12:00:00Z"));

        Map<String, List<RegionalGtfsScheduleRepository.MatchedDeparture>> matches = repository.findActiveTrips(
            List.of("2723", "E1006", "20261006-LE-9120", "missing"), serviceDate
        );

        assertThat(matches.keySet()).containsExactlyInAnyOrder("2723", "E1006", "20261006-LE-9120");
        assertThat(matches.get("2723")).extracting(RegionalGtfsScheduleRepository.MatchedDeparture::tripId)
            .containsExactly("20261006-MI-2723");
        assertThat(matches.get("E1006")).extracting(RegionalGtfsScheduleRepository.MatchedDeparture::tripId)
            .containsExactly("20261006-LE-9120");
        assertThat(repository.findActiveTrip("20261006-LE-9120", serviceDate))
            .extracting(RegionalGtfsScheduleRepository.MatchedDeparture::tripId)
            .containsExactly("20261006-LE-9120");
        assertThat(jdbc.queryForObject("""
            select count(*) from pg_indexes
            where tablename = 'regional_gtfs_departures' and indexname = 'idx_regional_gtfs_trip_number'
            """, Map.of(), Integer.class)).isEqualTo(1);
    }

    @Test
    void successfulImportStreamsDeparturesInBatchesAndActivatesAtomically() throws Exception {
        // Step 1: establish initial active import for "go" with 2 departures
        Path initialZip = tempDir.resolve("go_initial.zip");
        createZip(initialZip, "MI", "MI1", "ML", 2);
        RegionalGtfsScheduleImportService.ImportSummary initialSummary =
            service.importZip(initialZip, "go", "https://example.test/go_initial.zip");

        assertThat(initialSummary.departures()).isEqualTo(2);
        assertThat(repository.activeImport("go")).isPresent().hasValueSatisfying(active -> {
            assertThat(active.id()).isEqualTo(initialSummary.importId());
        });

        // Step 2: import a large replacement feed with 2,500 departures
        Path largeZip = tempDir.resolve("go_large.zip");
        createZip(largeZip, "MI", "MI2", "ML", 2500);
        RegionalGtfsScheduleImportService.ImportSummary largeSummary =
            service.importZip(largeZip, "go", "https://example.test/go_large.zip");

        assertThat(largeSummary.departures()).isEqualTo(2500);

        // Step 3: verify atomic activation in PostgreSQL
        var activeImportOpt = repository.activeImport("go");
        assertThat(activeImportOpt).isPresent();
        RegionalGtfsScheduleRepository.ActiveImport activeImport = activeImportOpt.get();
        assertThat(activeImport.id()).isEqualTo(largeSummary.importId());
        assertThat(activeImport.sourceUrl()).isEqualTo("https://example.test/go_large.zip");

        // Old import must be inactive
        Integer oldActiveCount = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE id = :id AND active = true",
            Map.of("id", initialSummary.importId()), Integer.class
        );
        assertThat(oldActiveCount).isEqualTo(0);

        // Exactly one active import in the entire table for 'go'
        Integer totalActiveGo = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE source_system = 'go' AND active = true",
            Map.of(), Integer.class
        );
        assertThat(totalActiveGo).isEqualTo(1);

        // Verify total departures persisted for the active import
        Integer activeDeparturesCount = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_departures WHERE import_id = :id",
            Map.of("id", activeImport.id()), Integer.class
        );
        assertThat(activeDeparturesCount).isEqualTo(2500);

        // Verify read query returns coverage from the new import
        List<RegionalGtfsScheduleRepository.Coverage> coverage = repository.activeCoverage();
        assertThat(coverage).isNotEmpty().anySatisfy(c -> {
            assertThat(c.lineId()).isEqualTo("regional-mi");
            assertThat(c.stationId()).isEqualTo("milton");
            assertThat(c.departureCount()).isEqualTo(2500);
        });

        // Step 4: test retention pruning on a 3rd import
        Path thirdZip = tempDir.resolve("go_third.zip");
        createZip(thirdZip, "MI", "MI3", "ML", 5);
        RegionalGtfsScheduleImportService.ImportSummary thirdSummary =
            service.importZip(thirdZip, "go", "https://example.test/go_third.zip");

        // Out of imports 1, 2, 3: import 3 is active; import 2 is retained inactive; import 1 is pruned
        Integer retainedCount = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE source_system = 'go'",
            Map.of(), Integer.class
        );
        assertThat(retainedCount).isEqualTo(2); // 1 active + 1 inactive retained

        List<Long> remainingIds = jdbc.queryForList(
            "SELECT id FROM regional_gtfs_schedule_imports WHERE source_system = 'go' ORDER BY id ASC",
            Map.of(), Long.class
        );
        assertThat(remainingIds).containsExactly(largeSummary.importId(), thirdSummary.importId());
    }

    @Test
    void lateParsingFailureDuringStreamingRollsBackEntireTransaction() throws Exception {
        // Step 1: establish initial active import for "go" with 5 departures
        Path goInitialZip = tempDir.resolve("go_active.zip");
        createZip(goInitialZip, "MI", "MI_INIT", "ML", 5);
        RegionalGtfsScheduleImportService.ImportSummary goInitial =
            service.importZip(goInitialZip, "go", "https://example.test/go_active.zip");

        // Step 2: establish initial active import for "up" with 4 departures
        Path upInitialZip = tempDir.resolve("up_active.zip");
        createUpZip(upInitialZip, 4);
        RegionalGtfsScheduleImportService.ImportSummary upInitial =
            service.importZip(upInitialZip, "up", "https://example.test/up_active.zip");

        assertThat(repository.activeImport("go")).isPresent().hasValueSatisfying(a -> assertThat(a.id()).isEqualTo(goInitial.importId()));
        assertThat(repository.activeImport("up")).isPresent().hasValueSatisfying(a -> assertThat(a.id()).isEqualTo(upInitial.importId()));

        // Step 3: create a zip with 1,500 valid departures followed by a malformed time at departure 1,501.
        // This ensures the first batch (1,000 rows) is flushed to Postgres before the failure occurs!
        Path corruptedZip = tempDir.resolve("go_corrupted.zip");
        createCorruptedZip(corruptedZip, 1500);

        // Step 4: execute import expecting late parsing failure
        assertThatThrownBy(() -> service.importZip(corruptedZip, "go", "https://example.test/go_corrupted.zip"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid GTFS time");

        // Step 5: prove PostgreSQL transaction rolled back
        // 5a. Original 'go' import is STILL active and intact
        var goActiveAfter = repository.activeImport("go");
        assertThat(goActiveAfter).isPresent().hasValueSatisfying(a -> {
            assertThat(a.id()).isEqualTo(goInitial.importId());
        });
        Integer goDepartures = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_departures WHERE import_id = :id",
            Map.of("id", goInitial.importId()), Integer.class
        );
        assertThat(goDepartures).isEqualTo(5);

        // 5b. No uncommitted/partial imports exist in regional_gtfs_schedule_imports
        Integer totalGoImports = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE source_system = 'go'",
            Map.of(), Integer.class
        );
        assertThat(totalGoImports).isEqualTo(1);

        // 5c. The other source ("up") is completely untouched and active
        var upActiveAfter = repository.activeImport("up");
        assertThat(upActiveAfter).isPresent().hasValueSatisfying(a -> {
            assertThat(a.id()).isEqualTo(upInitial.importId());
        });
        Integer upDepartures = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_departures WHERE import_id = :id",
            Map.of("id", upInitial.importId()), Integer.class
        );
        assertThat(upDepartures).isEqualTo(4);
    }

    @Test
    void databaseFailureDuringStreamingRollsBackEntireTransaction() throws Exception {
        // Step 1: establish initial active import for "go" with 3 departures
        Path goInitialZip = tempDir.resolve("go_db_active.zip");
        createZip(goInitialZip, "MI", "MI_DB_INIT", "ML", 3);
        RegionalGtfsScheduleImportService.ImportSummary goInitial =
            service.importZip(goInitialZip, "go", "https://example.test/go_db_active.zip");

        // Step 2: create a zip with 1,000 valid departures, then row 1,001 with trip_id > 200 chars
        // which violates PostgreSQL VARCHAR(200) column constraint during batch 2 flush.
        Path dbFailZip = tempDir.resolve("go_db_fail.zip");
        createOversizedTripZip(dbFailZip, 1000);

        assertThatThrownBy(() -> service.importZip(dbFailZip, "go", "https://example.test/go_db_fail.zip"))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);

        // Step 3: verify rollback in PostgreSQL
        // 3a. Initial active import is still active and unchanged
        var goActiveAfter = repository.activeImport("go");
        assertThat(goActiveAfter).isPresent().hasValueSatisfying(a -> {
            assertThat(a.id()).isEqualTo(goInitial.importId());
        });
        Integer goDepartures = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_departures WHERE import_id = :id",
            Map.of("id", goInitial.importId()), Integer.class
        );
        assertThat(goDepartures).isEqualTo(3);

        // 3b. Batch 1 (1,000 rows) was NOT committed
        Integer totalGoImports = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE source_system = 'go'",
            Map.of(), Integer.class
        );
        assertThat(totalGoImports).isEqualTo(1);
    }

    @Test
    void competingImportsForDifferentSourcesDoNotInterfere() throws Exception {
        Path goZip = tempDir.resolve("go_multi.zip");
        createZip(goZip, "MI", "MI_M", "ML", 10);
        RegionalGtfsScheduleImportService.ImportSummary goSummary =
            service.importZip(goZip, "go", "https://example.test/go.zip");

        Path upZip = tempDir.resolve("up_multi.zip");
        createUpZip(upZip, 10);
        RegionalGtfsScheduleImportService.ImportSummary upSummary =
            service.importZip(upZip, "up", "https://example.test/up.zip");

        // Both sources must have an active import simultaneously
        assertThat(repository.activeImport("go")).isPresent().hasValueSatisfying(a -> assertThat(a.id()).isEqualTo(goSummary.importId()));
        assertThat(repository.activeImport("up")).isPresent().hasValueSatisfying(a -> assertThat(a.id()).isEqualTo(upSummary.importId()));

        Integer activeTotal = jdbc.queryForObject(
            "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE active = true",
            Map.of(), Integer.class
        );
        assertThat(activeTotal).isEqualTo(2);
    }

    @Test
    void competingConcurrentImportsForSameSourceActivateAtomically() throws Exception {
        Path zip1 = tempDir.resolve("go_concurrent_1.zip");
        createZip(zip1, "MI", "MI_C1", "ML", 50);

        Path zip2 = tempDir.resolve("go_concurrent_2.zip");
        createZip(zip2, "MI", "MI_C2", "ML", 50);

        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var future1 = java.util.concurrent.CompletableFuture.supplyAsync(
                () -> {
                    try {
                        return service.importZip(zip1, "go", "https://example.test/go_1.zip");
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                },
                executor
            );
            var future2 = java.util.concurrent.CompletableFuture.supplyAsync(
                () -> {
                    try {
                        return service.importZip(zip2, "go", "https://example.test/go_2.zip");
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                },
                executor
            );

            var summary1 = future1.get();
            var summary2 = future2.get();

            assertThat(summary1).isNotNull();
            assertThat(summary2).isNotNull();

            // After both concurrent imports complete:
            // Exactly one import must be active for 'go' (partial unique index constraint satisfied)
            Integer activeGoCount = jdbc.queryForObject(
                "SELECT count(*) FROM regional_gtfs_schedule_imports WHERE source_system = 'go' AND active = true",
                Map.of(), Integer.class
            );
            assertThat(activeGoCount).isEqualTo(1);

            // Active import must be either summary1 or summary2
            var activeImport = repository.activeImport("go");
            assertThat(activeImport).isPresent();
            assertThat(activeImport.get().id()).isIn(summary1.importId(), summary2.importId());
        } finally {
            executor.shutdown();
        }
    }

    private void createZip(Path zip, String routeId, String tripId, String stopId, int departuresCount) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", String.format("""
                route_id,route_short_name,route_long_name,route_type
                %s,%s,Milton,2
                BUS,21,Milton Bus,3
                """, routeId, routeId));
            entry(output, "trips.txt", String.format("""
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                %s,WKD,%s,Union Station,681
                BUS,WKD,BUS100,Union Station,21B
                """, routeId, tripId));
            entry(output, "stops.txt", String.format("""
                stop_id,stop_code,stop_name,parent_station,platform_code
                %s,ML,Milton GO,,1
                """, stopId));
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);
            entry(output, "calendar_dates.txt", "service_id,date,exception_type\nWKD,20260803,2\n");

            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < departuresCount; i++) {
                int hour = (i / 3600) % 24;
                int min = (i / 60) % 60;
                int sec = i % 60;
                String time = String.format("%02d:%02d:%02d", hour, min, sec);
                sb.append(String.format("%s,%s,%s,%s,%d\n", tripId, time, time, stopId, i + 1));
            }
            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }

    private void createUpZip(Path zip, int departuresCount) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                UP,UP,Union Pearson Express,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,direction_id,trip_short_name
                UP,DAILY,UP_TRIP,Union Pearson Express,0,100
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                UNI,UN,Union Station,,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                DAILY,1,1,1,1,1,1,1,20260701,20260901
                """);

            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < departuresCount; i++) {
                int hour = (i / 3600) % 24;
                int min = (i / 60) % 60;
                int sec = i % 60;
                String time = String.format("%02d:%02d:%02d", hour, min, sec);
                sb.append(String.format("UP_TRIP,%s,%s,UNI,%d\n", time, time, i + 1));
            }
            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }

    private void createCorruptedZip(Path zip, int validCountBeforeCorruption) throws IOException {
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                MI,MI,Milton,2
                """);
            entry(output, "trips.txt", """
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                MI,WKD,MI_FAIL,Union Station,681
                """);
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                ML,ML,Milton GO,,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);

            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < validCountBeforeCorruption; i++) {
                int hour = (i / 3600) % 24;
                int min = (i / 60) % 60;
                int sec = i % 60;
                String time = String.format("%02d:%02d:%02d", hour, min, sec);
                sb.append(String.format("MI_FAIL,%s,%s,ML,%d\n", time, time, i + 1));
            }
            // Add a malformed row at position validCountBeforeCorruption + 1
            sb.append("MI_FAIL,invalid_time,invalid_time,ML,9999\n");

            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }

    private void createOversizedTripZip(Path zip, int validCountBeforeCorruption) throws IOException {
        String longTripId = "TRIP_" + "A".repeat(250);
        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(zip))) {
            entry(output, "routes.txt", """
                route_id,route_short_name,route_long_name,route_type
                MI,MI,Milton,2
                """);
            entry(output, "trips.txt", String.format("""
                route_id,service_id,trip_id,trip_headsign,trip_short_name
                MI,WKD,MI_OK,Union Station,681
                MI,WKD,%s,Union Station,681
                """, longTripId));
            entry(output, "stops.txt", """
                stop_id,stop_code,stop_name,parent_station,platform_code
                ML,ML,Milton GO,,1
                """);
            entry(output, "calendar.txt", """
                service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
                WKD,1,1,1,1,1,0,0,20260701,20260901
                """);

            output.putNextEntry(new ZipEntry("stop_times.txt"));
            StringBuilder sb = new StringBuilder();
            sb.append("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n");
            for (int i = 0; i < validCountBeforeCorruption; i++) {
                int hour = (i / 3600) % 24;
                int min = (i / 60) % 60;
                int sec = i % 60;
                String time = String.format("%02d:%02d:%02d", hour, min, sec);
                sb.append(String.format("MI_OK,%s,%s,ML,%d\n", time, time, i + 1));
            }
            // Add a row with the oversized trip id (length > 200)
            sb.append(String.format("%s,12:00:00,12:00:00,ML,9999\n", longTripId));

            output.write(sb.toString().getBytes(StandardCharsets.UTF_8));
            output.closeEntry();
        }
    }

    private void entry(ZipOutputStream output, String name, String body) throws IOException {
        output.putNextEntry(new ZipEntry(name));
        output.write(body.getBytes(StandardCharsets.UTF_8));
        output.closeEntry();
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
        String url = System.getProperty("spring.datasource.url",
            System.getenv().getOrDefault("SPRING_DATASOURCE_URL", DEFAULT_URL));
        String username = System.getProperty("spring.datasource.username",
            System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", DEFAULT_USER));
        String password = System.getProperty("spring.datasource.password",
            System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", DEFAULT_PASSWORD));

        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(url);
        ds.setUsername(username);
        ds.setPassword(password);
        return ds;
    }

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean
        DataSource dataSource() {
            return createDataSource();
        }

        @Bean
        PlatformTransactionManager transactionManager(DataSource ds) {
            return new DataSourceTransactionManager(ds);
        }

        @Bean
        NamedParameterJdbcTemplate namedParameterJdbcTemplate(DataSource ds) {
            return new NamedParameterJdbcTemplate(ds);
        }

        @Bean
        RegionalGtfsScheduleRepository repository(NamedParameterJdbcTemplate jdbc) {
            return new RegionalGtfsScheduleRepository(jdbc);
        }

        @Bean
        RegionalGtfsScheduleImportWriter writer(RegionalGtfsScheduleRepository repository, Clock clock) {
            return new RegionalGtfsScheduleImportWriter(repository, clock);
        }

        @Bean
        RegionalGtfsScheduleImportService service(RegionalGtfsScheduleImportWriter writer) {
            return new RegionalGtfsScheduleImportService(writer);
        }

        @Bean
        Clock clock() {
            return Clock.fixed(Instant.parse("2026-07-29T12:00:00Z"), ZoneOffset.UTC);
        }
    }
}
