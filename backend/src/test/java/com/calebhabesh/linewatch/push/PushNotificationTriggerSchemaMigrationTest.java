package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushNotificationTriggerSchemaMigrationTest {
    @Test
    void v77AddsAndBackfillsNotificationTriggerBoundary() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V77__push_notification_trigger_boundary.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toLowerCase();

            assertThat(sql).contains("add column triggered_at timestamp with time zone");
            assertThat(sql).contains("set triggered_at = created_at");
            assertThat(sql).contains("alter column triggered_at set not null");
        }
    }
}
