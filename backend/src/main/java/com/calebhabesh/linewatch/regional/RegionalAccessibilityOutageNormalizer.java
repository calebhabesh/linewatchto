package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class RegionalAccessibilityOutageNormalizer {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter METROLINX_DATE_TIME =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);
    private static final List<String> RESTORATION_PHRASES = List.of(
        "back in service", "returned to service", "now in service", "service restored"
    );

    private final ObjectMapper objectMapper;

    public RegionalAccessibilityOutageNormalizer() {
        this(JsonMapper.builder().findAndAddModules().build());
    }

    @Autowired
    public RegionalAccessibilityOutageNormalizer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public List<RegionalAccessibilityOutage> normalize(
        List<RegionalAccessibilityOutageReadRepository.SourceRecord> records
    ) {
        List<RegionalAccessibilityOutage> outages = new ArrayList<>();
        for (var record : records) {
            normalize(record).ifPresent(outages::add);
        }
        return List.copyOf(outages);
    }

    private java.util.Optional<RegionalAccessibilityOutage> normalize(
        RegionalAccessibilityOutageReadRepository.SourceRecord record
    ) {
        JsonNode message = parse(record.rawPayload());
        if (!"amenity".equalsIgnoreCase(text(message, "Category"))
            || !"elevator-escalator disruption".equalsIgnoreCase(text(message, "SubCategory"))) {
            return java.util.Optional.empty();
        }

        String title = text(message, "SubjectEnglish");
        String description = text(message, "BodyEnglish");
        String titleSearchable = title.toLowerCase(Locale.CANADA);
        String searchable = (title + " " + description).toLowerCase(Locale.CANADA);
        String assetType = titleSearchable.contains("escalator") ? "escalator"
            : titleSearchable.contains("elevator") ? "elevator"
            : searchable.contains("escalator") ? "escalator"
            : searchable.contains("elevator") ? "elevator"
            : null;
        if (assetType == null) {
            return java.util.Optional.empty();
        }

        List<String> stationIds = values(message.path("Stops"), "Code").stream()
            .map(RegionalNetworkCatalog::stationIdForStopCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        List<String> lineIds = values(message.path("Lines"), "Code").stream()
            .map(RegionalNetworkCatalog::lineIdForSourceCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .filter(lineId -> stationIds.stream().anyMatch(stationId ->
                RegionalNetworkCatalog.route(lineId)
                    .map(route -> route.stationIds().contains(stationId))
                    .orElse(false)))
            .toList();
        if (stationIds.isEmpty() || lineIds.isEmpty()) {
            return java.util.Optional.empty();
        }

        boolean restoration = RESTORATION_PHRASES.stream().anyMatch(searchable::contains);
        return java.util.Optional.of(new RegionalAccessibilityOutage(
            "regional-accessibility-" + safeId(record.sourceId()),
            record.sourceId(),
            assetType,
            EnglishClockTextFormatter.toTwelveHourClock(
                title.isBlank() ? humanizeAsset(assetType) + " service update" : title
            ),
            EnglishClockTextFormatter.toTwelveHourClock(description),
            text(message, "SubCategory"),
            parseTimestamp(text(message, "PostedDateTime"), record.lastSeenAt()),
            List.copyOf(new LinkedHashSet<>(stationIds)),
            List.copyOf(new LinkedHashSet<>(lineIds)),
            restoration
        ));
    }

    private JsonNode parse(String rawPayload) {
        try {
            return objectMapper.readTree(rawPayload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Unable to parse Metrolinx accessibility record", exception);
        }
    }

    private List<String> values(JsonNode array, String field) {
        if (array == null || !array.isArray()) return List.of();
        List<String> values = new ArrayList<>();
        array.forEach(node -> {
            String value = text(node, field);
            if (!value.isBlank()) values.add(value);
        });
        return List.copyOf(values);
    }

    private OffsetDateTime parseTimestamp(String value, OffsetDateTime fallback) {
        try {
            return LocalDateTime.parse(value, METROLINX_DATE_TIME).atZone(TORONTO_ZONE).toOffsetDateTime();
        } catch (DateTimeParseException ignored) {
            return fallback;
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private String safeId(String value) {
        return value.toLowerCase(Locale.CANADA).replaceAll("[^a-z0-9_-]+", "-");
    }

    private String humanizeAsset(String assetType) {
        return assetType.substring(0, 1).toUpperCase(Locale.CANADA) + assetType.substring(1);
    }
}
