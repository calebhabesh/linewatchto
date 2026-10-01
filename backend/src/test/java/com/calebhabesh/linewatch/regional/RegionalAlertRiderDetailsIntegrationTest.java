package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

class RegionalAlertRiderDetailsIntegrationTest {
    @Test
    void retainedClassificationFactsReachActiveWindowsWithoutLeakingRawPayloads() throws Exception {
        boolean available;
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 5434), 1000);
            available = true;
        } catch (Exception exception) {
            available = false;
        }
        Assumptions.assumeTrue(available, "PostgreSQL test database is unavailable");
        DriverManagerDataSource ds = new DriverManagerDataSource(
            System.getProperty("spring.datasource.url", System.getenv().getOrDefault("SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test")),
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
        Flyway.configure().dataSource(ds).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(ds);
        var store = new RegionalAlertStore(jdbc, JsonMapper.builder().findAndAddModules().build(),
            Clock.fixed(Instant.parse("2026-07-28T18:15:00Z"), ZoneOffset.UTC), new MetrolinxProperties());
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            OffsetDateTime now = OffsetDateTime.parse("2026-07-28T18:15:00Z");
            store.upsertSource(new MetrolinxFetchedRecord(MetrolinxSourceSystem.GO_SERVICE_ALERTS, "rider-details-integration", "{}"), now);
            jdbc.update("""
                update metrolinx_alert_source_records
                set deterministic_classification = cast(:details as jsonb)
                where source_system = :source and source_id = :id
                """, Map.of("source", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "id", "rider-details-integration",
                    "details", "{\"replacementService\":\"go-bus\",\"maximumDelayMinutes\":20,\"publishedAt\":\"2026-07-27T15:00:00Z\"}"));
            store.upsertAlert(new RegionalNormalizedAlert(
                "rider-details-integration", MetrolinxSourceSystem.GO_SERVICE_ALERTS, "rider-details-integration",
                "regional-ki", "planned-closure", "Planned work", "Trains replaced by buses", "Construction",
                now.minusHours(1), now.plusHours(2), now, List.of("bloor"), List.of(), "source-active-period", "{}"
            ), now);
            assertThat(store.findActiveAlerts()).filteredOn(alert -> alert.id().equals("rider-details-integration"))
                .singleElement().satisfies(alert -> {
                    assertThat(alert.impactKind()).isEqualTo("suspension");
                    assertThat(alert.replacementService()).isEqualTo("go-bus");
                    assertThat(alert.maximumDelayMinutes()).isEqualTo(20);
                    assertThat(alert.rawPayload()).isEmpty();
                    assertThat(alert.publishedAt()).isEqualTo(OffsetDateTime.parse("2026-07-27T15:00:00Z"));
                });
            // A retained window with no classified facts remains usable without fabricated metadata.
            jdbc.update("update metrolinx_alert_source_records set deterministic_classification = null where source_id = :id",
                Map.of("id", "rider-details-integration"));
            assertThat(store.findActiveAlerts()).filteredOn(alert -> alert.id().equals("rider-details-integration"))
                .singleElement().satisfies(alert -> {
                    assertThat(alert.replacementService()).isNull();
                    assertThat(alert.maximumDelayMinutes()).isNull();
                    assertThat(alert.publishedAt()).isNull();
                });
        });
    }
}
