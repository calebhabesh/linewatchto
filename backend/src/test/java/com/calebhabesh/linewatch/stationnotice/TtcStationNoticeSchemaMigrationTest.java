package com.calebhabesh.linewatch.stationnotice;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TtcStationNoticeSchemaMigrationTest {
    @Test
    void createsReviewedNoticesReviewCandidatesObservationsAndRunHealth() throws Exception {
        String migration = Files.readString(Path.of(
            "src/main/resources/db/migration/V76__ttc_station_notices.sql"
        ));

        assertThat(migration)
            .contains("create table ttc_station_notices")
            .contains("create table ttc_station_page_observations")
            .contains("create table ttc_station_notice_candidates")
            .contains("create table ttc_station_notice_monitor_runs")
            .contains("ttc-station-notice-warden-terminal-closure")
            .contains("review_status in ('pending', 'approved', 'ignored')");
    }
}
