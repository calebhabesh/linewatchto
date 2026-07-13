package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushSubscriptionSchemaMigrationTest {

    @Test
    void v35AddsSubscriptionEnabledAtBoundary() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V35__push_subscription_enabled_at.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("alter table push_subscriptions");
            assertThat(sql).contains("add column enabled_at timestamp with time zone");
            assertThat(sql).contains("when enabled then coalesce(created_at");
            assertThat(sql).contains("alter column enabled_at set not null");
        }
    }

    @Test
    void v41AddsInstallationIdentityAndArchivesHistoricalGoneEndpoints() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V41__push_subscription_installation_identity.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("add column installation_id varchar(80)");
            assertThat(sql).contains("add column registration_reason varchar(80)");
            assertThat(sql).contains("add column disabled_reason varchar(80)");
            assertThat(sql).contains("delivery.status = 'gone'");
            assertThat(sql).contains("disabled_reason = 'historical-push-service-gone'");
            assertThat(sql).contains("idx_push_subscriptions_account_installation");
        }
    }
}
