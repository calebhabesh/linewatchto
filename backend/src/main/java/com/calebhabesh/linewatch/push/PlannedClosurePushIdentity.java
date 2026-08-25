package com.calebhabesh.linewatch.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

final class PlannedClosurePushIdentity {
    static final String UPDATE_PREFIX = "planned-closure-content-v1:";
    private static final long OCCURRENCE_BUCKET_SECONDS = 30 * 60;

    private PlannedClosurePushIdentity() {}

    static String stableId(
        String lineId,
        List<String> affectedSegmentIds,
        String location,
        OffsetDateTime eventStartAt,
        String fallbackSourceId
    ) {
        if (eventStartAt == null) {
            return normalize(fallbackSourceId);
        }
        String scope = affectedSegmentIds == null ? "" : affectedSegmentIds.stream()
            .map(PlannedClosurePushIdentity::normalize)
            .filter(value -> !value.isBlank())
            .distinct()
            .sorted()
            .collect(java.util.stream.Collectors.joining(","));
        if (scope.isBlank()) {
            scope = normalize(location);
        }
        return "planned-closure-" + hash(
            normalize(lineId),
            scope,
            occurrenceBucket(eventStartAt)
        ).substring(0, 24);
    }

    private static String occurrenceBucket(OffsetDateTime eventStartAt) {
        long epochSecond = eventStartAt.toInstant().getEpochSecond();
        long halfBucket = OCCURRENCE_BUCKET_SECONDS / 2;
        return Long.toString(Math.floorDiv(epochSecond + halfBucket, OCCURRENCE_BUCKET_SECONDS));
    }

    static String updateFingerprint(
        String stableId,
        String eventType,
        String location,
        String displayDirection,
        boolean shuttle,
        String cause,
        String closureHours,
        String closureDates
    ) {
        return UPDATE_PREFIX + hash(
            normalize(stableId),
            normalize(eventType),
            normalize(location),
            normalize(displayDirection),
            Boolean.toString(shuttle),
            normalizeCause(cause),
            normalize(closureHours),
            normalize(closureDates)
        );
    }

    private static String hash(String... values) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256")
                    .digest(String.join("\u001f", values).getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Could not fingerprint planned closure", exception);
        }
    }

    private static String normalize(String value) {
        return value == null
            ? ""
            : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static String normalizeCause(String value) {
        String normalized = normalize(value);
        if (normalized.contains("track work")) {
            return "planned track work";
        }
        return normalized;
    }
}
