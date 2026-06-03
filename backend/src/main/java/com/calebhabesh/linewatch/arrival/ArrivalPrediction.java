package com.calebhabesh.linewatch.arrival;

import java.time.OffsetDateTime;

public record ArrivalPrediction(
    String lineId,
    String direction,
    Integer minutes,
    OffsetDateTime predictedAt,
    String source,
    String status
) {}
