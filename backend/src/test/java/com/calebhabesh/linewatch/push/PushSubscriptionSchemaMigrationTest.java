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
}
