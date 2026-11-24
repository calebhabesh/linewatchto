package com.calebhabesh.linewatch.maintenance;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Plan 17 A11 retention-guard check against the local PostGIS test database (skips when unreachable). */
class MaintenanceCleanupStoreIntegrationTest {
    private static final String DEFAULT_URL = "jdbc:postgresql://127.0.0.1:5434/linewatch_test";

    private NamedParameterJdbcTemplate jdbc;
    private MaintenanceCleanupStore store;

    @BeforeAll
    static void setUpDatabase() {
        Assumptions.assumeTrue(isDatabaseAvailable(), "PostgreSQL database must be reachable on port 5434");
        Flyway.configure().dataSource(createDataSource()).load().migrate();
    }

    @BeforeEach
    void setUp() {
        jdbc = new NamedParameterJdbcTemplate(createDataSource());
        store = new MaintenanceCleanupStore(jdbc);
        jdbc.getJdbcTemplate().execute("""
            delete from reliability_observation_windows;
            delete from ingestion_runs where run_type in ('alerts', 'metrolinx-alerts', 'gtfs-schedule');
            """);
    }

    @Test
    void preservesSuccessfulAlertRunsUntilTouchedDatesHaveFinalObservationRollups() {
        OffsetDateTime cutoff = OffsetDateTime.parse("2026-10-01T00:00:00Z");

        // Finalize 2026-08-26 for ttc (rolled up after 2026-08-27 00:10 EDT = 04:10 UTC).
        // Leave 2026-08-27 unfinalized (rolled up before 00:10 on 2026-08-28) and 2026-08-28 absent.
        insertRollup("ttc", LocalDate.parse("2026-08-26"), OffsetDateTime.parse("2026-08-27T04:15:00Z"));
        insertRollup("ttc", LocalDate.parse("2026-08-27"), OffsetDateTime.parse("2026-08-28T04:05:00Z"));
        insertRollup("regional", LocalDate.parse("2026-08-26"), OffsetDateTime.parse("2026-08-27T04:15:00Z"));

        long ttcFinalizedMidday = insertRun("alerts", "success", "2026-08-26T16:00:00Z", "2026-08-26T16:00:05Z");
        // 23:50 EDT = 03:50 UTC on Aug 27; window ends at exactly 00:00 EDT Aug 27 -> touches ONLY Aug 26 (final).
        long ttcFinalizedEdge = insertRun("alerts", "success", "2026-08-27T03:50:00Z", "2026-08-27T03:50:00Z");
        // 23:55 EDT = 03:55 UTC on Aug 27; window reaches 00:05 EDT Aug 27 -> touches unfinalized Aug 27 -> MUST STAY.
        long ttcCrossMidnightToUnfinalized = insertRun("alerts", "success", "2026-08-27T03:55:00Z", "2026-08-27T03:55:00Z");
        // Aug 28 has no roll-up row at all -> MUST STAY.
        long ttcNoRollup = insertRun("alerts", "success", "2026-08-28T16:00:00Z", "2026-08-28T16:00:05Z");
        // Failed alert run before cutoff -> DELETED (not used for observation coverage).
        long ttcFailedOld = insertRun("alerts", "failed", "2026-08-28T17:00:00Z", "2026-08-28T17:00:05Z");
        // Latest alert run (after cutoff) -> MUST STAY.
        long ttcLatest = insertRun("alerts", "success", "2026-11-24T12:00:00Z", "2026-11-24T12:00:05Z");

        long regionalFinalized = insertRun("metrolinx-alerts", "success", "2026-08-26T18:00:00Z", "2026-08-26T18:00:05Z");
        long regionalUnrolled = insertRun("metrolinx-alerts", "success", "2026-08-27T18:00:00Z", "2026-08-27T18:00:05Z");
        long regionalLatest = insertRun("metrolinx-alerts", "success", "2026-11-24T12:00:00Z", "2026-11-24T12:00:05Z");

        long scheduleOld = insertRun("gtfs-schedule", "success", "2026-08-26T12:00:00Z", "2026-08-26T12:01:00Z");
        long scheduleLatest = insertRun("gtfs-schedule", "success", "2026-11-24T12:00:00Z", "2026-11-24T12:01:00Z");

        int deleted = store.deleteOldIngestionRuns(cutoff);
        assertThat(deleted).isEqualTo(5);

        List<Long> remaining = jdbc.queryForList("select id from ingestion_runs order by id", Map.of(), Long.class);
        assertThat(remaining)
            .containsExactlyInAnyOrder(
                ttcCrossMidnightToUnfinalized,
                ttcNoRollup,
                ttcLatest,
                regionalUnrolled,
                regionalLatest,
                scheduleLatest
            )
            .doesNotContain(
                ttcFinalizedMidday,
                ttcFinalizedEdge,
                ttcFailedOld,
                regionalFinalized,
                scheduleOld
            );
    }

    private void insertRollup(String networkId, LocalDate date, OffsetDateTime rolledUpAt) {
        jdbc.update("""
            insert into reliability_observation_windows (network_id, observation_date, covered, observed_minutes, rolled_up_at)
            values (:networkId, :date, '{}'::tstzmultirange, 0, :rolledUpAt)
            """, new MapSqlParameterSource()
                .addValue("networkId", networkId)
                .addValue("date", date)
                .addValue("rolledUpAt", rolledUpAt));
    }

    private long insertRun(String runType, String status, String startedAt, String completedAt) {
        return jdbc.queryForObject("""
            insert into ingestion_runs (run_type, status, started_at, completed_at)
            values (:runType, :status, cast(:startedAt as timestamptz), cast(:completedAt as timestamptz))
            returning id
            """, new MapSqlParameterSource()
                .addValue("runType", runType)
                .addValue("status", status)
                .addValue("startedAt", startedAt)
                .addValue("completedAt", completedAt),
            Long.class);
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
}
