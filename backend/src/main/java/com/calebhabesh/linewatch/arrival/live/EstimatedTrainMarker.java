package com.calebhabesh.linewatch.arrival.live;

import java.time.OffsetDateTime;

public record EstimatedTrainMarker(
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
    String vehicleId,
    String tripId,
    OffsetDateTime feedCreatedAt,
    OffsetDateTime updatedAt
) {}
