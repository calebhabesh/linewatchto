package com.calebhabesh.linewatch.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
        String value = String.join("\u001f",
            normalize(sourceUpdatedAt == null ? null : sourceUpdatedAt.toInstant().toString()),
            normalize(eventType),
            normalize(notification == null ? null : notification.title()),
            normalize(notification == null ? null : notification.body()),
            normalize(notification == null ? null : notification.eventLocation()),
            normalize(notification == null ? null : notification.displayDirection()),
            normalize(url)
        );
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
