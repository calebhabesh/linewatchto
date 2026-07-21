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
    String sourceDescription,
    String closureHours,
    String closureDates
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
        String sourceTitle,
        String sourceDescription,
        String closureHours
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
            sourceTitle,
            sourceDescription,
            closureHours,
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
        Instant sourceEventAt,
        String cause,
        String sourceTitle,
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
            sourceTitle,
            sourceDescription,
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
            sourceDescription,
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
            null,
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
            null,
            null,
            null
        );
    }
}
