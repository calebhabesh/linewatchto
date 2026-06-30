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
    String cause,
    String sourceTitle,
    String sourceDescription
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
        Instant sourceEventAt,
        String cause,
        String sourceDescription
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
            cause,
            null,
            sourceDescription
        );
    }

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
        Instant sourceEventAt,
        String cause
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
            cause,
            null,
            null
        );
    }

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
            null,
            null,
            null
        );
    }
}
