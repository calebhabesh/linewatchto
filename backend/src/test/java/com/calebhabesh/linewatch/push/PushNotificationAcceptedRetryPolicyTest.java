package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class PushNotificationAcceptedRetryPolicyTest {
    private static final Instant EVENT_CREATED_AT = Instant.parse("2026-07-15T12:00:00Z");

    @Test
    void retriesAnUnconfirmedInitialAcceptanceOnceFiveMinutesHaveElapsed() {
        assertThat(shouldRetry(1, "2026-07-15T12:01:00Z", List.of(), "2026-07-15T12:05:59Z")).isFalse();
        assertThat(shouldRetry(1, "2026-07-15T12:01:00Z", List.of(), "2026-07-15T12:06:00Z")).isTrue();
    }

    @Test
    void spacesTheSecondRetryAndCapsAcceptedDeliveryAtThreeTotalAttempts() {
        assertThat(shouldRetry(2, "2026-07-15T12:06:00Z", List.of(), "2026-07-15T12:20:59Z")).isFalse();
        assertThat(shouldRetry(2, "2026-07-15T12:06:00Z", List.of(), "2026-07-15T12:21:00Z")).isTrue();
        assertThat(shouldRetry(3, "2026-07-15T12:21:00Z", List.of(), "2026-07-15T12:29:00Z")).isFalse();
    }

    @Test
    void stopsRetryingWhenTheCurrentAttemptReachedTheServiceWorkerDisplayPath() {
        assertThat(shouldRetry(1, "2026-07-15T12:01:00Z", List.of("push_received"), "2026-07-15T12:10:00Z")).isFalse();
        assertThat(shouldRetry(1, "2026-07-15T12:01:00Z", List.of("show_failed"), "2026-07-15T12:10:00Z")).isTrue();
    }

    @Test
    void doesNotRetryAcknowledgedOrExpiredAcceptedDeliveries() {
        assertThat(PushNotificationAcceptedRetryPolicy.shouldRetry(
            1,
            Instant.parse("2026-07-15T12:01:00Z"),
            EVENT_CREATED_AT,
            true,
            List.of(),
            Instant.parse("2026-07-15T12:10:00Z")
        )).isFalse();
        assertThat(shouldRetry(1, "2026-07-15T12:01:00Z", List.of(), "2026-07-15T12:30:00Z")).isFalse();
    }

    private boolean shouldRetry(int attemptCount, String lastAttemptAt, List<String> stages, String now) {
        return PushNotificationAcceptedRetryPolicy.shouldRetry(
            attemptCount,
            Instant.parse(lastAttemptAt),
            EVENT_CREATED_AT,
            false,
            stages,
            Instant.parse(now)
        );
    }
}
