package com.calebhabesh.linewatch.push;

public final class PushRequests {
    private PushRequests() {}

    public record PushSubscriptionKeys(String p256dh, String auth) {}

    public record SaveSubscriptionRequest(
        String endpoint,
        PushSubscriptionKeys keys,
        String userAgent
    ) {}

    public record SubscriptionEndpointRequest(String endpoint) {}

    public record UpdatePushPreferencesRequest(
        boolean commuteNotificationsEnabled,
        boolean plannedClosureNotificationsEnabled
    ) {}
}
