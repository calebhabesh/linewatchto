package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class IngestionRunsIndexMigrationTest {
    @Test
    void createsIndexOnLatestSuccessfulRuns() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V79__ingestion_runs_latest_success_index.sql"
        )) {
            assertThat(input).isNotNull();
            String migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(migration).contains("create index idx_ingestion_runs_type_status_completed");
            assertThat(migration).contains("on ingestion_runs (run_type, completed_at desc)");
            assertThat(migration).contains("where status = 'success' and completed_at is not null");
        }
    }
}
