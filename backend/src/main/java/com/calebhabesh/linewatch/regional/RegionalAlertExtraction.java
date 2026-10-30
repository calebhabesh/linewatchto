package com.calebhabesh.linewatch.regional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import tools.jackson.databind.JsonNode;

/**
 * A model's reading of one Metrolinx notice, after validation against the network catalog.
 * Every station is a catalog ID on the notice's lines; free text never reaches riders.
 */
record RegionalAlertExtraction(
    String effect,
    String scope,
    /** Closed sections for a segment span, as consecutive station pairs (see {@link RegionalSpans}). */
    List<String> spans,
    List<String> listedStations,
    String replacement,
    List<String> skippedStations,
    String statedWindow,
    String confidence
) {
    static final Set<String> EFFECTS = Set.of("no-service", "delay", "service-adjustment", "trip-cancellation",
        "service-resumed", "service-recovering", "unknown");
    static final Set<String> SCOPES = Set.of("corridor", "segment-span", "listed-stations", "unknown");
    static final Set<String> REPLACEMENTS = Set.of("go-bus", "bus", "none", "unknown");
    static final Set<String> CONFIDENCES = Set.of("high", "medium", "low");

    RegionalAlertExtraction {
        spans = spans == null ? List.of() : List.copyOf(spans);
        listedStations = listedStations == null ? List.of() : List.copyOf(listedStations);
        skippedStations = skippedStations == null ? List.of() : List.copyOf(skippedStations);
    }

    boolean highConfidence() {
        return "high".equals(confidence);
    }

    /** Span pairs for a segment span, or an empty list. */
    List<String> span() {
        return "segment-span".equals(scope) ? spans : List.of();
    }

    /** The classification's replacement-service value for this reading. */
    String replacementService() {
        return "go-bus".equals(replacement) || "bus".equals(replacement) ? replacement : null;
    }

    record Validation(RegionalAlertExtraction extraction, String rejection) {
        boolean valid() { return extraction != null; }
    }

    /** Checks a structured model reply against the notice's lines. Rejections carry a short safe code. */
    static Validation validate(JsonNode reply, RegionalAlertExtractionInput input) {
        if (reply == null || !reply.isObject()) return reject("not-an-object");
        List<String> candidates = input.candidateStationIds();
        String effect = enumValue(reply, "effect", EFFECTS);
        String scope = enumValue(reply, "scope", SCOPES);
        String replacement = enumValue(reply, "replacement", REPLACEMENTS);
        String confidence = enumValue(reply, "confidence", CONFIDENCES);
        if (effect == null) return reject("effect");
        if (scope == null) return reject("scope");
        if (replacement == null) replacement = "unknown";
        if (confidence == null) return reject("confidence");
        List<List<String>> sections = sections(reply);
        if (sections == null) {
            if ("segment-span".equals(scope)) return reject("span-missing");
            sections = List.of();
        }
        List<String> listed = stations(reply, "listedStations");
        List<String> skipped = stations(reply, "skippedStations");
        List<String> mentioned = new ArrayList<>(RegionalSpans.flatten(sections));
        mentioned.addAll(listed);
        mentioned.addAll(skipped);
        for (String stationId : mentioned) {
            if (!candidates.contains(stationId)) return reject("unknown-station");
        }
        List<String> span = List.of();
        switch (scope) {
            case "segment-span" -> {
                if (sections.isEmpty()) return reject("span-missing");
                for (List<String> section : sections) {
                    if (section.getFirst().equals(section.getLast())) return reject("span-single-station");
                    if (RegionalSpans.route(input.lineIds(), section).isEmpty()) return reject("span-off-line");
                }
                span = RegionalSpans.normalize(input.lineIds(), sections);
                listed = List.of();
            }
            case "listed-stations" -> {
                if (listed.isEmpty()) return reject("listed-missing");
            }
            default -> listed = List.of();
        }
        List<String> endpoints = span;
        skipped = skipped.stream().filter(stationId -> !endpoints.contains(stationId)).toList();
        String window = reply.path("statedWindow").isString() ? reply.path("statedWindow").asString().strip() : null;
        if (window != null && (window.isEmpty() || window.length() > 200)) window = null;
        return new Validation(new RegionalAlertExtraction(effect, scope, span, listed, replacement,
            skipped, window, confidence), null);
    }

    /**
     * The reply's closed sections: {@code spans} as [{from, to}], or the earlier single
     * {@code spanFrom}/{@code spanTo} pair. Null when a section is missing an end.
     */
    private static List<List<String>> sections(JsonNode reply) {
        List<List<String>> sections = new ArrayList<>();
        JsonNode spans = reply.path("spans");
        if (spans.isArray()) {
            for (JsonNode section : spans) {
                String from = station(section, "from");
                String to = station(section, "to");
                if (from == null || to == null) return null;
                List<String> pair = List.of(from, to);
                if (!sections.contains(pair)) sections.add(pair);
            }
            return List.copyOf(sections);
        }
        String from = station(reply, "spanFrom");
        String to = station(reply, "spanTo");
        if (from == null && to == null) return List.of();
        if (from == null || to == null) return null;
        return List.of(List.of(from, to));
    }

    private static Validation reject(String reason) {
        return new Validation(null, reason);
    }

    private static String enumValue(JsonNode reply, String field, Set<String> allowed) {
        JsonNode value = reply.path(field);
        if (!value.isString()) return null;
        String normalized = value.asString().strip().toLowerCase(Locale.ROOT);
        return allowed.contains(normalized) ? normalized : null;
    }

    private static String station(JsonNode reply, String field) {
        JsonNode value = reply.path(field);
        if (!value.isString() || value.asString().isBlank()) return null;
        return value.asString().strip().toLowerCase(Locale.ROOT);
    }

    private static List<String> stations(JsonNode reply, String field) {
        List<String> stations = new ArrayList<>();
        JsonNode values = reply.path(field);
        if (!values.isArray()) return List.of();
        for (JsonNode value : values) {
            if (!value.isString() || value.asString().isBlank()) continue;
            String stationId = value.asString().strip().toLowerCase(Locale.ROOT);
            if (!stations.contains(stationId)) stations.add(stationId);
        }
        return List.copyOf(stations);
    }

}
