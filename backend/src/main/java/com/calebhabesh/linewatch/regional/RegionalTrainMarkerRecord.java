package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;

public record RegionalTrainMarkerRecord(
    String id,
    String lineId,
    String direction,
    String travelDirection,
    String segmentId,
    String fromStationId,
    String toStationId,
    String nextStationId,
    double progress,
    int segmentTravelSeconds,
    OffsetDateTime predictedAt,
    boolean moving,
    String vehicleId,
    String tripId,
    OffsetDateTime updatedAt,
    String source
) {}
