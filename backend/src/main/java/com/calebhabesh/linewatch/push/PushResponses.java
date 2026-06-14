package com.calebhabesh.linewatch.push;

import java.util.List;

public final class PushResponses {
    private PushResponses() {}

    public record EventTypePreferencesResponse(
        boolean suspensions,
        boolean delays,
        boolean reducedSpeedZones,
        boolean plannedClosures,
        boolean serviceRestored
    ) {}

    public record SavedCommutePreferencesResponse(
        boolean currentDisruptions,
        boolean plannedClosureReminders,
        EventTypePreferencesResponse eventTypes
    ) {}

    public record LineSubscriptionResponse(
        String lineId,
        String lineNumber,
        String label,
        boolean subscribed
    ) {}

    public record LineSubscriptionPreferencesResponse(
        List<LineSubscriptionResponse> lines,
        EventTypePreferencesResponse eventTypes
    ) {}

    public record ReminderTimingPreferencesResponse(
        boolean onChange,
        boolean closure24h,
        boolean closureMorning
    ) {}

    public record PushPreferencesResponse(
        boolean commuteNotificationsEnabled,
        boolean plannedClosureNotificationsEnabled,
        SavedCommutePreferencesResponse savedCommutes,
        LineSubscriptionPreferencesResponse lineSubscriptions,
        ReminderTimingPreferencesResponse reminderTiming
    ) {
        public PushPreferencesResponse(boolean commuteNotificationsEnabled, boolean plannedClosureNotificationsEnabled) {
            this(
                commuteNotificationsEnabled,
                plannedClosureNotificationsEnabled,
                new SavedCommutePreferencesResponse(
                    commuteNotificationsEnabled,
                    plannedClosureNotificationsEnabled,
                    new EventTypePreferencesResponse(true, true, true, true, true)
                ),
                new LineSubscriptionPreferencesResponse(
                    List.of(
                        new LineSubscriptionResponse("line-1", "1", "Yonge-University", false),
                        new LineSubscriptionResponse("line-2", "2", "Bloor-Danforth", false),
                        new LineSubscriptionResponse("line-4", "4", "Sheppard", false),
                        new LineSubscriptionResponse("line-5", "5", "Eglinton", false),
                        new LineSubscriptionResponse("line-6", "6", "Finch West", false)
                    ),
                    new EventTypePreferencesResponse(true, true, false, true, true)
                ),
                new ReminderTimingPreferencesResponse(true, true, true)
            );
        }
    }

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
        String tag,
        String state,
        String timestamp
    ) {}

    public record PendingPushNotificationResponse(PendingPushNotification notification) {}

    public record ActivePushNotificationsResponse(List<String> activeTags) {}
}
