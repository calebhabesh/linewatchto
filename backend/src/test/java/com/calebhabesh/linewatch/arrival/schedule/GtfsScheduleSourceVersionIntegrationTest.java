package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class GtfsScheduleSourceVersionIntegrationTest {
    private static final String VERSION = "https://ckan.example.test/completegtfs.zip@2099-01-01T00:00:00";

    @Test
    void onlyACompleteImportOfTheSamePackageCountsAsAlreadyImported() {
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
        var repository = new GtfsScheduleImportRepository(jdbc);

        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            Long importId = jdbc.queryForObject("""
                insert into gtfs_schedule_imports (source_name, source_url, imported_at, active)
                values ('test', 'https://ckan.example.test/completegtfs.zip', now(), false)
                returning id
                """, Map.of(), Long.class);

            repository.recordSourceVersion(importId, VERSION);
            assertThat(repository.hasCompleteImportOfSourceVersion(VERSION)).isFalse();

            repository.markSurfaceScheduleAvailable(importId);
            repository.markFullStopCatalogAvailable(importId);
            assertThat(repository.hasCompleteImportOfSourceVersion(VERSION)).isTrue();
            assertThat(repository.hasCompleteImportOfSourceVersion(VERSION + "-newer")).isFalse();
        });
    }
}
