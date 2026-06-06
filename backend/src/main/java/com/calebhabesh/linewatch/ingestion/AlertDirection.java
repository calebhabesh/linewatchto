package com.calebhabesh.linewatch.ingestion;

import java.util.Locale;

public enum AlertDirection {
    NORTHBOUND("northbound"),
    SOUTHBOUND("southbound"),
    EASTBOUND("eastbound"),
    WESTBOUND("westbound"),
    BIDIRECTIONAL("bidirectional"),
    UNKNOWN("unknown");

    private final String wireValue;

    AlertDirection(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }

    public static AlertDirection fromWireValue(String value) {
        if (value == null || value.isBlank()) {
            return UNKNOWN;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if ("both way".equals(normalized)
            || "both ways".equals(normalized)
            || "both directions".equals(normalized)
            || "in both directions".equals(normalized)) {
            return BIDIRECTIONAL;
        }
        for (AlertDirection direction : values()) {
            if (direction.wireValue.equals(normalized)) {
                return direction;
            }
        }
        return UNKNOWN;
    }
}
