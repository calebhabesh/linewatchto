package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record PushNotificationFacts(
    String lineId,
    String lineNumber,
    String eventType,
    String reminderBucket,
    String location,
    String displayDirection,
    boolean shuttle,
    String commuteLabel,
    String legId,
    Instant sourceEventAt,
    String cause
) {
    public PushNotificationFacts(
        String lineId,
        String lineNumber,
        String eventType,
        String reminderBucket,
        String location,
        String displayDirection,
        boolean shuttle,
        String commuteLabel,
        String legId,
        Instant sourceEventAt
    ) {
        this(
            lineId,
            lineNumber,
            eventType,
            reminderBucket,
            location,
            displayDirection,
            shuttle,
            commuteLabel,
            legId,
            sourceEventAt,
            null
        );
    }
}
