package com.calebhabesh.linewatch.push;

public final class PushResponses {
    private PushResponses() {}

    public record PushPreferencesResponse(
        boolean commuteNotificationsEnabled,
        boolean plannedClosureNotificationsEnabled
    ) {}

    public record PushConfigResponse(
        boolean webPushAvailable,
        String vapidPublicKey,
        PushPreferencesResponse preferences
    ) {}

    public record PushSubscriptionResponse(
        String id,
        boolean enabled,
        boolean commuteNotificationsEnabled,
        boolean plannedClosureNotificationsEnabled
    ) {}

    public record PendingPushNotification(
        String title,
        String body,
        String url,
        String tag
    ) {}

    public record PendingPushNotificationResponse(PendingPushNotification notification) {}
}
