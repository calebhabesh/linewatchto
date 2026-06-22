package com.calebhabesh.linewatch.push;

import java.util.List;

public final class PushLineCatalog {
    private static final List<LineMetadata> SUPPORTED_LINES = List.of(
        new LineMetadata("line-1", "1", "Yonge-University"),
        new LineMetadata("line-2", "2", "Bloor-Danforth"),
        new LineMetadata("line-4", "4", "Sheppard"),
        new LineMetadata("line-5", "5", "Eglinton"),
        new LineMetadata("line-6", "6", "Finch West")
    );

    private PushLineCatalog() {}

    public static List<LineMetadata> supportedLines() {
        return SUPPORTED_LINES;
    }

    public static String identity(String lineId, String fallbackLineNumber) {
        return SUPPORTED_LINES.stream()
            .filter(line -> line.id().equals(lineId))
            .findFirst()
            .map(LineMetadata::identity)
            .orElseGet(() -> {
                String number = normalize(fallbackLineNumber);
                return number.isEmpty() ? "TTC" : "Line " + number;
            });
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    public record LineMetadata(String id, String number, String label) {
        public String identity() {
            return "Line " + number + " " + label;
        }
    }
}
