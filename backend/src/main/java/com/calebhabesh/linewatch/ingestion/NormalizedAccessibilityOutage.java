package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

public record NormalizedAccessibilityOutage(
    String id,
    String sourceId,
    String assetType,
    String title,
    String description,
    String effect,
    String effectDescription,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    String rawPayload,
    List<String> stationIds
) {}
