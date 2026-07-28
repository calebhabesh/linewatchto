package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalNormalizedAlert(
    String id,
    String sourceSystem,
    String sourceId,
    String lineId,
    String impactKind,
    String title,
    String description,
    String cause,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    List<String> stationIds,
    List<String> affectedSegmentIds,
    String rawPayload
) {}
