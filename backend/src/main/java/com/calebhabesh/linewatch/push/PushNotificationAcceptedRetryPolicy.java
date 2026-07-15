package com.calebhabesh.linewatch.push;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

final class PushNotificationAcceptedRetryPolicy {
    private static final Duration FIRST_RETRY_DELAY = Duration.ofMinutes(5);
    private static final Duration SECOND_RETRY_DELAY = Duration.ofMinutes(15);
    private static final Duration RETRY_WINDOW = Duration.ofMinutes(30);
    private static final int MAX_TOTAL_ATTEMPTS = 3;

    private PushNotificationAcceptedRetryPolicy() {}

    static boolean shouldRetry(
        int attemptCount,
        Instant lastAttemptAt,
        Instant eventCreatedAt,
        boolean displayAcknowledged,
        List<String> currentAttemptStages,
        Instant now
    ) {
        if (
            displayAcknowledged
                || attemptCount < 1
                || attemptCount >= MAX_TOTAL_ATTEMPTS
                || lastAttemptAt == null
                || eventCreatedAt == null
                || now == null
                || !now.isBefore(eventCreatedAt.plus(RETRY_WINDOW))
                || reachedDisplayPath(currentAttemptStages)
        ) {
            return false;
        }

        Duration delay = attemptCount == 1 ? FIRST_RETRY_DELAY : SECOND_RETRY_DELAY;
        return !lastAttemptAt.plus(delay).isAfter(now);
    }

    private static boolean reachedDisplayPath(List<String> currentAttemptStages) {
        if (currentAttemptStages == null) {
            return false;
        }
        return currentAttemptStages.stream().anyMatch(stage ->
            "push_received".equalsIgnoreCase(stage) || "displayed_acknowledged".equalsIgnoreCase(stage)
        );
    }
}
