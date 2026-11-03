package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.arrival.schedule.GtfsImportModels;
import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleImportRepository;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class TtcSurfaceStopRepositoryIntegrationTest {
    @Test
    void storesEveryStopAndFindsItByPoleNumberInTheActiveOrAnOlderImport() {
        String url = System.getProperty("spring.datasource.url", System.getenv().getOrDefault(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test"));
        var address = java.net.URI.create(url.substring("jdbc:".length()));
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(address.getHost(), address.getPort()), 1000);
        } catch (Exception exception) {
            Assumptions.abort("PostgreSQL test database is unavailable");
        }
        var ds = new DriverManagerDataSource(
            url,
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
        Flyway.configure().dataSource(ds).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(ds);
        var writes = new GtfsScheduleImportRepository(jdbc);
        var reads = new TtcSurfaceStopRepository(jdbc);

        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            jdbc.update("update gtfs_schedule_imports set active = false where active = true", Map.of());
            long older = importRow(jdbc, false, "2099-01-01");
            long active = importRow(jdbc, true, "2099-03-01");
            writes.insertSurfaceRoutes(active, List.of(new GtfsImportModels.SurfaceRouteRow("504", "504", "King", "streetcar")));
            writes.insertSurfaceStops(older, List.of(
                new GtfsImportModels.SurfaceStopRow("99001", "99001", "Dropped Stop", 43.6, -79.4, null, "")));
            writes.insertSurfaceStops(active, List.of(
                new GtfsImportModels.SurfaceStopRow("99002", "99002", "King St West at Spadina Ave", 43.64, -79.39, null, ""),
                new GtfsImportModels.SurfaceStopRow("99003", "", "No Pole Number", null, null, null, "")));
            writes.insertSurfaceStopRoutes(active, List.of(
                new GtfsImportModels.SurfaceStopRouteRow("99002", "504", "West - 504A King")));
            writes.insertSurfaceTrips(active, List.of(
                new GtfsImportModels.SurfaceTripRow("t1", "504", "West - 504A King", "weekday", 9)));
            // A stop that is not linked to any station now takes scheduled departures.
            writes.insertSurfaceStopTimes(active, List.of(new GtfsImportModels.StopTimeRow("t1", "99002", 3600, 3600, 1)));
            writes.markSurfaceStopCatalogAvailable(active);

            var catalog = reads.activeCatalog().orElseThrow();
            assertThat(catalog.importId()).isEqualTo(active);
            assertThat(catalog.stopCatalogAvailable()).isTrue();
            assertThat(reads.findStop(active, "99002")).get().satisfies(stop -> {
                assertThat(stop.stopName()).isEqualTo("King St West at Spadina Ave");
                assertThat(stop.latitude()).isEqualTo(43.64);
            });
            assertThat(reads.findStop(active, "99001")).isEmpty();
            assertThat(reads.findStopInOtherImport(active, "99001")).get()
                .satisfies(stop -> assertThat(stop.stopName()).isEqualTo("Dropped Stop"));
            assertThat(reads.findStopInOtherImport(active, "98999")).isEmpty();
            assertThat(reads.routes(active, "99002")).singleElement().satisfies(route -> {
                assertThat(route.route()).isEqualTo("504");
                assertThat(route.mode()).isEqualTo("streetcar");
                assertThat(route.destination()).isEqualTo("West - 504A King");
            });
            Integer departures = jdbc.queryForObject(
                "select count(*) from ttc_surface_stop_times where import_id = :id and stop_id = '99002'",
                Map.of("id", active), Integer.class);
            assertThat(departures).isEqualTo(1);
        });
    }

    private static long importRow(NamedParameterJdbcTemplate jdbc, boolean active, String serviceEnd) {
        return jdbc.queryForObject("""
            insert into gtfs_schedule_imports (source_name, source_url, imported_at, service_start, service_end, active)
            values ('test', 'https://example.test/gtfs.zip', now(), date '2098-12-01', cast(:end as date), :active)
            returning id
            """, Map.of("end", serviceEnd, "active", active), Long.class);
    }
}
