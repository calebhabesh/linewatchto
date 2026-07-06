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

    public record DisplayedNotificationRequest(String endpoint, String tag) {}

    public record ClientEventRequest(
        String endpoint,
        String tag,
        String stage,
        String message
    ) {}

    public record ReceiptEventRequest(
        String deliveryId,
        String receiptToken,
        String stage,
        String message
    ) {}

    public record EventTypePreferencesRequest(
        Boolean suspensions,
        Boolean delays,
        Boolean reducedSpeedZones,
        Boolean plannedClosures,
        Boolean serviceRestored
    ) {}

    public record SavedCommutePreferencesRequest(
        Boolean currentDisruptions,
        Boolean plannedClosureReminders,
        EventTypePreferencesRequest eventTypes
    ) {}

    public record LineSubscriptionSelectionRequest(String lineId, Boolean subscribed) {}

    public record LineSubscriptionPreferencesRequest(
        java.util.List<LineSubscriptionSelectionRequest> lines,
        EventTypePreferencesRequest eventTypes
    ) {}

    public record ReminderTimingPreferencesRequest(
        Boolean onChange,
        Boolean closure24h,
        Boolean closureMorning
    ) {}

    public record UpdatePushPreferencesRequest(
        Boolean commuteNotificationsEnabled,
        Boolean plannedClosureNotificationsEnabled,
        SavedCommutePreferencesRequest savedCommutes,
        LineSubscriptionPreferencesRequest lineSubscriptions,
        ReminderTimingPreferencesRequest reminderTiming
    ) {}
}
