package com.calebhabesh.linewatch.arrival;

import java.time.OffsetDateTime;

public record ArrivalPrediction(
    String lineId,
    String direction,
    Integer minutes,
    OffsetDateTime predictedAt,
    String source,
    String status,
    String label
) {
    public static ArrivalPrediction scheduled(
        String lineId,
        String direction,
        Integer minutes,
        OffsetDateTime predictedAt,
        String source
    ) {
        String label = minutes == null ? "No scheduled service" : minutes <= 0 ? "Due" : minutes + " min";
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, source, "scheduled", label);
    }

    public static ArrivalPrediction unavailable(String lineId, String direction) {
        return new ArrivalPrediction(lineId, direction, null, null, "TTC scheduled service unavailable", "unavailable", "Unavailable");
    }

    public static ArrivalPrediction demo(String lineId, String direction, int minutes, OffsetDateTime predictedAt) {
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, "Demo estimates", "demo", minutes + " min");
    }
}
