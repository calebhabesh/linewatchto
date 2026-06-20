package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class GtfsScheduleRefreshRunMigrationTest {

    @Test
    void v27AllowsPersistedGtfsScheduleRefreshRuns() throws Exception {
        String sql = migrationSql("/db/migration/V27__gtfs_schedule_refresh_runs.sql");

        assertThat(sql).contains("drop constraint ingestion_runs_run_type_check");
        assertThat(sql).contains("'alerts', 'gtfs-static', 'gtfs-schedule'");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
