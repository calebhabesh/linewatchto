package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.OffsetDateTime;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

// Regression for the Oct 19-20 2026 outage: one TTC alert title over 500 characters
// rolled back every poll for 4.5 hours.
class ProviderTextPersistenceIntegrationTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-20T03:00:00Z");

    private DataSource ds;
    private NamedParameterJdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        String url = System.getProperty("spring.datasource.url", System.getenv().getOrDefault(
            "SPRING_DATASOURCE_URL", "jdbc:postgresql://127.0.0.1:5434/linewatch_test"));
        var address = java.net.URI.create(url.substring("jdbc:".length()));
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(address.getHost(), address.getPort()), 1000);
        } catch (Exception exception) {
            Assumptions.abort("PostgreSQL test database is unavailable");
        }
        ds = new DriverManagerDataSource(
            url,
            System.getProperty("spring.datasource.username", System.getenv().getOrDefault("SPRING_DATASOURCE_USERNAME", "linewatch")),
            System.getProperty("spring.datasource.password", System.getenv().getOrDefault("SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password"))
        );
        Flyway.configure().dataSource(ds).load().migrate();
        jdbc = new NamedParameterJdbcTemplate(ds);
    }

    @Test
    void persistsOverlongProviderTextOnAlertsSnapshotsAndOutages() {
        String title = "Line 1 Yonge-University: " + "x".repeat(2_000);
        String phrase = "y".repeat(400);
        NormalizedRouteAlert base = TestAlertRecords.normalizedRoute("overlong-provider-text");
        NormalizedRouteAlert alert = new NormalizedRouteAlert(
            base.id(), base.sourceId(), base.lineId(), base.type(), base.severity(), title, base.description(),
            "S".repeat(64), "E".repeat(120), phrase, base.direction(), "C".repeat(120), phrase, phrase,
            base.impactKind(), phrase, phrase, phrase, phrase, phrase, base.startStationId(), base.endStationId(),
            base.activePeriodStart(), base.activePeriodEnd(), base.sourceUpdatedAt(), phrase, phrase, phrase,
            base.rawPayload(), base.stationIds(), base.periods(), base.fingerprint()
        );
        NormalizedAccessibilityOutage baseOutage = TestAlertRecords.normalizedAccessibility("overlong-outage");
        NormalizedAccessibilityOutage outage = new NormalizedAccessibilityOutage(
            baseOutage.id(), baseOutage.sourceId(), baseOutage.assetType(), title, baseOutage.description(),
            "E".repeat(120), phrase, phrase, baseOutage.activePeriodStart(), baseOutage.activePeriodEnd(),
            baseOutage.sourceUpdatedAt(), baseOutage.rawPayload(), baseOutage.stationIds()
        );
        var store = new TtcAlertStore(jdbc);

        inRolledBackTransaction(() -> {
            store.upsertRouteAlert(alert, NOW);
            store.upsertAccessibilityOutage(outage, NOW);

            Map<String, Object> id = Map.of("id", alert.id());
            assertThat(jdbc.queryForObject("select length(title) from alerts where id = :id", id, Integer.class))
                .isEqualTo(title.length());
            assertThat(jdbc.queryForObject("select length(shuttle_end) from alerts where id = :id", id, Integer.class))
                .isEqualTo(phrase.length());
            assertThat(jdbc.queryForObject("select max(length(title)) from snapshots where alert_id = :id", id, Integer.class))
                .isEqualTo(title.length());
            assertThat(jdbc.queryForObject("select length(title) from accessibility_outages where id = :id",
                Map.of("id", outage.id()), Integer.class)).isEqualTo(title.length());
        });
    }

    @Test
    void countsOnlyProcessingFailuresSinceTheLastSuccess() {
        var runs = new IngestionRunStore(jdbc);
        OffsetDateTime base = OffsetDateTime.parse("2100-01-01T00:00:00Z");

        inRolledBackTransaction(() -> {
            insertRun(base, "failed", "success");
            insertRun(base.plusSeconds(30), "success", "success");
            insertRun(base.plusSeconds(60), "failed", "success");
            insertRun(base.plusSeconds(90), "failed", "timeout");
            insertRun(base.plusSeconds(120), "failed", "success");

            assertThat(runs.countProcessingFailuresSinceLastSuccess()).isEqualTo(2);

            insertRun(base.plusSeconds(150), "success", "success");
            assertThat(runs.countProcessingFailuresSinceLastSuccess()).isZero();
        });
    }

    private void insertRun(OffsetDateTime startedAt, String status, String sourceFetchStatus) {
        jdbc.update("""
            insert into ingestion_runs (run_type, status, started_at, completed_at, source_fetch_status)
            values ('alerts', :status, :startedAt, :startedAt, :sourceFetchStatus)
            """, Map.of("status", status, "startedAt", startedAt, "sourceFetchStatus", sourceFetchStatus));
    }

    private void inRolledBackTransaction(Runnable work) {
        new TransactionTemplate(new DataSourceTransactionManager(ds)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            work.run();
        });
    }
}
