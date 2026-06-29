package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record PushNotificationCandidate(
    String accountId,
    String commuteId,
    String legId,
    String lineId,
    String lineNumber,
    String category,
    String eventType,
    String reminderBucket,
    String notificationKey,
    String dedupeKey,
    FormattedPushNotification notification,
    String url
) {
    public boolean savedCommuteScoped() {
        return commuteId != null && !commuteId.isBlank();
    }

    public boolean lineScoped() {
        return lineId != null && !lineId.isBlank() && !savedCommuteScoped();
    }

    public boolean clearedUpdate() {
        return "service-restored".equals(eventType);
    }

    public String title() {
        return notification.title();
    }

    public String body() {
        return notification.body();
    }

    public String notificationSubject() {
        return notification.notificationSubject();
    }

    public String eventLocation() {
        return notification.eventLocation();
    }

    public String displayDirection() {
        return notification.displayDirection();
    }

    public String scopeLabel() {
        return notification.scopeLabel();
    }

    public Instant sourceEventAt() {
        return notification.sourceEventAt();
    }
}
