package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;

/**
 * One estimated train marker. {@code progress} runs from the segment's
 * {@code fromStationId} (0) to {@code nextStationId} (1). When {@code timed},
 * it comes from {@code predictedAt} (the predicted arrival at the next
 * station) and {@code segmentTravelSeconds}, so clients can advance it
 * between snapshots; otherwise it is a coarse status placement.
 */
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
    boolean timed,
    String vehicleId,
    String tripId,
    OffsetDateTime updatedAt,
    String source
) {}
