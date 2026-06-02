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

    @Test
    void v9AddsImpactKindAndReducedSpeedZoneMetadata() throws IOException {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V9__alert_impact_kind_and_rsz_metadata.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("add column impact_kind");
            assertThat(sql).contains("add column rsz_length");
            assertThat(sql).contains("add column station_distance");
            assertThat(sql).contains("add column track_percent");
            assertThat(sql).contains("add column reduced_speed");
            assertThat(sql).contains("add column average_speed");
            assertThat(sql).contains("chk_alerts_impact_kind");
        }
    }
}
