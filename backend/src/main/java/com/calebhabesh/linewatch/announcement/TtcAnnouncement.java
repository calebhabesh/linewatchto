package com.calebhabesh.linewatch.announcement;

import java.time.OffsetDateTime;

public record TtcAnnouncement(
    String id,
    String sourceId,
    String scope,
    String title,
    String description,
    String url,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    String rawPayload
) {}
