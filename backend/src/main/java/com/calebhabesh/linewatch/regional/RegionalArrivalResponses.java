package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;
import java.util.List;

public final class RegionalArrivalResponses {
    private RegionalArrivalResponses() {
    }

    public record SnapshotResponse(
        String stationId,
        String stationName,
        String availability,
        OffsetDateTime generatedAt,
        OffsetDateTime sourceUpdatedAt,
        String source,
        String message,
        List<ArrivalResponse> arrivals
    ) {
    }

    public record ArrivalResponse(
        String lineId,
        String lineNumber,
        String lineName,
        String direction,
        int minutes,
        OffsetDateTime predictedAt,
        OffsetDateTime scheduledAt,
        int delayMinutes,
        String platform,
        String tripNumber,
        String source,
        String status
    ) {
    }
}
