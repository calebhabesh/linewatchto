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
    String targetRemoval,
    AlertImpactKind impactKind,
    String rszLength,
    String stationDistance,
    String trackPercent,
    String reducedSpeed,
    String averageSpeed,
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
) {
    public NormalizedRouteAlert withPeriods(List<NormalizedAlertPeriod> periods) {
        return new NormalizedRouteAlert(
            id, sourceId, lineId, type, severity, title, description, sourceAlertType,
            effect, effectDescription, direction, cause, causeDescription, targetRemoval,
            impactKind, rszLength, stationDistance, trackPercent, reducedSpeed, averageSpeed,
            startStationId, endStationId, activePeriodStart, activePeriodEnd, sourceUpdatedAt,
            shuttleType, shuttleStart, shuttleEnd, rawPayload, stationIds, List.copyOf(periods),
            fingerprint
        );
    }
}
