package com.calebhabesh.linewatch.arrival.live;

import java.time.OffsetDateTime;
import java.util.List;

public record EstimatedTrainMarkerSnapshot(
    boolean fresh,
    String source,
    String message,
    String disclaimer,
    OffsetDateTime feedCreatedAt,
    OffsetDateTime generatedAt,
    List<EstimatedTrainMarker> markers
) {
    public EstimatedTrainMarkerSnapshot {
        markers = List.copyOf(markers);
    }

    public static EstimatedTrainMarkerSnapshot unavailable(
        String source,
        String message,
        String disclaimer,
        OffsetDateTime generatedAt
    ) {
        return new EstimatedTrainMarkerSnapshot(false, source, message, disclaimer, null, generatedAt, List.of());
    }
}
