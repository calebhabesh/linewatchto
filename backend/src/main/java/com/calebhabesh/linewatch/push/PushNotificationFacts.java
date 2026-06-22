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
    Instant sourceEventAt
) {}
