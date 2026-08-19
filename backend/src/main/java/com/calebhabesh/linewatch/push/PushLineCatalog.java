package com.calebhabesh.linewatch.push;

import java.util.List;

public final class PushLineCatalog {
    private static final List<LineMetadata> SUPPORTED_LINES = List.of(
        new LineMetadata("line-1", "1", "Yonge-University", "ttc"),
        new LineMetadata("line-2", "2", "Bloor-Danforth", "ttc"),
        new LineMetadata("line-4", "4", "Sheppard", "ttc"),
        new LineMetadata("line-5", "5", "Eglinton", "ttc"),
        new LineMetadata("line-6", "6", "Finch West", "ttc"),
        new LineMetadata("regional-br", "BR", "Barrie", "regional"),
        new LineMetadata("regional-ki", "KI", "Kitchener", "regional"),
        new LineMetadata("regional-le", "LE", "Lakeshore East", "regional"),
        new LineMetadata("regional-lw", "LW", "Lakeshore West", "regional"),
        new LineMetadata("regional-mi", "MI", "Milton", "regional"),
        new LineMetadata("regional-rh", "RH", "Richmond Hill", "regional"),
        new LineMetadata("regional-st", "ST", "Stouffville", "regional"),
        new LineMetadata("regional-up", "UP", "UP Express", "regional")
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
                if (lineId != null && lineId.startsWith("regional-")) {
                    return number.isEmpty() ? "GO / UP Rail" : number;
                }
                return number.isEmpty() ? "TTC" : "Line " + number;
            });
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    public record LineMetadata(String id, String number, String label, String networkId) {
        public String identity() {
            if ("regional-up".equals(id)) {
                return "UP Express";
            }
            if ("regional".equals(networkId)) {
                return "GO " + number + " " + label;
            }
            return "Line " + number + " " + label;
        }
    }
}
