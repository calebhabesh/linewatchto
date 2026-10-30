package com.calebhabesh.linewatch.regional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * The public notice text one extraction reads. Identical text is extracted once: the hash keys
 * stored results so later polls, restarts and republished copies reuse them.
 */
record RegionalAlertExtractionInput(
    String canonicalEventId,
    List<String> lineIds,
    String title,
    String description,
    List<String> structuredStationIds
) {
    RegionalAlertExtractionInput {
        lineIds = lineIds == null ? List.of() : List.copyOf(lineIds);
        title = title == null ? "" : title.strip();
        description = description == null ? "" : description.strip();
        structuredStationIds = structuredStationIds == null ? List.of() : List.copyOf(structuredStationIds);
    }

    static RegionalAlertExtractionInput of(RegionalAlertClassification classification) {
        return new RegionalAlertExtractionInput(classification.canonicalEventId(), classification.lineIds(),
            classification.title(), classification.description(), classification.stationIds());
    }

    /** Stations on the notice's lines in route order, without duplicates. */
    List<String> candidateStationIds() {
        List<String> stations = new ArrayList<>();
        for (String lineId : lineIds) {
            RegionalNetworkCatalog.route(lineId).ifPresent(route -> route.stationIds().stream()
                .filter(stationId -> !stations.contains(stationId))
                .forEach(stations::add));
        }
        return List.copyOf(stations);
    }

    String contentHash() {
        String canonical = String.join("\u001f", String.join(",", lineIds), title, description,
            String.join(",", structuredStationIds));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
