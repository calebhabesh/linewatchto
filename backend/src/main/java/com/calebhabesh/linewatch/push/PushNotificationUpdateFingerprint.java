package com.calebhabesh.linewatch.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;

final class PushNotificationUpdateFingerprint {
    /**
     * v2 hashes the title and body without their start times (worded relative to the
     * send time: "today", "tomorrow") and the event time itself instead, so day words never
     * re-notify. Changing the prefix baselines existing observations silently.
     */
    static final String REGIONAL_CONTENT_PREFIX = "regional-content-v2:";
    private static final java.util.regex.Pattern TIME_LINE_PATTERN =
        java.util.regex.Pattern.compile("(?m)^🕗[^\\r\\n]*(\\R|$)");

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
            normalize(PushNotificationTargetUrls.withoutTargetParams(url))
        );
    }

    static String forRegionalCandidate(
        String eventType,
        FormattedPushNotification notification,
        String url
    ) {
        return REGIONAL_CONTENT_PREFIX + fingerprint(
            normalize(eventType),
            normalize(notification == null ? null : withoutTitleTime(notification.title())),
            normalize(notification == null || notification.body() == null
                ? null : TIME_LINE_PATTERN.matcher(notification.body()).replaceAll("")),
            normalize(notification == null || notification.sourceEventAt() == null
                ? null : notification.sourceEventAt().toString()),
            normalize(notification == null ? null : notification.eventLocation()),
            normalize(notification == null ? null : notification.displayDirection()),
            normalize(PushNotificationTargetUrls.withoutTargetParams(url))
        );
    }

    /** Drops a reminder title's relative start ("· Today 8 AM"); the event time is hashed instead. */
    private static String withoutTitleTime(String title) {
        if (title == null) return null;
        int separator = title.lastIndexOf(PushNotificationFormatter.TITLE_TIME_SEPARATOR);
        return separator < 0 ? title : title.substring(0, separator);
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
