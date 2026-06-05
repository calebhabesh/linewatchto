package com.calebhabesh.linewatch.arrival.schedule;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class GtfsCsvReader {
    private GtfsCsvReader() {
    }

    public static List<Row> read(Reader reader) throws IOException {
        try (BufferedReader buffered = new BufferedReader(reader)) {
            String headerLine = buffered.readLine();
            if (headerLine == null || headerLine.isBlank()) {
                return List.of();
            }
            List<String> headers = parseLine(headerLine);
            List<Row> rows = new ArrayList<>();
            String line;
            while ((line = buffered.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                List<String> values = parseLine(line);
                Map<String, String> byHeader = new LinkedHashMap<>();
                for (int index = 0; index < headers.size(); index++) {
                    String value = index < values.size() ? values.get(index) : "";
                    byHeader.put(headers.get(index), value);
                }
                rows.add(new Row(byHeader));
            }
            return rows;
        }
    }

    static List<String> parseLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char ch = line.charAt(index);
            if (ch == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append('"');
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                values.add(current.toString().trim());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        values.add(current.toString().trim());
        return values;
    }

    public static int seconds(String gtfsTime) {
        String[] parts = gtfsTime.trim().split(":");
        if (parts.length != 3) {
            throw new IllegalArgumentException("Invalid GTFS time: " + gtfsTime);
        }
        return Integer.parseInt(parts[0]) * 3600
            + Integer.parseInt(parts[1]) * 60
            + Integer.parseInt(parts[2]);
    }

    public static String normalizeStationName(String value) {
        return value == null ? "" : value
            .toLowerCase(Locale.ROOT)
            .replace(".", "")
            .replace("-", " ")
            .replaceAll("\\bstation\\b", "")
            .replaceAll("[^a-z0-9 ]", " ")
            .replaceAll("\\s+", " ")
            .trim();
    }

    public record Row(Map<String, String> values) {
        public String value(String key) {
            return values.getOrDefault(key, "").trim();
        }
    }
}
