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
    String spanFrom,
    String spanTo,
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
        listedStations = listedStations == null ? List.of() : List.copyOf(listedStations);
        skippedStations = skippedStations == null ? List.of() : List.copyOf(skippedStations);
    }

    boolean highConfidence() {
        return "high".equals(confidence);
    }

    /** Span endpoints for a segment span, or an empty list. */
    List<String> span() {
        return "segment-span".equals(scope) ? List.of(spanFrom, spanTo) : List.of();
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
        String spanFrom = station(reply, "spanFrom");
        String spanTo = station(reply, "spanTo");
        List<String> listed = stations(reply, "listedStations");
        List<String> skipped = stations(reply, "skippedStations");
        for (String stationId : concat(spanFrom, spanTo, listed, skipped)) {
            if (!candidates.contains(stationId)) return reject("unknown-station");
        }
        switch (scope) {
            case "segment-span" -> {
                if (spanFrom == null || spanTo == null) return reject("span-missing");
                if (spanFrom.equals(spanTo)) return reject("span-single-station");
                String from = spanFrom;
                String to = spanTo;
                if (input.lineIds().stream().map(RegionalNetworkCatalog::route).flatMap(java.util.Optional::stream)
                    .noneMatch(route -> route.stationIds().contains(from) && route.stationIds().contains(to))) {
                    return reject("span-off-line");
                }
                listed = List.of();
            }
            case "listed-stations" -> {
                if (listed.isEmpty()) return reject("listed-missing");
                spanFrom = null;
                spanTo = null;
            }
            default -> {
                spanFrom = null;
                spanTo = null;
                listed = List.of();
            }
        }
        List<String> endpoints = new ArrayList<>();
        if (spanFrom != null) endpoints.add(spanFrom);
        if (spanTo != null) endpoints.add(spanTo);
        skipped = skipped.stream().filter(stationId -> !endpoints.contains(stationId)).toList();
        String window = reply.path("statedWindow").isString() ? reply.path("statedWindow").asString().strip() : null;
        if (window != null && (window.isEmpty() || window.length() > 200)) window = null;
        return new Validation(new RegionalAlertExtraction(effect, scope, spanFrom, spanTo, listed, replacement,
            skipped, window, confidence), null);
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

    private static List<String> concat(String spanFrom, String spanTo, List<String> listed, List<String> skipped) {
        List<String> all = new ArrayList<>();
        if (spanFrom != null) all.add(spanFrom);
        if (spanTo != null) all.add(spanTo);
        all.addAll(listed);
        all.addAll(skipped);
        return all;
    }
}
