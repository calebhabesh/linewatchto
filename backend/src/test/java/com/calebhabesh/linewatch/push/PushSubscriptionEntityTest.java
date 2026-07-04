package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushSubscriptionEntityTest {
    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void enabledAtTracksCurrentEnablementWindow() {
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:00:00Z")
        );

        assertThat(subscription.getEnabledAt()).isEqualTo(Instant.parse("2026-06-05T14:00:00Z"));

        subscription.refresh(
            "p256dh-key-refreshed",
            "auth-secret-refreshed",
            "Chrome Android",
            Instant.parse("2026-06-05T14:30:00Z")
        );

        assertThat(subscription.getEnabledAt()).isEqualTo(Instant.parse("2026-06-05T14:00:00Z"));

        subscription.disable(Instant.parse("2026-06-05T14:58:00Z"));
        subscription.refresh(
            "p256dh-key-restored",
            "auth-secret-restored",
            "Chrome Android",
            Instant.parse("2026-06-05T15:00:00Z")
        );

        assertThat(subscription.getEnabledAt()).isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
    }
}
