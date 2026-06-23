package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.List;

public final class AlertHistoryResponses {
    private AlertHistoryResponses() {}

    public record AlertHistoryResponse(
        OffsetDateTime generatedAt,
        String period,
        OffsetDateTime since,
        OffsetDateTime until,
        List<AlertHistoryIncidentDto> incidents
    ) {}

    public record AlertHistoryIncidentDto(
        String alertId,
        String sourceId,
        String lineId,
        String lineNumber,
        String lineName,
        String eventType,
        String title,
        String location,
        String displayDirection,
        String source,
        String cause,
        String status,
        OffsetDateTime firstSeenAt,
        OffsetDateTime lastUpdatedAt,
        OffsetDateTime clearedAt,
        Long durationMinutes,
        List<AlertHistoryEventDto> events
    ) {}

    public record AlertHistoryEventDto(
        Long id,
        String state,
        String label,
        OffsetDateTime happenedAt,
        String title,
        String description,
        String location,
        String displayDirection,
        String cause,
        String source
    ) {}
}
