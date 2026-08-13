package com.calebhabesh.linewatch.push;

public final class PushRequests {
    private PushRequests() {}

    public record PushSubscriptionKeys(String p256dh, String auth) {}

    public record SaveSubscriptionRequest(
        String endpoint,
        PushSubscriptionKeys keys,
        String userAgent,
        String reason,
        String installationId
    ) {
        public SaveSubscriptionRequest(String endpoint, PushSubscriptionKeys keys, String userAgent) {
            this(endpoint, keys, userAgent, null, null);
        }

        public SaveSubscriptionRequest(String endpoint, PushSubscriptionKeys keys, String userAgent, String reason) {
            this(endpoint, keys, userAgent, reason, null);
        }
    }

    public record SubscriptionEndpointRequest(String endpoint, String reason) {
        public SubscriptionEndpointRequest(String endpoint) { this(endpoint, null); }
    }

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
        Boolean tripCancellations,
        Boolean reducedSpeedZones,
        Boolean plannedClosures,
        Boolean serviceRestored
    ) {
        public EventTypePreferencesRequest(
            Boolean suspensions,
            Boolean delays,
            Boolean reducedSpeedZones,
            Boolean plannedClosures,
            Boolean serviceRestored
        ) {
            this(suspensions, delays, null, reducedSpeedZones, plannedClosures, serviceRestored);
        }
    }

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
        ReminderTimingPreferencesRequest reminderTiming,
        String plannedClosureFollowUp
    ) {
        public UpdatePushPreferencesRequest(
            Boolean commuteNotificationsEnabled,
            Boolean plannedClosureNotificationsEnabled,
            SavedCommutePreferencesRequest savedCommutes,
            LineSubscriptionPreferencesRequest lineSubscriptions,
            ReminderTimingPreferencesRequest reminderTiming
        ) {
            this(
                commuteNotificationsEnabled,
                plannedClosureNotificationsEnabled,
                savedCommutes,
                lineSubscriptions,
                reminderTiming,
                null
            );
        }
    }
}
