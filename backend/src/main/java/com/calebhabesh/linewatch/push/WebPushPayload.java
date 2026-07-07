package com.calebhabesh.linewatch.push;

import java.time.Duration;
import java.time.Instant;

public record WebPushPayload(
    String title,
    String body,
    String url,
    String tag,
    String state,
    String timestamp,
    String sourceEventAt,
    String sentAt,
    String expiresAt,
    String deliveryId,
    String receiptToken,
    long ttlSeconds
) {
    private static final long DEFAULT_ACTIVE_TTL_SECONDS = 10 * 60;
    private static final long DEFAULT_CLEARED_TTL_SECONDS = 24 * 60 * 60;

    public WebPushPayload(
        String title,
        String body,
        String url,
        String tag,
        String state,
        String timestamp
    ) {
        this(title, body, url, tag, state, timestamp, null, timestamp, null, null, null, defaultTtlSeconds(state));
    }

    public WebPushPayload(
        String title,
        String body,
        String url,
        String tag,
        String state,
        String timestamp,
        String deliveryId,
        String receiptToken
    ) {
        this(title, body, url, tag, state, timestamp, null, timestamp, null, deliveryId, receiptToken, defaultTtlSeconds(state));
    }

    public static WebPushPayload fromEvent(PushNotificationEventEntity event) {
        return new WebPushPayload(
            event.getTitle(),
            event.getBody(),
            event.getUrl(),
            PushNotificationDisplayTags.forEvent(event),
            event.getNotificationState(),
            displayTimestamp(event),
            instantString(event.getSourceEventAt()),
            instantString(event.getCreatedAt()),
            null,
            null,
            null,
            defaultTtlSeconds(event.getNotificationState())
        );
    }

    public static WebPushPayload fromDelivery(
        PushNotificationEventEntity event,
        String deliveryId,
        PushSubscriptionEntity subscription,
        PushReceiptTokenService receiptTokenService,
        Instant sentAt,
        PushProperties properties
    ) {
        Instant safeSentAt = sentAt == null ? event.getCreatedAt() : sentAt;
        Duration ttl = properties == null
            ? Duration.ofSeconds(defaultTtlSeconds(event.getNotificationState()))
            : properties.deliveryTtlForState(event.getNotificationState());
        return new WebPushPayload(
            event.getTitle(),
            event.getBody(),
            event.getUrl(),
            PushNotificationDisplayTags.forEvent(event),
            event.getNotificationState(),
            displayTimestamp(event),
            instantString(event.getSourceEventAt()),
            instantString(safeSentAt),
            safeSentAt == null ? null : safeSentAt.plus(ttl).toString(),
            deliveryId,
            receiptTokenService.tokenFor(deliveryId, subscription, event),
            ttl.toSeconds()
        );
    }

    public static WebPushPayload fromDelivery(
        PushNotificationEventEntity event,
        String deliveryId,
        PushSubscriptionEntity subscription,
        PushReceiptTokenService receiptTokenService
    ) {
        return fromDelivery(event, deliveryId, subscription, receiptTokenService, event.getCreatedAt(), null);
    }

    public boolean highUrgency() {
        return !"CLEARED".equalsIgnoreCase(state);
    }

    public String toJson() {
        return "{"
            + "\"title\":" + jsonString(title)
            + ",\"body\":" + jsonString(body)
            + ",\"url\":" + jsonString(url)
            + ",\"tag\":" + jsonString(tag)
            + ",\"state\":" + jsonString(state)
            + ",\"timestamp\":" + jsonString(timestamp)
            + ",\"sourceEventAt\":" + jsonString(sourceEventAt)
            + ",\"sentAt\":" + jsonString(sentAt)
            + ",\"expiresAt\":" + jsonString(expiresAt)
            + ",\"deliveryId\":" + jsonString(deliveryId)
            + ",\"receiptToken\":" + jsonString(receiptToken)
            + "}";
    }

    private static String displayTimestamp(PushNotificationEventEntity event) {
        Instant timestamp = event.getSourceEventAt() == null ? event.getCreatedAt() : event.getSourceEventAt();
        return instantString(timestamp);
    }

    private static String instantString(Instant instant) {
        return instant == null ? "" : instant.toString();
    }

    private static long defaultTtlSeconds(String state) {
        return "CLEARED".equalsIgnoreCase(state) ? DEFAULT_CLEARED_TTL_SECONDS : DEFAULT_ACTIVE_TTL_SECONDS;
    }

    private static String jsonString(String value) {
        String safe = value == null ? "" : value;
        StringBuilder builder = new StringBuilder(safe.length() + 2);
        builder.append('"');
        for (int index = 0; index < safe.length(); index += 1) {
            char ch = safe.charAt(index);
            switch (ch) {
                case '"' -> builder.append("\\\"");
                case '\\' -> builder.append("\\\\");
                case '\b' -> builder.append("\\b");
                case '\f' -> builder.append("\\f");
                case '\n' -> builder.append("\\n");
                case '\r' -> builder.append("\\r");
                case '\t' -> builder.append("\\t");
                default -> {
                    if (ch < 0x20) {
                        builder.append(String.format("\\u%04x", (int) ch));
                    } else {
                        builder.append(ch);
                    }
                }
            }
        }
        builder.append('"');
        return builder.toString();
    }
}
