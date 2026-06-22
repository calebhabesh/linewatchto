package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record FormattedPushNotification(
    String title,
    String body,
    String notificationSubject,
    String eventLocation,
    String scopeLabel,
    Instant sourceEventAt
) {}
