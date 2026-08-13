package com.calebhabesh.linewatch.push;

import java.util.List;

public final class PushResponses {
    private PushResponses() {}

    public record EventTypePreferencesResponse(
        boolean suspensions,
        boolean delays,
        boolean tripCancellations,
        boolean reducedSpeedZones,
        boolean plannedClosures,
        boolean serviceRestored
    ) {
        public EventTypePreferencesResponse(
            boolean suspensions,
            boolean delays,
            boolean reducedSpeedZones,
            boolean plannedClosures,
            boolean serviceRestored
        ) {
            this(suspensions, delays, true, reducedSpeedZones, plannedClosures, serviceRestored);
        }
    }

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
        ReminderTimingPreferencesResponse reminderTiming,
        String plannedClosureFollowUp
    ) {
        public PushPreferencesResponse(
            boolean commuteNotificationsEnabled,
            boolean plannedClosureNotificationsEnabled,
            SavedCommutePreferencesResponse savedCommutes,
            LineSubscriptionPreferencesResponse lineSubscriptions,
            ReminderTimingPreferencesResponse reminderTiming
        ) {
            this(
                commuteNotificationsEnabled,
                plannedClosureNotificationsEnabled,
                savedCommutes,
                lineSubscriptions,
                reminderTiming,
                PlannedClosureFollowUpPolicy.fromLegacy(
                    reminderTiming.closure24h(),
                    reminderTiming.closureMorning()
                ).apiValue()
            );
        }

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
                        new LineSubscriptionResponse("line-6", "6", "Finch West", false),
                        new LineSubscriptionResponse("regional-br", "BR", "Barrie", false),
                        new LineSubscriptionResponse("regional-ki", "KI", "Kitchener", false),
                        new LineSubscriptionResponse("regional-le", "LE", "Lakeshore East", false),
                        new LineSubscriptionResponse("regional-lw", "LW", "Lakeshore West", false),
                        new LineSubscriptionResponse("regional-mi", "MI", "Milton", false),
                        new LineSubscriptionResponse("regional-rh", "RH", "Richmond Hill", false),
                        new LineSubscriptionResponse("regional-st", "ST", "Stouffville", false),
                        new LineSubscriptionResponse("regional-up", "UP", "Union Pearson Express", false)
                    ),
                    new EventTypePreferencesResponse(true, true, true, true, true)
                ),
                new ReminderTimingPreferencesResponse(true, true, true),
                PlannedClosureFollowUpPolicy.SMART.apiValue()
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
        String installationIdPrefix,
        String registrationReason,
        int previousEndpointCount,
        boolean enabled,
        String registrationInceptionAt,
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
        List<PushDeviceResponse> devices,
        String vapidKeyFingerprint
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
        String installationIdPrefix,
        String registrationReason,
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
        String installationIdPrefix,
        String registrationReason,
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
