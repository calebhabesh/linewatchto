package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class RegionalIngestionSchemaMigrationTest {
    @Test
    void createsSourceScopedRawAndNormalizedRegionalAlertTables() throws Exception {
        String migration = new String(
            getClass().getResourceAsStream("/db/migration/V49__metrolinx_regional_alert_ingestion.sql").readAllBytes(),
            StandardCharsets.UTF_8
        );

        assertThat(migration).contains("create table metrolinx_alert_source_records");
        assertThat(migration).contains("primary key (source_system, source_id)");
        assertThat(migration).contains("create table regional_alerts");
        assertThat(migration).contains("unique (source_system, source_id, line_id)");
        assertThat(migration).contains("where run_type = 'metrolinx-alerts'");

        String runTypeMigration = new String(
            getClass().getResourceAsStream("/db/migration/V50__allow_metrolinx_ingestion_runs.sql").readAllBytes(),
            StandardCharsets.UTF_8
        );
        assertThat(runTypeMigration).contains("'metrolinx-alerts'");

        String operationalCoverageMigration = new String(
            getClass().getResourceAsStream("/db/migration/V54__metrolinx_operational_source_coverage.sql").readAllBytes(),
            StandardCharsets.UTF_8
        );
        assertThat(operationalCoverageMigration).contains("create table metrolinx_operational_source_records");
        assertThat(operationalCoverageMigration).contains("primary key (source_system, source_id)");
        assertThat(operationalCoverageMigration).contains("create table metrolinx_ingestion_source_runs");
        assertThat(operationalCoverageMigration).contains("primary key (run_id, source_system)");
        assertThat(operationalCoverageMigration).contains("source_feed_updated_at timestamptz");
    }
}
