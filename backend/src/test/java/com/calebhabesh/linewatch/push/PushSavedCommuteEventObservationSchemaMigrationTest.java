package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushSavedCommuteEventObservationSchemaMigrationTest {

    @Test
    void v37AddsSavedCommuteEventObservations() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V37__saved_commute_push_event_observations.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("create table push_saved_commute_event_observations");
            assertThat(sql).contains("source_incident_key varchar(512) not null");
            assertThat(sql).contains("unique (account_id, source_incident_key)");
            assertThat(sql).contains("idx_push_saved_commute_event_observations_account_active");
            assertThat(sql).contains("from push_notification_events");
            assertThat(sql).contains("category in ('saved-commute-current', 'saved-commute-impact')");
            assertThat(sql).contains("notification_state = 'ACTIVE'");
            assertThat(sql).contains("commute_id is not null");
        }
    }

    @Test
    void v40AddsUpdateFingerprintsWithoutForcingCatchUpNotifications() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V40__push_notification_update_fingerprints.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("alter table push_line_event_observations");
            assertThat(sql).contains("alter table push_saved_commute_event_observations");
            assertThat(sql).contains("add column update_fingerprint varchar(64)");
            assertThat(sql).doesNotContain("not null");
        }
    }

    @Test
    void v44PreservesExistingObservationsAsSilentBaselinesAndTracksSuppressedClearances() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V44__push_notification_delivery_eligibility.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toLowerCase();

            assertThat(sql).contains("add column delivery_allowed boolean not null default true");
            assertThat(sql).contains("add column baseline_suppressed boolean not null default true");
            assertThat(sql).contains("alter table push_notification_events");
        }
    }
}
