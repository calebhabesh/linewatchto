package com.calebhabesh.linewatch.surface;

import java.time.OffsetDateTime;
import java.util.List;

public record SurfaceServiceNotice(
    String id,
    String sourceId,
    String category,
    String routeType,
    String title,
    String description,
    String headerText,
    String url,
    String effect,
    String effectDescription,
    String direction,
    String cause,
    String causeDescription,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    boolean active,
    String rawPayload,
    List<String> routeIds,
    List<StopDetail> stops
) {
    public record StopDetail(
        String stopId,
        String stopName
    ) {}
}
