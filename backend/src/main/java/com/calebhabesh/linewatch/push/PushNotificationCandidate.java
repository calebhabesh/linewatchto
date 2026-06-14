package com.calebhabesh.linewatch.push;

public record PushNotificationCandidate(
    String accountId,
    String commuteId,
    String legId,
    String lineId,
    String category,
    String eventType,
    String reminderBucket,
    String notificationKey,
    String dedupeKey,
    String title,
    String body,
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
}
