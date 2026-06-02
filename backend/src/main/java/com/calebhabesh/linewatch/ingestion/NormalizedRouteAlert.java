package com.calebhabesh.linewatch.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

public record NormalizedRouteAlert(
    String id,
    String sourceId,
    String lineId,
    String type,
    String severity,
    String title,
    String description,
    String sourceAlertType,
    String effect,
    String effectDescription,
    AlertDirection direction,
    String cause,
    String causeDescription,
    String startStationId,
    String endStationId,
    OffsetDateTime activePeriodStart,
    OffsetDateTime activePeriodEnd,
    OffsetDateTime sourceUpdatedAt,
    String shuttleType,
    String shuttleStart,
    String shuttleEnd,
    String rawPayload,
    List<String> stationIds,
    List<NormalizedAlertPeriod> periods,
    String fingerprint
) {}
