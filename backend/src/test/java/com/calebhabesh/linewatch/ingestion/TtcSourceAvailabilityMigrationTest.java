package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TtcSourceAvailabilityMigrationTest {
    @Test
    void addsSourceSpecificOutcomeFieldsWithoutReclassifyingHistoricalRuns() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V78__ttc_source_fetch_availability.sql"
        )) {
            assertThat(input).isNotNull();
            String migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(migration).contains("add column source_fetch_status varchar(32)");
            assertThat(migration).contains("add column source_http_status integer");
            assertThat(migration).contains("add column source_response_ms bigint");
            assertThat(migration).contains("where run_type = 'alerts' and source_fetch_status is not null");
            assertThat(migration).doesNotContain("update ingestion_runs");
        }
    }
}
