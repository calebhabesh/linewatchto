package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public record RegionalAccessibilityOutage(
    String id,
    String sourceId,
    String assetType,
    String title,
    String description,
    String cause,
    OffsetDateTime updatedAt,
    List<String> stationIds,
    List<String> lineIds,
    boolean restoration
) {}
