package com.calebhabesh.linewatch.station;

import java.util.Locale;
import java.util.regex.Pattern;

public final class StationDisplayNameFormatter {
    private static final Pattern TMU_WORD_PATTERN = Pattern.compile("(?i)\\btmu\\b");

    private StationDisplayNameFormatter() {}

    public static String fromStationId(String stationId) {
        String normalized = stationId == null ? "" : stationId.trim();
        if (normalized.isEmpty()) {
            return "";
        }

        String[] words = normalized.replace('_', '-').split("[-\\s]+");
        StringBuilder label = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!label.isEmpty()) {
                label.append(' ');
            }
            label.append(stationWord(word));
        }
        return label.toString();
    }

    public static String nullableFromStationId(String stationId) {
        String label = fromStationId(stationId);
        return label.isBlank() ? null : label;
    }

    public static String canonicalizeKnownStationAcronyms(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return TMU_WORD_PATTERN.matcher(value).replaceAll("TMU");
    }

    private static String stationWord(String word) {
        String normalized = word.toLowerCase(Locale.ROOT);
        if ("tmu".equals(normalized)) {
            return "TMU";
        }
        return normalized.substring(0, 1).toUpperCase(Locale.ROOT) + normalized.substring(1);
    }
}
