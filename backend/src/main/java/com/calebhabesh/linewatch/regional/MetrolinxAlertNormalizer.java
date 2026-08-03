package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

@Component
public class MetrolinxAlertNormalizer {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter METROLINX_DATE_TIME =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);
    private static final Map<String, String> LINE_IDS = Map.ofEntries(
        Map.entry("BR", "regional-br"),
        Map.entry("GT", "regional-ki"),
        Map.entry("KI", "regional-ki"),
        Map.entry("LE", "regional-le"),
        Map.entry("LW", "regional-lw"),
        Map.entry("MI", "regional-mi"),
        Map.entry("RH", "regional-rh"),
        Map.entry("ST", "regional-st"),
        Map.entry("UP", "regional-up")
    );
    private static final Set<String> SUSPENSION_EFFECTS = Set.of(
        "NO_SERVICE", "STOP_CLOSED"
    );
    private static final Set<String> SUSPENSION_WORDS = Set.of(
        "no service", "service suspended", "service suspension", "all trips cancelled",
        "all trains cancelled", "line closed"
    );
    private static final Set<String> PLANNED_WORDS = Set.of(
        "planned service", "planned closure", "scheduled service change"
    );

    private final ObjectMapper objectMapper;
    private final Clock clock;

    public MetrolinxAlertNormalizer(Clock clock) {
        this(new ObjectMapper(), clock);
    }

    @Autowired
    public MetrolinxAlertNormalizer(ObjectMapper objectMapper, Clock clock) {
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public List<RegionalNormalizedAlert> normalize(MetrolinxFeed feed) {
        List<RegionalNormalizedAlert> alerts = new ArrayList<>();
        for (MetrolinxFetchedRecord record : feed.records()) {
            if (MetrolinxSourceSystem.GO_SERVICE_ALERTS.equals(record.sourceSystem())) {
                alerts.addAll(normalizeGoServiceAlert(record, feed.sourceUpdatedAt()));
            } else if (MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(record.sourceSystem())) {
                normalizeUpAlert(record, feed.sourceUpdatedAt()).ifPresent(alerts::add);
            }
        }
        return List.copyOf(alerts);
    }

    private List<RegionalNormalizedAlert> normalizeGoServiceAlert(
        MetrolinxFetchedRecord record,
        OffsetDateTime sourceUpdatedAt
    ) {
        JsonNode message = parse(record.rawPayload());
        if (!"service disruption".equalsIgnoreCase(text(message, "Category"))) {
            return List.of();
        }
        List<String> lineIds = values(message.path("Lines"), "Code").stream()
            .map(value -> LINE_IDS.get(value.trim().toUpperCase(Locale.CANADA)))
            .filter(java.util.Objects::nonNull)
            .distinct()
            .toList();
        if (lineIds.isEmpty()) {
            return List.of();
        }

        String title = firstNonBlank(text(message, "SubjectEnglish"), "GO service update");
        String description = firstNonBlank(text(message, "BodyEnglish"), title);
        OffsetDateTime postedAt = parseMetrolinxDateTime(text(message, "PostedDateTime"));
        List<String> stationIds = values(message.path("Stops"), "Code").stream()
            .map(RegionalNetworkCatalog::stationIdForStopCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        String kind = classify(text(message, "SubCategory"), title, description, null, postedAt);

        return lineIds.stream().map(lineId -> normalized(
            record,
            lineId,
            kind,
            title,
            description,
            firstNonBlank(text(message, "SubCategory"), text(message, "Category")),
            postedAt,
            null,
            sourceUpdatedAt,
            stationIds
        )).toList();
    }

    private java.util.Optional<RegionalNormalizedAlert> normalizeUpAlert(
        MetrolinxFetchedRecord record,
        OffsetDateTime sourceUpdatedAt
    ) {
        JsonNode entity = parse(record.rawPayload());
        if (entity.path("is_deleted").asBoolean(false) || !entity.path("alert").isObject()) {
            return java.util.Optional.empty();
        }
        JsonNode alert = entity.path("alert");
        List<JsonNode> periods = elements(alert.path("active_period"));
        OffsetDateTime startsAt = periods.stream()
            .map(period -> epoch(period.get("start")))
            .filter(java.util.Objects::nonNull)
            .min(OffsetDateTime::compareTo)
            .orElse(null);
        OffsetDateTime endsAt = periods.stream()
            .map(period -> epoch(period.get("end")))
            .filter(java.util.Objects::nonNull)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
        if (endsAt != null && !endsAt.isAfter(OffsetDateTime.now(clock))) {
            return java.util.Optional.empty();
        }

        String title = translation(alert.path("header_text"), "UP Express service update");
        String description = translation(alert.path("description_text"), title);
        String effect = text(alert, "effect").toUpperCase(Locale.CANADA);
        String cause = text(alert, "cause");
        List<String> stationIds = elements(alert.path("informed_entity")).stream()
            .map(entityNode -> text(entityNode, "stop_id"))
            .map(RegionalNetworkCatalog::stationIdForStopCode)
            .flatMap(java.util.Optional::stream)
            .distinct()
            .toList();
        String kind = classify(cause, title, description, effect, startsAt);
        return java.util.Optional.of(normalized(
            record,
            "regional-up",
            kind,
            title,
            description,
            firstNonBlank(humanize(cause), humanize(effect)),
            startsAt,
            endsAt,
            sourceUpdatedAt,
            stationIds
        ));
    }

    private RegionalNormalizedAlert normalized(
        MetrolinxFetchedRecord record,
        String lineId,
        String kind,
        String title,
        String description,
        String cause,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        OffsetDateTime sourceUpdatedAt,
        List<String> stationIds
    ) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
        String lineNumber = route == null ? "regional" : route.number();
        List<String> lineStationIds = route == null
            ? stationIds
            : stationIds.stream().filter(route.stationIds()::contains).toList();
        return new RegionalNormalizedAlert(
            "regional-" + sourceSuffix(record.sourceSystem()) + "-" + safeId(record.sourceId()) + "-" + lineNumber.toLowerCase(Locale.CANADA),
            record.sourceSystem(),
            record.sourceId(),
            lineId,
            kind,
            EnglishClockTextFormatter.toTwelveHourClock(title.trim()),
            EnglishClockTextFormatter.toTwelveHourClock(description.trim()),
            cause,
            startsAt,
            endsAt,
            sourceUpdatedAt,
            List.copyOf(new LinkedHashSet<>(lineStationIds)),
            RegionalNetworkCatalog.segmentIds(lineId, lineStationIds),
            record.rawPayload()
        );
    }

    private String classify(
        String sourceCategory,
        String title,
        String description,
        String effect,
        OffsetDateTime startsAt
    ) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (startsAt != null && startsAt.isAfter(now)) {
            return "planned-closure";
        }
        String searchable = (firstNonBlank(sourceCategory, "") + " " + title + " " + description)
            .toLowerCase(Locale.CANADA);
        if (effect != null && SUSPENSION_EFFECTS.contains(effect)) {
            return "suspension";
        }
        if (SUSPENSION_WORDS.stream().anyMatch(searchable::contains)) {
            return "suspension";
        }
        if (PLANNED_WORDS.stream().anyMatch(searchable::contains)) {
            return "planned-closure";
        }
        return "delay";
    }

    private JsonNode parse(String rawPayload) {
        try {
            return objectMapper.readTree(rawPayload);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Unable to parse Metrolinx alert record", exception);
        }
    }

    private List<String> values(JsonNode array, String field) {
        return elements(array).stream().map(node -> text(node, field)).filter(value -> !value.isBlank()).toList();
    }

    private List<JsonNode> elements(JsonNode array) {
        if (array == null || !array.isArray()) {
            return List.of();
        }
        List<JsonNode> values = new ArrayList<>();
        array.forEach(values::add);
        return List.copyOf(values);
    }

    private String translation(JsonNode translatedString, String fallback) {
        List<JsonNode> translations = elements(translatedString.path("translation"));
        return translations.stream()
            .filter(node -> "en".equalsIgnoreCase(text(node, "language")))
            .map(node -> text(node, "text"))
            .filter(value -> !value.isBlank())
            .findFirst()
            .orElseGet(() -> translations.stream()
                .map(node -> text(node, "text"))
                .filter(value -> !value.isBlank())
                .findFirst()
                .orElse(fallback));
    }

    private OffsetDateTime parseMetrolinxDateTime(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(value.trim(), METROLINX_DATE_TIME).atZone(TORONTO_ZONE).toOffsetDateTime();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private OffsetDateTime epoch(JsonNode value) {
        if (value == null || value.isNull() || !value.canConvertToLong()) {
            return null;
        }
        long seconds = value.asLong();
        return seconds <= 0 ? null : OffsetDateTime.ofInstant(Instant.ofEpochSecond(seconds), ZoneOffset.UTC);
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node == null ? null : node.get(field);
        return value == null || value.isNull() ? "" : value.asText("").trim();
    }

    private String humanize(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String lower = value.toLowerCase(Locale.CANADA).replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private String firstNonBlank(String first, String fallback) {
        return first == null || first.isBlank() ? fallback : first;
    }

    private String sourceSuffix(String sourceSystem) {
        return MetrolinxSourceSystem.UP_GTFS_ALERTS.equals(sourceSystem) ? "up" : "go";
    }

    private String safeId(String sourceId) {
        String sanitized = sourceId == null ? "unknown" : sourceId.replaceAll("[^A-Za-z0-9_-]", "-");
        return sanitized.isBlank() ? "unknown" : sanitized;
    }
}
