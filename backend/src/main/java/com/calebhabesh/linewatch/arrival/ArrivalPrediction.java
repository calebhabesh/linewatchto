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
    public static String formatMinutes(int minutes) {
        if (minutes <= 0) return "Due";
        if (minutes < 60) return minutes + " min";
        int hours = minutes / 60;
        int remaining = minutes % 60;
        return remaining == 0 ? hours + " hr" : hours + " hr " + remaining + " min";
    }

    public static ArrivalPrediction scheduled(
        String lineId,
        String direction,
        Integer minutes,
        OffsetDateTime predictedAt,
        String source
    ) {
        String label = minutes == null ? "No scheduled service" : formatMinutes(minutes);
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, source, "scheduled", label);
    }

    public static ArrivalPrediction live(
        String lineId,
        String direction,
        Integer minutes,
        OffsetDateTime predictedAt,
        String source
    ) {
        String label = minutes == null ? "Unavailable" : formatMinutes(minutes);
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, source, "live", label);
    }

    public static ArrivalPrediction unavailable(String lineId, String direction) {
        return new ArrivalPrediction(lineId, direction, null, null, "TTC scheduled service unavailable", "unavailable", "Unavailable");
    }

    public static ArrivalPrediction demo(String lineId, String direction, int minutes, OffsetDateTime predictedAt) {
        return new ArrivalPrediction(lineId, direction, minutes, predictedAt, "Demo estimates", "demo", formatMinutes(minutes));
    }
}
