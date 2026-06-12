package com.calebhabesh.linewatch.push;

public record PushNotificationCandidate(
    String accountId,
    String commuteId,
    String legId,
    String category,
    String dedupeKey,
    String title,
    String body,
    String url
) {}
