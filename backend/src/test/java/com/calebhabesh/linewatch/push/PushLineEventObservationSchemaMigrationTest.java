package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushLineEventObservationSchemaMigrationTest {

    @Test
    void v31AddsLineEventObservationsAndEnablesRszDefault() throws IOException {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V31__push_line_event_observations.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("create table push_line_event_observations");
            assertThat(sql).contains("notification_key varchar(512) not null");
            assertThat(sql).contains("unique (account_id, notification_key)");
            assertThat(sql).contains("idx_push_line_event_observations_account_active");
            assertThat(sql).contains("alter column line_reduced_speed_zone_enabled set default true");
            assertThat(sql).contains("from push_notification_events");
            assertThat(sql).contains("category = 'line-current'");
            assertThat(sql).contains("notification_state = 'ACTIVE'");
        }
    }
}
