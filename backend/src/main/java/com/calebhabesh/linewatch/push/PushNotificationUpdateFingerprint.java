package com.calebhabesh.linewatch.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;

final class PushNotificationUpdateFingerprint {
    private PushNotificationUpdateFingerprint() {}

    static String forCandidate(
        OffsetDateTime sourceUpdatedAt,
        String eventType,
        FormattedPushNotification notification,
        String url
    ) {
        return fingerprint(
            normalize(sourceUpdatedAt == null ? null : sourceUpdatedAt.toInstant().toString()),
            normalize(eventType),
            normalize(notification == null ? null : notification.eventLocation()),
            normalize(notification == null ? null : notification.displayDirection())
        );
    }

    static String legacyForCandidate(
        Instant sourceUpdatedAt,
        String eventType,
        FormattedPushNotification notification,
        String url
    ) {
        return fingerprint(
            normalize(sourceUpdatedAt == null ? null : sourceUpdatedAt.toString()),
            normalize(eventType),
            normalize(notification == null ? null : notification.title()),
            normalize(notification == null ? null : notification.body()),
            normalize(notification == null ? null : notification.eventLocation()),
            normalize(notification == null ? null : notification.displayDirection()),
            normalize(url)
        );
    }

    private static String fingerprint(String... values) {
        String value = String.join("\u001f", values);
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint push notification update", exception);
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }
}
