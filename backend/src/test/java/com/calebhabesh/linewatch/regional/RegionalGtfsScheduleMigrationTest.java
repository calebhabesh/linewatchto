package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class RegionalGtfsScheduleMigrationTest {
    @Test
    void v53CreatesIsolatedRegionalScheduleTables() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V53__regional_gtfs_schedule_arrivals.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("create table regional_gtfs_schedule_imports");
            assertThat(sql).contains("create table regional_gtfs_departures");
            assertThat(sql).contains("idx_regional_gtfs_one_active_per_source");
            assertThat(sql).contains("source_system in ('go', 'up')");
        }
    }

    @Test
    void v55AddsTripIdentityAndStopSequenceForOperationalMatching() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V55__regional_trip_change_schedule_matching.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("add column trip_short_name");
            assertThat(sql).contains("add column stop_sequence");
            assertThat(sql).contains("idx_regional_gtfs_trip_identity");
        }
    }
}
