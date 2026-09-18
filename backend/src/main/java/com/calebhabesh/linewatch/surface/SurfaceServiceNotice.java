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
    List<StopDetail> stops,
    String alertClass
) {
    public static final String SERVICE_ALERT = "service-alert";
    public static final String SERVICE_ADVISORY = "service-advisory";

    public SurfaceServiceNotice(
        String id, String sourceId, String category, String routeType, String title,
        String description, String headerText, String url, String effect,
        String effectDescription, String direction, String cause, String causeDescription,
        OffsetDateTime activePeriodStart, OffsetDateTime activePeriodEnd,
        OffsetDateTime sourceUpdatedAt, boolean active, String rawPayload,
        List<String> routeIds, List<StopDetail> stops
    ) {
        this(id, sourceId, category, routeType, title, description, headerText, url,
            effect, effectDescription, direction, cause, causeDescription,
            activePeriodStart, activePeriodEnd, sourceUpdatedAt, active, rawPayload,
            routeIds, stops, SERVICE_ALERT);
    }

    public record StopDetail(
        String stopId,
        String stopName
    ) {}
}
