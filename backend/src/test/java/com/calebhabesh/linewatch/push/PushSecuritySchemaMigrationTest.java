package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushSecuritySchemaMigrationTest {
    @Test
    void v62EnforcesSingleEndpointOwnershipAndIdempotentClientTelemetry() throws Exception {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V62__secure_push_endpoint_ownership.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8).toLowerCase();

            assertThat(sql).contains("partition by endpoint_hash");
            assertThat(sql).contains("idx_push_subscriptions_one_enabled_endpoint_owner");
            assertThat(sql).contains("where enabled = true");
            assertThat(sql).contains("delete from push_notification_client_events");
            assertThat(sql).contains("on delete cascade");
            assertThat(sql).contains("idx_push_client_events_one_stage_per_delivery");
        }
    }
}
