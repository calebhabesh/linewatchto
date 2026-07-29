package com.calebhabesh.linewatch.regional;

import java.time.OffsetDateTime;

public record RegionalArrivalRecord(
    String lineId,
    String direction,
    OffsetDateTime scheduledAt,
    OffsetDateTime predictedAt,
    String platform,
    String tripNumber,
    String source,
    String status
) {
}
