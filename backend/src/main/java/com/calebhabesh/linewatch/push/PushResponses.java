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
                    new EventTypePreferencesResponse(true, true, true, true, true)
                ),
                new ReminderTimingPreferencesResponse(true, true, true)
            );
        }
    }

    public record PushDeviceSummaryResponse(
        int enabledDeviceCount,
        boolean hasEnabledDevices
    ) {
        public static PushDeviceSummaryResponse none() {
            return new PushDeviceSummaryResponse(0, false);
        }
    }

    public record PushConfigResponse(
        boolean webPushAvailable,
        String vapidPublicKey,
        PushPreferencesResponse preferences,
        PushDeviceSummaryResponse deviceSummary
    ) {
        public PushConfigResponse(
            boolean webPushAvailable,
            String vapidPublicKey,
            PushPreferencesResponse preferences
        ) {
            this(webPushAvailable, vapidPublicKey, preferences, PushDeviceSummaryResponse.none());
        }
    }

    public record PushSubscriptionResponse(
        String id,
        boolean enabled,
        boolean commuteNotificationsEnabled,
        boolean plannedClosureNotificationsEnabled
    ) {}

    public record PushDeviceResponse(
        String id,
        String deviceLabel,
        String userAgent,
        String endpointHashPrefix,
        boolean enabled,
        String createdAt,
        String updatedAt,
        String lastSeenAt,
        String disabledAt,
        String lastAttemptAt,
        String lastAcceptedAt,
        String lastDisplayedAt,
        int acceptedWithoutDisplayCount,
        String deliveryHealth,
        boolean staleCandidate
    ) {}

    public record PushDevicesResponse(
        List<PushDeviceResponse> devices
    ) {}

    public record PendingPushNotification(
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
        String receiptToken
    ) {
        public PendingPushNotification(
            String title,
            String body,
            String url,
            String tag,
            String state,
            String timestamp
        ) {
            this(title, body, url, tag, state, timestamp, null, timestamp, null, null, null);
        }

        public PendingPushNotification(
            String title,
            String body,
            String url,
            String tag,
            String state,
            String timestamp,
            String deliveryId,
            String receiptToken
        ) {
            this(title, body, url, tag, state, timestamp, null, timestamp, null, deliveryId, receiptToken);
        }
    }

    public record PendingPushNotificationResponse(
        PendingPushNotification notification,
        List<PendingPushNotification> notifications
    ) {
        public PendingPushNotificationResponse(PendingPushNotification notification) {
            this(notification, notification == null ? List.of() : List.of(notification));
        }
    }

    public record ActivePushNotificationsResponse(
        List<String> activeTags,
        List<String> retainedTags,
        boolean cleanupAllowed
    ) {
        public ActivePushNotificationsResponse(List<String> activeTags) {
            this(activeTags, activeTags, true);
        }

        public ActivePushNotificationsResponse(List<String> activeTags, boolean cleanupAllowed) {
            this(activeTags, activeTags, cleanupAllowed);
        }
    }

    public record PushClientEventResponse(
        String stage,
        String message,
        String occurredAt
    ) {}

    public record PushDeliveryDiagnosticResponse(
        String id,
        String title,
        String tag,
        String notificationState,
        String category,
        String eventType,
        String lineId,
        String lineNumber,
        String eventCreatedAt,
        String deviceLabel,
        String userAgent,
        String endpointHashPrefix,
        boolean subscriptionEnabled,
        String deliveryStatus,
        Integer httpStatus,
        String deliveryMessage,
        String lastAttemptAt,
        String displayedAt,
        int attemptCount,
        List<PushClientEventResponse> clientEvents
    ) {}

    public record PushRecipientDiagnosticResponse(
        String subscriptionId,
        String deviceLabel,
        String userAgent,
        String endpointHashPrefix,
        boolean subscriptionEnabled,
        String enabledAt,
        String disabledAt,
        String status,
        String reasonCode,
        String reason,
        PushDeliveryDiagnosticResponse delivery
    ) {}

    public record PushNotificationDiagnosticGroupResponse(
        String id,
        String title,
        String tag,
        String notificationKey,
        String sourceIncidentKey,
        String notificationState,
        String category,
        String eventType,
        String lineId,
        String lineNumber,
        String eventCreatedAt,
        List<PushDeliveryDiagnosticResponse> attempts,
        List<PushRecipientDiagnosticResponse> recipients
    ) {}

    public record PushDeliveryDiagnosticsResponse(
        List<PushNotificationDiagnosticGroupResponse> notifications,
        List<PushDeliveryDiagnosticResponse> deliveries
    ) {
        public PushDeliveryDiagnosticsResponse(List<PushDeliveryDiagnosticResponse> deliveries) {
            this(List.of(), deliveries);
        }
    }

    public record PushDeviceTestResponse(
        PushDeliveryDiagnosticResponse delivery
    ) {}
}
