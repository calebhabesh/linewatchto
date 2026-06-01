package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class AlertIngestionSchemaMigrationTest {

    @Test
    void v4AddsSourceStagingNormalizedOutagesPeriodsAndRunCounters() throws IOException {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V4__alert_ingestion_foundation.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("create table ttc_alert_source_records");
            assertThat(sql).contains("create table alert_stations");
            assertThat(sql).contains("create table alert_active_periods");
            assertThat(sql).contains("create table accessibility_outages");
            assertThat(sql).contains("create table accessibility_outage_stations");
            assertThat(sql).contains("normalized_fingerprint");
            assertThat(sql).contains("records_fetched");
            assertThat(sql).contains("source_feed_updated_at");
        }
    }
}
